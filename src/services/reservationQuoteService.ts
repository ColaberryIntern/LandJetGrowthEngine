/**
 * reservationQuoteService.ts
 * Auto-ingest the booking mailbox (ljreservations@landjet.com) and price every
 * inbound BookRides reservation email with the existing quote engine, 24/7.
 *
 * This is Percy's #1 ask: tie the quote engine to the mailbox so it runs around
 * the clock and removes the manual-quoting FTE. Each email becomes a
 * ReservationQuote row (the quote that WOULD have gone out), scored by
 * confidence so simple trips can auto-send and complex ones route to a human.
 *
 * FAILURE MODES (BUILD-BREAK-HARDEN):
 *  - Graph/token down -> fetch throws; the caller (cron) logs non-fatal, no rows lost.
 *  - One malformed email -> caught per-email; the batch continues (counts.errors++).
 *  - Same email seen twice (retry / overlapping cron) -> deduped by graph_message_id (idempotent).
 *  - Unparseable / non-BookRides email -> stored as mode='manual', confidence 0, status='manual'.
 *  - Unknown market / missing miles -> stored as needs_review so a human prices it.
 * No outbound is sent here; this only reads + prices + persists.
 */
import { logger } from '../config/logger';
import { ReservationQuote, ReservationQuoteStatus, ReservationLifecycle } from '../models/ReservationQuote';
import { processInboundEmailNL, priceTripResult, InboundProcessResult } from './inboundQuoteEngine';
import { roadMilesBetween } from './googleDistance';
import { classifyInboundIntent, classifyOutboundIntent, InboundIntent } from './inboundIntent';
import { isNonQuoteEmail, isPostBookingEmail, missingForQuote, firstDateInText, looksLikeReservationCandidate } from './reservationClassify';
import { lookupClassifierDecision } from './reservationClassifierRules';
import { auditAction } from './auditLogService';

const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID || '';
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET || '';
const OAUTH_TENANT_ID = process.env.OAUTH_TENANT_ID || '';
const DEFAULT_MAILBOX = process.env.RESERVATION_MAILBOX || 'ljreservations@landjet.com';

export interface RawReservationEmail {
  id: string;
  subject: string | null;
  from: string | null;
  receivedDateTime: string | null;
  body: string;
  conversationId: string | null;
}

export async function getGraphToken(): Promise<string> {
  if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET || !OAUTH_TENANT_ID) {
    throw new Error('Microsoft Graph OAuth env not configured (OAUTH_CLIENT_ID/SECRET/TENANT_ID)');
  }
  const resp = await fetch(`https://login.microsoftonline.com/${OAUTH_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });
  const data = (await resp.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('Failed to get Graph token');
  return data.access_token;
}

/** Strip an HTML email body down to plain text the BookRides parser can read. */
export function htmlToText(html: string): string {
  return (html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Pull recent messages (full body) from the reservation mailbox via Graph. */
export async function fetchReservationEmails(
  lookbackHours = 72,
  mailbox = DEFAULT_MAILBOX,
  top = 50,
): Promise<RawReservationEmail[]> {
  const token = await getGraphToken();
  const sinceIso = new Date(Date.now() - lookbackHours * 3600 * 1000).toISOString();
  const url =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/mailFolders/inbox/messages` +
    `?$top=${top}&$select=id,subject,from,receivedDateTime,body,conversationId&$orderby=receivedDateTime desc` +
    `&$filter=receivedDateTime ge ${sinceIso}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Graph fetch ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const data = (await r.json()) as { value?: any[] };
  return (data.value || []).map((m) => ({
    id: m.id,
    subject: m.subject || null,
    from: m.from?.emailAddress?.address || null,
    receivedDateTime: m.receivedDateTime || null,
    body: m.body?.contentType === 'html' ? htmlToText(m.body?.content || '') : (m.body?.content || ''),
    conversationId: m.conversationId || null,
  }));
}

/**
 * Concatenate the FULL text of every message in a conversation (oldest first)
 * so trip details that are spread across the thread -- a pickup given in the
 * first email, a dropoff added two replies later -- are all visible to the
 * extractor. Capped to keep the prompt bounded. Fail-soft: returns null.
 */
export async function fetchConversationText(mailbox: string, conversationId: string, maxChars = 14000): Promise<string | null> {
  try {
    const token = await getGraphToken();
    const filter = encodeURIComponent(`conversationId eq '${conversationId}'`);
    // NOTE: Graph rejects $orderby together with a conversationId $filter
    // (400 InefficientFilter), so we sort in code instead.
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages?$filter=${filter}&$select=from,receivedDateTime,body&$top=30`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const data = (await r.json()) as { value?: any[] };
    const sorted = (data.value || []).slice().sort((a, b) =>
      new Date(a.receivedDateTime || 0).getTime() - new Date(b.receivedDateTime || 0).getTime());
    const parts: string[] = [];
    for (const m of sorted) {
      const who = m.from?.emailAddress?.address || 'unknown';
      const body = m.body?.contentType === 'html' ? htmlToText(m.body?.content || '') : (m.body?.content || '');
      if (body.trim()) parts.push(`From ${who} (${m.receivedDateTime || ''}):\n${body.trim()}`);
    }
    if (parts.length === 0) return null;
    const joined = parts.join('\n\n----\n\n');
    return joined.length > maxChars ? joined.slice(0, maxChars) : joined;
  } catch (e) {
    logger.warn('fetchConversationText failed (non-fatal)', { mailbox, error: (e as Error).message });
    return null;
  }
}

/** An address is "ours" (LandJet) if it is on the landjet.com domain. */
export function isOurAddress(addr: string): boolean {
  return /@landjet\.com\s*$/i.test((addr || '').trim());
}

