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
import { ReservationQuote, ReservationQuoteStatus } from '../models/ReservationQuote';
import { processInboundEmailNL, InboundProcessResult } from './inboundQuoteEngine';

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

async function getGraphToken(): Promise<string> {
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
 * Detect customer replies: for recent priced rows whose thread we know, check
 * the conversation for a message from the customer that is newer than the
 * original reservation email, and stamp responded_at. Best-effort, fail-soft.
 */
export async function refreshReservationReplies(opts: { lookbackHours?: number; mailbox?: string } = {}): Promise<{ checked: number; newly_responded: number }> {
  const lookbackHours = opts.lookbackHours ?? 168;
  const mailbox = opts.mailbox ?? DEFAULT_MAILBOX;
  const { Op } = await import('sequelize');
  const since = new Date(Date.now() - lookbackHours * 3600 * 1000);
  const rows = await ReservationQuote.findAll({
    where: { mailbox, conversation_id: { [Op.ne]: null }, responded_at: null, received_at: { [Op.gte]: since } } as any,
  });
  if (rows.length === 0) return { checked: 0, newly_responded: 0 };

  const token = await getGraphToken();
  let newly = 0;
  for (const rq of rows) {
    try {
      const filter = encodeURIComponent(`conversationId eq '${rq.conversation_id}'`);
      const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages?$filter=${filter}&$select=from,receivedDateTime&$orderby=receivedDateTime desc&$top=15`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) continue;
      const data = (await r.json()) as { value?: any[] };
      const origAt = rq.received_at ? new Date(rq.received_at).getTime() : 0;
      const cust = (rq.from_email || '').toLowerCase();
      let respAt: string | null = null;
      for (const m of data.value || []) {
        const fromAddr = (m.from?.emailAddress?.address || '').toLowerCase();
        const t = m.receivedDateTime ? new Date(m.receivedDateTime).getTime() : 0;
        if (fromAddr && fromAddr === cust && t > origAt) { respAt = m.receivedDateTime; break; }
      }
      if (respAt) { await rq.update({ responded_at: new Date(respAt) } as any); newly++; }
    } catch { /* skip this row, non-fatal */ }
  }
  logger.info('reservation replies refreshed', { checked: rows.length, newly_responded: newly });
  return { checked: rows.length, newly_responded: newly };
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
  // Engine appends a warning when miles are unknown (concierge must fill in) and
  // for DOT/approval/overnight/dead-leg complications.
  const needsHuman = /mile|concierge|approval|overnight|dead\s?leg|second driver|2nd driver|compliance|over\s?10|per diem/.test(warns);

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

export interface IngestCounts {
  fetched: number; created: number; skipped_existing: number;
  auto_ready: number; needs_review: number; forward: number; manual: number; errors: number;
}

/**
 * Fetch -> price -> persist. Idempotent by Graph message id. `fetcher` is
 * injectable for tests; defaults to the live Graph fetch.
 */
export async function ingestReservationQuotes(opts: {
  lookbackHours?: number;
  mailbox?: string;
  fetcher?: (lookbackHours: number, mailbox: string) => Promise<RawReservationEmail[]>;
} = {}): Promise<IngestCounts> {
  const lookbackHours = opts.lookbackHours ?? 72;
  const mailbox = opts.mailbox ?? DEFAULT_MAILBOX;
  const fetcher = opts.fetcher ?? fetchReservationEmails;

  const emails = await fetcher(lookbackHours, mailbox);
  const counts: IngestCounts = { fetched: emails.length, created: 0, skipped_existing: 0, auto_ready: 0, needs_review: 0, forward: 0, manual: 0, errors: 0 };

  for (const e of emails) {
    try {
      const existing = await ReservationQuote.findOne({ where: { graph_message_id: e.id }, attributes: ['id'] });
      if (existing) { counts.skipped_existing++; continue; }

      const result = await processInboundEmailNL(e.body, e.from || undefined);
      const { confidence, status } = deriveConfidenceAndStatus(result);
      const total = result.quote ? result.quote.grand_total : null;

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

  // Best-effort reply detection so the queue shows what has been responded to.
  await refreshReservationReplies({ lookbackHours: Math.max(lookbackHours, 72), mailbox }).catch((e) => {
    logger.warn('reservation reply refresh failed (non-fatal)', { error: (e as Error).message });
  });

  logger.info('reservation quote ingest complete', { mailbox, ...counts });
  return counts;
}

/** Compose the customer-facing quote reply from a stored ReservationQuote. */
export function composeQuoteReply(rq: ReservationQuote): { subject: string; text: string } {
  const r = (rq.result || {}) as { trip?: any; quote?: any };
  const trip = r.trip || {};
  const q = r.quote || {};
  const total = q.grand_total != null ? `$${Number(q.grand_total).toFixed(2)}` : 'to be confirmed';
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
export async function sendReservationQuote(id: number): Promise<{ sent: boolean; dry: boolean; to: string | null; draft: { subject: string; text: string } }> {
  const rq = await ReservationQuote.findByPk(id);
  if (!rq) throw new Error('Reservation quote not found');
  if (rq.status === 'manual' || rq.status === 'forward') {
    throw new Error(`Cannot send a ${rq.status} reservation (no priced quote)`);
  }
  const draft = composeQuoteReply(rq);
  const live = process.env.RESERVATION_SEND_ENABLED === 'true';
  const to = rq.from_email;

  if (!live) {
    const result = { ...((rq.result as Record<string, unknown>) || {}), prepared: { at: new Date().toISOString(), to } };
    await rq.update({ result } as any);
    return { sent: false, dry: true, to, draft };
  }

  const token = await getGraphToken();
  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(rq.mailbox)}/messages/${rq.graph_message_id}/reply`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ comment: draft.text }) },
  );
  if (!resp.ok) throw new Error(`Graph reply ${resp.status}: ${(await resp.text()).slice(0, 160)}`);
  const result = { ...((rq.result as Record<string, unknown>) || {}), sent: { at: new Date().toISOString(), to } };
  await rq.update({ result } as any);
  logger.info('reservation quote sent', { id, to });
  return { sent: true, dry: false, to, draft };
}