export interface ThreadMsg { from: string; t: number; preview?: string }

export interface LifecycleDecision {
  lifecycle?: ReservationLifecycle;
  our_reply_at?: number;
  responded_at?: number;
  last_inbound_intent?: InboundIntent;
  resolved_at?: number | null; // number = set, null = clear, undefined = leave as-is
}

/**
 * Decide the lifecycle + reply timestamps for a thread from its messages.
 * Pure (no I/O) so it is unit-testable.
 *
 * The last message decides who owes the next move:
 *  - last from us                          -> awaiting_customer
 *  - last from customer, but a sign-off    -> completed (auto-resolved; we handled
 *    ("thanks, sounds great") after we replied   it and they signed off)
 *  - last from customer, anything else     -> needs_reply
 * If a new substantive customer message arrives after a sign-off, it recomputes
 * to needs_reply and the resolution is cleared (it re-opens).
 *
 * Never overrides a MANUAL resolution (booked/closed) -- the caller filters those out.
 */
export function decideLifecycleFromThread(
  msgs: ThreadMsg[],
  origAt: number,
  current: { lifecycle: string; our_reply_at: number | null; responded_at: number | null; resolved_at?: number | null },
): LifecycleDecision {
  const sorted = msgs.filter((m) => m.from && m.t).sort((a, b) => a.t - b.t);
  if (sorted.length === 0) return {};
  const latest = sorted[sorted.length - 1];
  const lastOurs = [...sorted].reverse().find((m) => isOurAddress(m.from));
  const lastCust = [...sorted].reverse().find((m) => !isOurAddress(m.from) && m.t > origAt);
  const latestCustomer = [...sorted].reverse().find((m) => !isOurAddress(m.from));

  const latestIsOurs = isOurAddress(latest.from);
  const intent: InboundIntent = latestIsOurs ? 'other' : classifyInboundIntent(latest.preview || '');

  let newLifecycle: ReservationLifecycle;
  if (latestIsOurs) {
    // We sent the last message. If it was a courtesy close with nothing pending,
    // there is no more work to do -> resolved. Otherwise the ball is in their court.
    newLifecycle = classifyOutboundIntent(latest.preview || '') === 'closing' ? 'completed' : 'awaiting_customer';
  } else if (intent === 'gratitude' && lastOurs) {
    newLifecycle = 'completed'; // customer signed off after we handled it
  } else {
    newLifecycle = 'needs_reply';
  }

  const out: LifecycleDecision = {};
  if (current.lifecycle !== newLifecycle) out.lifecycle = newLifecycle;
  if (lastOurs && (!current.our_reply_at || current.our_reply_at < lastOurs.t)) out.our_reply_at = lastOurs.t;
  if (lastCust && (!current.responded_at || current.responded_at < lastCust.t)) out.responded_at = lastCust.t;
  if (latestCustomer) out.last_inbound_intent = classifyInboundIntent(latestCustomer.preview || '');

  if (newLifecycle === 'completed') {
    // Stamp resolved_at on first entry; keep it stable on subsequent passes.
    if (current.lifecycle !== 'completed' || !current.resolved_at) out.resolved_at = latest.t;
  } else if (current.resolved_at != null) {
    out.resolved_at = null; // back to active -> clear the resolution
  }
  return out;
}

/**
 * Is this a real quote request that cannot be priced yet because details are
 * missing? Such rows are outstanding work and belong in Needs reply (per Ali),
 * not Awaiting/Resolved. `result`/`total` overrides let callers test freshest data.
 */
export function isIncompleteRequest(
  rq: ReservationQuote,
  result?: Record<string, unknown> | null,
  total?: string | number | null,
): boolean {
  if (rq.lifecycle === 'not_quote') return false;
  const t = total !== undefined ? total : rq.quote_total;
  if (t != null) return false; // already priced -> complete
  const res = (result ?? rq.result) as any;
  const trip = res?.trip;
  const looksLikeRequest = res?.source === 'nl' || Boolean(trip?.pickup_address || trip?.dropoff_address) || rq.status === 'needs_review';
  return looksLikeRequest && missingForQuote(trip).length > 0;
}

/**
 * Re-read the whole thread and re-price, so an incomplete request that the
 * customer has since completed (gave the date / passengers) clears its "Missing"
 * flag. Returns the row patch if it improved (more complete or now priced), else null.
 */
async function reextractIntoRow(rq: ReservationQuote): Promise<Record<string, unknown> | null> {
  if (!rq.conversation_id) return null;
  const threadText = await fetchConversationText(rq.mailbox, rq.conversation_id);
  if (!threadText) return null;
  // Include the subject (dates/route are often there) when re-extracting.
  const text = rq.subject ? `Subject: ${rq.subject}\n\n${threadText}` : threadText;
  let result = await processInboundEmailNL(text, rq.from_email || undefined);
  result = await enrichWithDistance(result, text, rq.from_email || undefined);
  if (result.trip && !result.trip.date_of_service) {
    const d = firstDateInText(text);
    if (d) result.trip.date_of_service = d;
  }
  const oldMissing = missingForQuote((rq.result as any)?.trip).length;
  const newMissing = missingForQuote(result.trip).length;
  const nowPriced = Boolean(result.quote && result.quote.grand_total > 0);
  if (!nowPriced && newMissing >= oldMissing) return null; // no improvement -> leave as-is
  const { confidence, status } = deriveConfidenceAndStatus(result);
  return {
    market: result.market || rq.market,
    quote_total: result.quote ? result.quote.grand_total : rq.quote_total,
    confidence, status,
    result: result as unknown as Record<string, unknown>,
  };
}

/** Public single-row re-extraction (used by feedback "the trip is wrong"). */
export async function reprocessReservationFromThread(id: number): Promise<boolean> {
  const rq = await ReservationQuote.findByPk(id);
  if (!rq) return false;
  const patch = await reextractIntoRow(rq);
  if (!patch) return false;
  await rq.update(patch as any);
  return true;
}

/**
 * Reconcile each thread's lifecycle from its ACTUAL state -- who sent the last
 * message -- so the queue is right even when staff reply directly from Outlook
 * (outside the app's Send button):
 *   last message is from us       -> awaiting_customer (we answered; their move)
 *   last message is from customer -> needs_reply       (they are waiting on us)
 * Also stamps our_reply_at (last reply we sent) and responded_at (last customer
 * message). Resolved rows (booked/closed) are never touched. Best-effort, fail-soft.
 */
export async function refreshReservationReplies(opts: { lookbackHours?: number; mailbox?: string } = {}): Promise<{ checked: number; newly_responded: number }> {
  const lookbackHours = opts.lookbackHours ?? 168;
  const mailbox = opts.mailbox ?? DEFAULT_MAILBOX;
  const { Op } = await import('sequelize');
  const since = new Date(Date.now() - lookbackHours * 3600 * 1000);
  const rows = await ReservationQuote.findAll({
    where: {
      mailbox,
      conversation_id: { [Op.ne]: null },
      // Don't reconcile manual resolutions, non-quotes, or deleted rows.
      lifecycle: { [Op.notIn]: ['booked', 'closed', 'not_quote'] },
      deleted_at: null,
      received_at: { [Op.gte]: since },
    } as any,
  });
  if (rows.length === 0) return { checked: 0, newly_responded: 0 };

  const token = await getGraphToken();
  let changed = 0;
  for (const rq of rows) {
    try {
      const filter = encodeURIComponent(`conversationId eq '${rq.conversation_id}'`);
      // No $orderby with a conversationId $filter (Graph 400 InefficientFilter); sort below.
      // bodyPreview lets us classify the customer's latest message intent cheaply.
      const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages?$filter=${filter}&$select=from,receivedDateTime,bodyPreview&$top=25`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) continue;
      const data = (await r.json()) as { value?: any[] };
      const msgs: ThreadMsg[] = (data.value || []).map((m) => ({
        from: (m.from?.emailAddress?.address || '').toLowerCase(),
        t: m.receivedDateTime ? new Date(m.receivedDateTime).getTime() : 0,
        preview: m.bodyPreview || '',
      }));
      const origAt = rq.received_at ? new Date(rq.received_at).getTime() : 0;
      const decision = decideLifecycleFromThread(msgs, origAt, {
        lifecycle: rq.lifecycle,
        our_reply_at: rq.our_reply_at ? new Date(rq.our_reply_at).getTime() : null,
        responded_at: rq.responded_at ? new Date(rq.responded_at).getTime() : null,
        resolved_at: rq.resolved_at ? new Date(rq.resolved_at).getTime() : null,
      });

      const patch: Record<string, unknown> = {};
      // Timestamps + intent always refresh (they are facts about the thread).
      if (decision.our_reply_at) patch.our_reply_at = new Date(decision.our_reply_at);
      if (decision.responded_at) patch.responded_at = new Date(decision.responded_at);
      if (decision.last_inbound_intent && decision.last_inbound_intent !== rq.last_inbound_intent) patch.last_inbound_intent = decision.last_inbound_intent;

      // If the operator set the lifecycle by hand, respect it until NEW activity
      // arrives in the thread (a message newer than the manual change). No auto
      // lifecycle/resolved/incomplete override while the manual lock holds.
      const latestT = msgs.reduce((mx, m) => Math.max(mx, m.t), 0);
      const manualAt = rq.manual_lifecycle_at ? new Date(rq.manual_lifecycle_at).getTime() : 0;
      const manualLocked = manualAt > 0 && latestT <= manualAt;

      if (!manualLocked) {
        if (manualAt > 0) patch.manual_lifecycle_at = null; // new activity -> release the lock, resume auto
        if (decision.lifecycle) patch.lifecycle = decision.lifecycle;
        if (decision.resolved_at !== undefined) patch.resolved_at = decision.resolved_at === null ? null : new Date(decision.resolved_at);

        // When the customer just replied on an INCOMPLETE request, they may have
        // supplied the missing info -- re-read the whole thread and re-price so the
        // "Missing" flag clears if it is now complete.
        if (decision.responded_at !== undefined && isIncompleteRequest(rq)) {
          const reproc = await reextractIntoRow(rq);
          if (reproc) Object.assign(patch, reproc);
        }

        // An incomplete quote request is OUTSTANDING work: it belongs in Needs reply
        // (per Ali), not Awaiting/Resolved, until we have enough to quote it.
        const effectiveTotal = patch.quote_total !== undefined ? patch.quote_total : rq.quote_total;
        const effectiveResult = (patch.result as any) || rq.result;
        if (isIncompleteRequest(rq, effectiveResult, effectiveTotal as any)) {
          if (rq.lifecycle !== 'needs_reply' || patch.lifecycle) patch.lifecycle = 'needs_reply';
          if (rq.resolved_at != null || patch.resolved_at) patch.resolved_at = null;
        }
      }

      if (Object.keys(patch).length > 0) { await rq.update(patch as any); changed++; }
    } catch { /* skip this row, non-fatal */ }
  }
  logger.info('reservation lifecycle reconciled from threads', { checked: rows.length, changed });
  return { checked: rows.length, newly_responded: changed };
}

/**
 * Confidence + status from a pricing result. Encodes Percy's rule: simple trips
 * score high (auto-send candidates); incomplete/complex ones go to a human.
 *  - forward-only market           -> forward (0)
 *  - not a parseable quote         -> manual (0)
 *  - flat-rate route, no flags     -> 0.90 auto_ready (deterministic price)
 *  - priced, total>0, no flags     -> 0.70 auto_ready
 *  - incomplete (miles unknown) or complex (overnight/dead leg/approval/...) -> needs_review
 */
export function deriveConfidenceAndStatus(
  result: InboundProcessResult,
): { confidence: number; status: ReservationQuoteStatus } {
  if (result.mode === 'forward_only') return { confidence: 0, status: 'forward' };

  // LLM-extracted (free-form) trips always go to a human to verify the AI read
  // the request correctly. A priced one is a strong needs_review; one we
  // understood as a booking but could not route surfaces with its details too.
  if (result.source === 'nl') {
    if (result.mode === 'priced' && result.quote) return { confidence: 0.5, status: 'needs_review' };
    if (result.trip) return { confidence: 0.3, status: 'needs_review' };
    return { confidence: 0, status: 'manual' };
  }

  if (result.mode !== 'priced' || !result.quote) return { confidence: 0, status: 'manual' };

  const q = result.quote;
  const warns = (q.warnings || []).join(' ').toLowerCase();
  // Flag genuinely-complex / incomplete quotes for a human. Specific patterns
  // only -- NOT bare "mile"/"concierge", which appear in the routine flat-rate
  // fuel-surcharge note and were false-flagging clean quotes as needs_review.
  const needsHuman = /overnight|dead\s?leg|second driver|2nd driver|over\s?10|per diem|needs? approval|approval (required|needed)|actual 0 mi|minimum [\d.]+ mi applied|compliance/.test(warns);

  if (q.pricing_mode === 'flat_rate' && !needsHuman) return { confidence: 0.9, status: 'auto_ready' };
  if (!needsHuman && q.grand_total > 0) return { confidence: 0.7, status: 'auto_ready' };
  return { confidence: needsHuman ? 0.4 : 0.5, status: 'needs_review' };
}

/**
 * Trust-Before-Intelligence gate (GOALS - Lexicon: "below the confidence
 * threshold, request clarification / hand to a human rather than guess").
 * The agent may only ever auto-send a quote at or above this confidence; every
 * thing below stays human-reviewed. A person clicking Send in the queue is a
 * separate, explicit human decision and is not bound by this gate.
 */
export const AUTOSEND_MIN_CONFIDENCE = 0.9;
export function autoSendEligible(rq: { status: string; confidence: string | number }): boolean {
  return rq.status === 'auto_ready' && Number(rq.confidence) >= AUTOSEND_MIN_CONFIDENCE;
}

/**
 * Aggregate metrics for the quote-engine dashboard (GOALS - Observability).
 * All counts come from reservation_quotes; no user input, fixed SQL.
 */
export async function getReservationMetrics(): Promise<Record<string, unknown>> {
  const seq = ReservationQuote.sequelize!;
  const q = async (sql: string) => (await seq.query(sql))[0] as any[];

  const [byStatus, bySource, byMarket, byService, funnelRows, confRows] = await Promise.all([
    q(`SELECT status, count(*)::int n, round(avg(confidence),2)::float avg_conf, coalesce(round(sum(quote_total),2),0)::float value FROM reservation_quotes GROUP BY status ORDER BY n DESC`),
    q(`SELECT coalesce(result->>'source','unparsed') source, count(*)::int n FROM reservation_quotes GROUP BY 1 ORDER BY n DESC`),
    q(`SELECT coalesce(market,'(unknown)') market, count(*)::int n FROM reservation_quotes GROUP BY 1 ORDER BY n DESC LIMIT 8`),
    q(`SELECT coalesce(result->'quote'->>'service_type','(n/a)') service_type, count(*)::int n FROM reservation_quotes GROUP BY 1 ORDER BY n DESC`),
    q(`SELECT count(*)::int total,
              count(*) FILTER (WHERE result->'prepared' IS NOT NULL OR result->'sent' IS NOT NULL)::int quoted,
              count(*) FILTER (WHERE result->'sent' IS NOT NULL)::int sent,
              count(responded_at)::int replied,
              coalesce(round(sum(quote_total),2),0)::float total_value
       FROM reservation_quotes`),
    q(`SELECT count(*) FILTER (WHERE confidence >= 0.9)::int high,
              count(*) FILTER (WHERE confidence >= 0.5 AND confidence < 0.9)::int mid,
              count(*) FILTER (WHERE confidence > 0 AND confidence < 0.5)::int low,
              count(*) FILTER (WHERE confidence = 0)::int none
       FROM reservation_quotes`),
  ]);

  return {
    by_status: byStatus,
    by_source: bySource,
    by_market: byMarket,
    by_service: byService,
    funnel: funnelRows[0] || { total: 0, quoted: 0, sent: 0, replied: 0, total_value: 0 },
    confidence: confRows[0] || { high: 0, mid: 0, low: 0, none: 0 },
    autosend_threshold: AUTOSEND_MIN_CONFIDENCE,
  };
}

/**
 * If a priced trip used distance pricing with no miles (concierge-fill), look up
 * real road miles (Google Distance Matrix, gated on the key) and re-price. Turns
 * "needs_review (miles unknown)" into a complete quote that can clear the 0.90
 * auto-send bar. No-op when no key / no addresses / not a distance trip.
 */
async function enrichWithDistance(result: InboundProcessResult, emailBody: string, senderEmail?: string): Promise<InboundProcessResult> {
  if (result.mode !== 'priced' || !result.quote || !result.trip) return result;
  if (result.quote.pricing_mode !== 'distance') return result; // flat/hourly/forward need no miles
  const trip = result.trip;
  if (!trip.pickup_address || !trip.dropoff_address) return result;
  const oneWay = await roadMilesBetween(trip.pickup_address, trip.dropoff_address);
  if (!oneWay || oneWay <= 0) return result;
  const miles = /round/i.test(trip.service_type || '') ? oneWay * 2 : oneWay;
  const repriced = priceTripResult(trip, emailBody, senderEmail, result.source || 'bookrides', { passengerMiles: miles });
  return repriced.mode === 'priced' ? repriced : result;
}

export interface IngestCounts {
  fetched: number; created: number; skipped_existing: number;
  auto_ready: number; needs_review: number; forward: number; manual: number; errors: number;
  filtered: number; // non-booking emails skipped on a general mailbox (onlyBookings)
}

/**
 * Is this processed email an actual trip/quote request worth surfacing in the
 * reservations queue? Used to filter noise when we ingest a GENERAL mailbox
 * (e.g. rlandry@) instead of the dedicated booking mailbox. A dedicated
 * reservation inbox persists everything; a general inbox persists only requests.
 */
export function isBookingIntent(r: InboundProcessResult): boolean {
  if (r.mode === 'priced' || r.mode === 'forward_only') return true;
  // NL recognized a real trip but could not route/price it (e.g. unknown town):
  // still a genuine request a human should answer.
  if (r.source === 'nl' && r.trip && (r.trip.pickup_address || r.trip.dropoff_address)) return true;
  return false;
}

// In-process memory of GENERAL-mailbox message ids the LLM already judged NOT a
// booking. Such emails are never persisted, so the DB dedup (graph_message_id)
// cannot skip them -- which previously caused the SAME email to be re-extracted
// every ~10-minute ingest cycle for 72h, the dominant LLM cost ($100/8 days).
// Bounded; cleared on restart (a message is then re-examined at most once).
const _seenNonBooking = new Set<string>();
function rememberNonBooking(id: string): void {
  if (!id) return;
  if (_seenNonBooking.size >= 20000) _seenNonBooking.clear();
  _seenNonBooking.add(id);
}

/**
 * Fetch -> price -> persist. Idempotent by Graph message id. `fetcher` is
 * injectable for tests; defaults to the live Graph fetch.
 */
export async function ingestReservationQuotes(opts: {
  lookbackHours?: number;
  mailbox?: string;
  onlyBookings?: boolean; // general mailboxes (rlandry@, percy@): persist only real requests, skip noise
  fetcher?: (lookbackHours: number, mailbox: string) => Promise<RawReservationEmail[]>;
} = {}): Promise<IngestCounts> {
  const lookbackHours = opts.lookbackHours ?? 72;
  const mailbox = opts.mailbox ?? DEFAULT_MAILBOX;
  const onlyBookings = opts.onlyBookings ?? false;
  const fetcher = opts.fetcher ?? fetchReservationEmails;

  const emails = await fetcher(lookbackHours, mailbox);
  const counts: IngestCounts = { fetched: emails.length, created: 0, skipped_existing: 0, auto_ready: 0, needs_review: 0, forward: 0, manual: 0, errors: 0, filtered: 0 };

  for (const e of emails) {
    try {
      const existing = await ReservationQuote.findOne({ where: { graph_message_id: e.id }, attributes: ['id'] });
      if (existing) { counts.skipped_existing++; continue; }

      // COST GUARD -- general mailboxes only (rlandry@, percy@). A normal email
      // in Ryan's/Percy's inbox must never reach the paid LLM. Two cheap checks
      // BEFORE extraction: (1) skip anything with no transportation signal at
      // all; (2) skip a message we already LLM-examined this run and found to be
      // a non-booking. The dedicated booking mailbox (onlyBookings=false) is
      // never pre-filtered, so BookRides requests always flow through.
      if (onlyBookings) {
        if (!looksLikeReservationCandidate(e.from, e.subject, e.body)) { counts.filtered++; continue; }
        if (_seenNonBooking.has(e.id)) { counts.skipped_existing++; continue; }
      }

      // Include the SUBJECT in the text we extract from -- dates and routes are
      // often there ("LandJet ... 6/29/26 & 7/14/26") and the body alone misses them.
      const extractText = e.subject ? `Subject: ${e.subject}\n\n${e.body}` : e.body;
      let result = await processInboundEmailNL(extractText, e.from || undefined);

      // The latest message alone may not carry a full route (the customer gave
      // the pickup in an earlier email, the dropoff in a later one). If we could
      // not assemble both addresses and we know the thread, re-run extraction on
      // the ENTIRE conversation history. Only adopt the retry if it actually
      // produced a routable trip, so this can only improve a result.
      const hasRoute = Boolean(result.trip?.pickup_address && result.trip?.dropoff_address);
      if (!hasRoute && e.conversationId) {
        const threadText = await fetchConversationText(mailbox, e.conversationId);
        if (threadText && threadText.length > (e.body || '').length) {
          const threadWithSubject = e.subject ? `Subject: ${e.subject}\n\n${threadText}` : threadText;
          const retry = await processInboundEmailNL(threadWithSubject, e.from || undefined);
          if (retry.trip?.pickup_address && retry.trip?.dropoff_address) result = retry;
        }
      }
      result = await enrichWithDistance(result, extractText, e.from || undefined);

      // Date fallback: BookRides puts "Date Of Service" in the body, but on reply
      // threads the date often survives only in the subject ("...6/29/26 & 7/14/26").
      // If the parsed trip has no date, take the first one from the subject/body.
      if (result.trip && !result.trip.date_of_service) {
        const d = firstDateInText(extractText);
        if (d) result.trip.date_of_service = d;
      }

      // On a general inbox, only persist genuine trip/quote requests so the
      // reservations queue is not flooded with replies, newsletters, and other
      // non-booking mail. The dedicated booking mailbox keeps everything.
      if (onlyBookings && !isBookingIntent(result)) { counts.filtered++; rememberNonBooking(e.id); continue; }

      const { confidence, status } = deriveConfidenceAndStatus(result);
      const total = result.quote ? result.quote.grand_total : null;

      // Keep inbox noise out of the active queue. A LEARNED rule from a human
      // correction wins first (the system got told once), then post-booking
      // notices (invoice/receipt/confirmation), then the noise heuristic.
      const isQuote = isBookingIntent(result) || total != null;
      const learned = await lookupClassifierDecision(e.from);
      const lifecycle = learned === 'not_quote' ? 'not_quote'
        : learned === 'quote' ? 'needs_reply'
        : isPostBookingEmail(e.subject, e.body) ? 'not_quote'
        : (!isQuote && isNonQuoteEmail(e.from, e.subject, e.body)) ? 'not_quote'
        : 'needs_reply';

      await ReservationQuote.create({
        graph_message_id: e.id,
        mailbox,
        subject: e.subject,
        from_email: e.from,
        received_at: e.receivedDateTime ? new Date(e.receivedDateTime) : null,
        raw_body: e.body,
        mode: result.mode,
        market: result.market || null,
        quote_total: total,
        confidence,
        status,
        lifecycle,
        result: result as unknown as Record<string, unknown>,
        conversation_id: e.conversationId,
      } as any);

      counts.created++;
      counts[status]++;
    } catch (err) {
      counts.errors++;
      logger.error('reservation ingest failed for one email (non-fatal)', { id: e.id, error: (err as Error).message });
    }
  }

  // Reconcile lifecycle from thread state (who replied last) for ~3 weeks of
  // rows, so the queue is correct even when staff reply from Outlook directly.
  await refreshReservationReplies({ lookbackHours: Math.max(lookbackHours, 504), mailbox }).catch((e) => {
    logger.warn('reservation reply refresh failed (non-fatal)', { error: (e as Error).message });
  });

  logger.info('reservation quote ingest complete', { mailbox, ...counts });
  return counts;
}

/**
 * Backfill: re-run extraction on the FULL conversation history for existing rows
 * that never got a routable trip (so their map was blank). Only updates a row if
 * the full-thread pass actually produces both addresses, so it cannot regress a
 * good row. Idempotent and safe to re-run.
 */
export async function reprocessMissingRoutes(opts: { limit?: number } = {}): Promise<{ scanned: number; updated: number; skipped: number }> {
  const { Op } = await import('sequelize');
  const limit = opts.limit ?? 200;
  const rows = await ReservationQuote.findAll({
    where: { conversation_id: { [Op.ne]: null } } as any,
    order: [['received_at', 'DESC']],
    limit,
  });
  let updated = 0, skipped = 0, scanned = 0;
  for (const rq of rows) {
    scanned++;
    try {
      const r = (rq.result || {}) as { trip?: any };
      const hasRoute = Boolean(r.trip?.pickup_address && r.trip?.dropoff_address);
      if (hasRoute) { skipped++; continue; }

      const threadText = await fetchConversationText(rq.mailbox, rq.conversation_id as string);
      if (!threadText) { skipped++; continue; }

      let result = await processInboundEmailNL(threadText, rq.from_email || undefined);
      if (!(result.trip?.pickup_address && result.trip?.dropoff_address)) { skipped++; continue; }
      result = await enrichWithDistance(result, threadText, rq.from_email || undefined);

      const { confidence, status } = deriveConfidenceAndStatus(result);
      await rq.update({
        market: result.market || rq.market,
        quote_total: result.quote ? result.quote.grand_total : rq.quote_total,
        confidence, status,
        result: result as unknown as Record<string, unknown>,
      } as any);
      updated++;
    } catch (e) {
      skipped++;
      logger.warn('reprocessMissingRoutes skipped one row (non-fatal)', { id: rq.id, error: (e as Error).message });
    }
  }
  logger.info('reprocessMissingRoutes complete', { scanned, updated, skipped });
  return { scanned, updated, skipped };
}

export interface ConversationMessage {
  id: string;
  from: string | null;
  at: string | null;
  direction: 'inbound' | 'outbound';
  preview: string;
}

/**
 * Pull the full back-and-forth for a reservation's thread so the UI can show a
 * conversation when there were multiple replies. Chronological (oldest first).
 * Fail-soft: returns [] if the thread is unknown or Graph is unavailable.
 */
export async function getConversationThread(id: number): Promise<ConversationMessage[]> {
  const rq = await ReservationQuote.findByPk(id);
  if (!rq || !rq.conversation_id) return [];
  const mailbox = rq.reply_from || rq.mailbox;
  try {
    const token = await getGraphToken();
    const filter = encodeURIComponent(`conversationId eq '${rq.conversation_id}'`);
    // No $orderby with a conversationId $filter (Graph 400 InefficientFilter); sort below.
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages?$filter=${filter}&$select=id,from,receivedDateTime,sentDateTime,body&$top=30`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return [];
    const data = (await r.json()) as { value?: any[] };
    const me = mailbox.toLowerCase();
    return (data.value || [])
      .slice()
      .sort((a, b) => new Date(a.sentDateTime || a.receivedDateTime || 0).getTime() - new Date(b.sentDateTime || b.receivedDateTime || 0).getTime())
      .map((m) => {
      const from = (m.from?.emailAddress?.address || '').toLowerCase() || null;
      const bodyText = m.body?.contentType === 'html' ? htmlToText(m.body?.content || '') : (m.body?.content || '');
      return {
        id: m.id,
        from,
        at: m.sentDateTime || m.receivedDateTime || null,
        direction: (from === me ? 'outbound' : 'inbound') as 'inbound' | 'outbound',
        preview: bodyText.replace(/\n{2,}/g, '\n').slice(0, 600),
      };
    });
  } catch (e) {
    logger.warn('getConversationThread failed (non-fatal)', { id, error: (e as Error).message });
    return [];
  }
}

/** Compose the customer-facing quote reply from a stored ReservationQuote. */
export function composeQuoteReply(rq: ReservationQuote): { subject: string; text: string } {
  const r = (rq.result || {}) as { trip?: any; quote?: any };
  const trip = r.trip || {};
  const q = r.quote || {};
  const total = q.grand_total != null ? `$${Number(q.grand_total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'to be confirmed';
  const name = (trip.passenger_name || '').split(' ')[0] || 'there';
  const route = [trip.pickup_address, trip.dropoff_address].filter(Boolean).join(' to ');
  const subject = rq.subject ? (/^re:/i.test(rq.subject) ? rq.subject : `Re: ${rq.subject}`) : 'Your LandJet quote';
  const text =
    `Hi ${name},\n\n` +
    `Thank you for your reservation request${route ? ` (${route})` : ''}. ` +
    `Your estimated quote is ${total}.\n\n` +
    `Reply to confirm and we will get you booked.\n\nLandJet Reservations`;
  return { subject, text };
}

/**
 * Send (or, by default, DRY-prepare) the quote reply for a reservation.
 * SAFETY: real customer sends only fire when RESERVATION_SEND_ENABLED=true.
 * Until Percy/Lorie validate the quotes, this returns the draft without
 * emailing anyone (sent=false, dry=true) so the 1-click UX is safe to demo.
 */
export async function sendReservationQuote(id: number): Promise<{ sent: boolean; dry: boolean; to: string | null; from: string | null; draft: { subject: string; text: string } }> {
  const rq = await ReservationQuote.findByPk(id);
  if (!rq) throw new Error('Reservation quote not found');
  // Forward-only routes go to the local team, never an auto-reply. A 'manual' row
  // may still be replied to IF the operator drafted one (e.g. a request for the
  // missing details) -- the explicit draft is the go-ahead.
  if (rq.status === 'forward') throw new Error('Cannot send a forward-only reservation (routes to the local team)');
  if (rq.status === 'manual' && !(rq.ai_draft && rq.ai_draft.text)) {
    throw new Error('Cannot send a manual reservation without a reviewed draft');
  }
  // Prefer the reviewed/edited AI draft; fall back to the deterministic template.
  const draft = rq.ai_draft && rq.ai_draft.text
    ? { subject: rq.ai_draft.subject, text: rq.ai_draft.text }
    : composeQuoteReply(rq);
  const live = process.env.RESERVATION_SEND_ENABLED === 'true';
  const to = rq.from_email;
  // Reply FROM the account the request came in on (or an explicit override), so
  // the customer hears back from the same address/voice that received them.
  const from = rq.reply_from || rq.mailbox;

  if (!live) {
    const result = { ...((rq.result as Record<string, unknown>) || {}), prepared: { at: new Date().toISOString(), to, from } };
    await rq.update({ result } as any);
    return { sent: false, dry: true, to, from, draft };
  }

  const token = await getGraphToken();
  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/messages/${rq.graph_message_id}/reply`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ comment: draft.text }) },
  );
  if (!resp.ok) throw new Error(`Graph reply ${resp.status}: ${(await resp.text()).slice(0, 160)}`);
  const now = new Date();
  const result = { ...((rq.result as Record<string, unknown>) || {}), sent: { at: now.toISOString(), to, from } };
  // We replied -> ball is in the customer's court, but the row STAYS in the queue
  // until it is booked or closed.
  await rq.update({ result, our_reply_at: now, lifecycle: 'awaiting_customer' } as any);
  logger.info('reservation quote sent', { id, to, from });
  // Audit the customer-facing send (TBI gap G5): quote sends were previously
  // unaudited despite being a consequential, money-bearing action.
  await auditAction('reservation.quote.send', 'reservation_quote', id, {
    newValue: { to, from, subject: draft.subject, quote_total: rq.quote_total ?? null, status: rq.status },
  });
  return { sent: true, dry: false, to, from, draft };
}

/** Operator action: move a reservation through its lifecycle (e.g. mark booked). */
export async function setReservationLifecycle(id: number, lifecycle: ReservationLifecycle): Promise<ReservationQuote> {
  const rq = await ReservationQuote.findByPk(id);
  if (!rq) throw new Error('Reservation quote not found');
  // Resolved states carry a resolved_at (for newest-first sorting); reopening clears it.
  const resolved = lifecycle === 'booked' || lifecycle === 'closed' || lifecycle === 'completed';
  // Stamp this as an operator decision so the reconcile respects it (and does not
  // auto-flip it back) until new activity arrives in the thread.
  await rq.update({ lifecycle, resolved_at: resolved ? (rq.resolved_at || new Date()) : null, manual_lifecycle_at: new Date() } as any);
  logger.info('reservation lifecycle updated', { id, lifecycle });
  return rq;
}

/** Strip Re:/FW:/[External] prefixes so a forward matches the original subject. */
function normSubjectForDedup(s?: string | null): string {
  let x = (s || '').toLowerCase();
  let prev = '';
  while (x !== prev) { prev = x; x = x.replace(/^\s*(re|fw|fwd|aw)\s*:\s*/i, '').replace(/^\s*\[[^\]]*\]\s*/, ''); }
  return x.replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * A stable identity for a request so duplicates collapse: the BookRides
 * reservation number, else the trip signature, else sender + normalized subject
 * (handles a "FW: June 30th" forward of the same request with no trip details).
 * Mirrors the frontend dedup so the UI and the persistent merge agree.
 */
export function reservationDedupKey(rq: ReservationQuote): string | null {
  const t = (rq.result as any)?.trip || {};
  if (t.reservation_number) return `res:${t.reservation_number}`;
  const norm = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
  const parts = [norm(t.passenger_name), norm(t.pickup_address), norm(t.dropoff_address), norm(t.date_of_service), norm(t.start_time)];
  if (parts.filter(Boolean).length >= 4) return `trip:${parts.join('|')}`;
  const subj = normSubjectForDedup(rq.subject);
  const sender = (rq.from_email || '').toLowerCase();
  if (subj.length >= 4 && sender) return `subj:${sender}|${subj}`;
  return null;
}

/**
 * Persistently merge same-request duplicates on their own (no operator needed).
 * Groups ACTIVE rows by dedup key and absorbs the extras into a canonical (prefer
 * one with a draft, then the most recent -- the forward), via mergeReservations.
 * Idempotent: merged/closed rows are excluded, so re-running is a no-op.
 */
export async function autoMergeDuplicates(opts: { windowDays?: number } = {}): Promise<{ groups: number; merged: number }> {
  const { Op } = await import('sequelize');
  const since = new Date(Date.now() - (opts.windowDays ?? 45) * 86400000);
  const rows = await ReservationQuote.findAll({
    where: {
      deleted_at: null,
      merged_into: null,
      lifecycle: { [Op.in]: ['needs_reply', 'awaiting_customer'] },
      received_at: { [Op.gte]: since },
    } as any,
  });
  const groups = new Map<string, ReservationQuote[]>();
  for (const r of rows) {
    const k = reservationDedupKey(r);
    if (!k) continue;
    (groups.get(k) || groups.set(k, []).get(k)!).push(r);
  }
  let groupCount = 0, mergedCount = 0;
  for (const grp of groups.values()) {
    if (grp.length < 2) continue;
    const sorted = [...grp].sort((a, b) =>
      (Number(Boolean(b.ai_draft)) - Number(Boolean(a.ai_draft))) ||
      (new Date(b.received_at || 0).getTime() - new Date(a.received_at || 0).getTime()) ||
      (b.id - a.id));
    const canon = sorted[0];
    const secondaries = sorted.slice(1).map((r) => r.id);
    try { await mergeReservations(canon.id, secondaries); groupCount++; mergedCount += secondaries.length; }
    catch (e) { logger.warn('auto-merge group failed (non-fatal)', { error: (e as Error).message }); }
  }
  if (mergedCount > 0) logger.info('auto-merge duplicates complete', { groups: groupCount, merged: mergedCount });
  return { groups: groupCount, merged: mergedCount };
}

/**
 * Manually merge reservations: the operator decides several rows are the same
 * person/booking and picks one to keep. The others get a merged_into pointer and
 * are closed so they leave the active queue (the kept row "takes over"). The
 * pointer lets the UI badge them and an unmerge restore them. Idempotent.
 */
export async function mergeReservations(primaryId: number, secondaryIds: number[]): Promise<{ primary: number; merged: number[] }> {
  const primary = await ReservationQuote.findByPk(primaryId);
  if (!primary) throw new Error('Primary reservation not found');
  if (primary.merged_into) throw new Error('Cannot merge into a row that is itself merged');
  const merged: number[] = [];
  for (const id of secondaryIds) {
    if (id === primaryId) continue;
    const rq = await ReservationQuote.findByPk(id);
    if (!rq) continue;
    await rq.update({ merged_into: primaryId, lifecycle: 'closed', resolved_at: rq.resolved_at || new Date() } as any);
    merged.push(id);
  }
  logger.info('reservations merged', { primaryId, merged });
  return { primary: primaryId, merged };
}

/** Undo a merge: detach the row and return it to the active queue. */
export async function unmergeReservation(id: number): Promise<ReservationQuote> {
  const rq = await ReservationQuote.findByPk(id);
  if (!rq) throw new Error('Reservation quote not found');
  await rq.update({ merged_into: null, lifecycle: 'needs_reply', resolved_at: null } as any);
  logger.info('reservation unmerged', { id });
  return rq;
}

/** Soft delete: hide a row from every view (recoverable via restore). */
export async function deleteReservation(id: number): Promise<{ id: number; deleted: boolean }> {
  const rq = await ReservationQuote.findByPk(id);
  if (!rq) throw new Error('Reservation quote not found');
  await rq.update({ deleted_at: new Date() } as any);
  logger.info('reservation soft-deleted', { id });
  return { id, deleted: true };
}

export async function restoreReservation(id: number): Promise<{ id: number; deleted: boolean }> {
  const rq = await ReservationQuote.findByPk(id);
  if (!rq) throw new Error('Reservation quote not found');
  await rq.update({ deleted_at: null } as any);
  logger.info('reservation restored', { id });
  return { id, deleted: false };
}

/** Save an operator-edited draft (keeps the rubric, marks it edited). */
export async function saveReservationDraft(id: number, subject: string, text: string): Promise<ReservationQuote> {
  const rq = await ReservationQuote.findByPk(id);
  if (!rq) throw new Error('Reservation quote not found');
  const prior = rq.ai_draft;
  const ai_draft = {
    subject, text,
    generated_at: prior?.generated_at || new Date().toISOString(),
    model: prior?.model || 'edited',
    edited: true,
    rubric: prior?.rubric || { score: 0, breakdown: {} },
  };
  await rq.update({ ai_draft } as any);
  return rq;
}
