/**
 * Reply ingestion -- detect, VALIDATE, and record genuine replies to our
 * outreach, then advance the lead's pipeline stage to 'replied'.
 *
 * WHY VALIDATION MATTERS (learned 2026-06-20): naively counting "a lead-list
 * address appeared in Ryan's inbox" over-counts badly -- our marketing vendor
 * (TAG Agency), newsletters, charity asks, and internal forwards all match.
 * A reply only counts if BOTH hold:
 *   1. The sender is a lead and is NOT on the deny list (internal + vendor).
 *   2. The thread contains an outbound FROM us TO that lead BEFORE the reply
 *      (i.e. we actually reached out and they answered).
 *
 * communication_logs.inbound was always 0 because nothing ingested inbound
 * mail; this service fills that gap from the Graph mailbox and is the missing
 * "reply write-back" that kept every touched lead stuck at 'contacted'.
 *
 * Idempotent: each inbound message is deduped by its Graph message id
 * (provider_message_id), and the pipeline advance never demotes a lead, so the
 * job is safe to run on a schedule and safe to re-run.
 *
 * Failure modes:
 *   - No Graph creds / mailbox read fails -> returns an empty result, logs a
 *     warning; never throws so a scheduled caller keeps running.
 *   - A single conversation lookup or DB write fails -> that message is skipped
 *     and counted as an error; the rest proceed (bulkhead per message).
 */

import { QueryTypes } from 'sequelize';
import { getSequelize } from '../config/database';
import { CommunicationLog } from '../models/CommunicationLog';
import { Lead, PIPELINE_ORDER } from '../models/Lead';
import { logger } from '../config/logger';

const REPLY_MAILBOX = process.env.WEEKLY_BRIEFING_REPLY_MAILBOX || 'rlandry@landjet.com';

// Addresses that send our outreach. A reply is only "to our outreach" if one of
// these emailed the lead first in the thread.
const OUR_SENDERS = new Set(['rlandry@landjet.com', 'ryan@landjet.com', 'ryan.landry@landjet.com']);

// Domains whose mail is never a prospect reply: internal staff + known vendors.
const DENY_DOMAINS = ['landjet.com', 'landjettexas.com', 'colaberry.com', 'tagteamagency.com'];

// Subjects that are clearly not outreach replies even if we "sent first".
const DENY_SUBJECT_MARKERS = ['landjetter news', 'unsubscribe', 'fundraising', 'charity'];

function domainOf(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1) : '';
}

export function isDenied(email: string, subject: string): boolean {
  if (DENY_DOMAINS.includes(domainOf(email))) return true;
  const s = subject.toLowerCase();
  return DENY_SUBJECT_MARKERS.some((m) => s.includes(m));
}

/**
 * App-only Graph token (client credentials). Duplicated intentionally from the
 * other Graph callers to keep this service self-contained; if a third caller
 * appears, extract a shared graphClient.
 */
async function getGraphToken(): Promise<string | null> {
  const t = process.env.OAUTH_TENANT_ID, c = process.env.OAUTH_CLIENT_ID, s = process.env.OAUTH_CLIENT_SECRET;
  if (!t || !c || !s) return null;
  try {
    const r = await fetch(`https://login.microsoftonline.com/${t}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: c, client_secret: s, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
    });
    if (!r.ok) return null;
    const j = await r.json() as { access_token?: string };
    return j.access_token || null;
  } catch { return null; }
}

interface InboxMsg { id: string; from: string; subject: string; conversationId: string; received: string; body: string; }

async function graphJson(url: string, token: string): Promise<any> {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Graph ${r.status}`);
  return r.json();
}

/** True if the thread has an outbound from us to `leadEmail` before `before`. */
async function weReachedFirst(conversationId: string, leadEmail: string, before: string, token: string): Promise<boolean> {
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(REPLY_MAILBOX)}/messages`
    + `?$filter=${encodeURIComponent(`conversationId eq '${conversationId}'`)}`
    + `&$select=from,toRecipients,sentDateTime&$top=50`;
  const j = await graphJson(url, token);
  for (const m of j.value || []) {
    const f = (m.from?.emailAddress?.address || '').toLowerCase();
    const to = (m.toRecipients || []).map((x: any) => (x.emailAddress?.address || '').toLowerCase());
    if (OUR_SENDERS.has(f) && to.includes(leadEmail) && (m.sentDateTime || '') < before) return true;
  }
  return false;
}

export interface ReplyIngestResult {
  scanned: number;             // inbox messages scanned
  candidates: number;          // messages from a non-denied lead
  validated: number;           // validated reply MESSAGES (a thread can have several)
  distinctResponders: number;  // distinct leads who replied
  newReplies: number;          // inbound rows newly persisted (deduped by message id)
  advanced: number;            // distinct leads advanced contacted -> replied
  errors: number;
  details: Array<{ email: string; subject: string; leadId: number; advanced: boolean; persisted: boolean }>;
}

export async function ingestReplies(opts: { persist?: boolean; sinceDate?: string } = {}): Promise<ReplyIngestResult> {
  const persist = opts.persist === true; // default DRY RUN -- writes only with explicit persist
  const since = opts.sinceDate || '2026-05-01';
  const result: ReplyIngestResult = { scanned: 0, candidates: 0, validated: 0, distinctResponders: 0, newReplies: 0, advanced: 0, errors: 0, details: [] };
  const responders = new Set<number>();   // distinct leads who replied
  const advancedLeads = new Set<number>(); // distinct leads advanced this run

  const token = await getGraphToken();
  if (!token) {
    logger.warn('replyIngestion: no Graph token; skipping');
    return result;
  }

  const sequelize = getSequelize();
  // lead lookup by email (deny domains already excluded at the SQL level)
  const leadRows = await sequelize.query<{ id: number; email: string; pipeline_stage: string; campaign_id: string | null }>(
    `SELECT id, LOWER(email) AS email, pipeline_stage, campaign_id FROM leads
     WHERE email IS NOT NULL
       AND email NOT ILIKE '%@landjet.com'
       AND email NOT ILIKE '%@landjettexas.com'
       AND email NOT ILIKE '%@colaberry.com'
       AND email NOT ILIKE '%@tagteamagency.com'`,
    { type: QueryTypes.SELECT },
  );
  const leadByEmail = new Map(leadRows.map((r) => [r.email, r]));

  // pull inbox messages since `since`
  const msgs: InboxMsg[] = [];
  let url: string | null = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(REPLY_MAILBOX)}/mailFolders/inbox/messages`
    + `?$top=100&$select=id,from,subject,conversationId,receivedDateTime,bodyPreview&$filter=${encodeURIComponent(`receivedDateTime ge ${since}T00:00:00Z`)}`;
  let pages = 0;
  try {
    while (url && pages < 10) {
      const j = await graphJson(url, token);
      for (const m of j.value || []) {
        msgs.push({
          id: m.id,
          from: (m.from?.emailAddress?.address || '').toLowerCase().trim(),
          subject: m.subject || '',
          conversationId: m.conversationId,
          received: m.receivedDateTime || '',
          body: (m.bodyPreview || '').trim(),
        });
      }
      url = j['@odata.nextLink'] || null;
      pages++;
    }
  } catch (e) {
    logger.warn('replyIngestion: inbox read failed', { error: (e as Error).message });
    return result;
  }
  result.scanned = msgs.length;

  for (const m of msgs) {
    const lead = leadByEmail.get(m.from);
    if (!lead || isDenied(m.from, m.subject)) continue;
    result.candidates++;
    try {
      // dedup: already ingested this message?
      const existing = await CommunicationLog.findOne({ where: { provider_message_id: m.id, direction: 'inbound' }, attributes: ['id', 'body'] });
      const already = !!existing;
      const bodyText = m.body ? m.body.slice(0, 2000) : null;

      const valid = await weReachedFirst(m.conversationId, m.from, m.received, token);
      if (!valid) continue;
      result.validated++;
      responders.add(lead.id);

      const detail = { email: m.from, subject: m.subject.slice(0, 60), leadId: lead.id, advanced: false, persisted: false };

      // 1) Record the inbound message (one row per distinct message, deduped).
      if (!already) {
        result.newReplies++;
        if (persist) {
          await CommunicationLog.create({
            lead_id: lead.id,
            campaign_id: lead.campaign_id,
            channel: 'email',
            direction: 'inbound',
            delivery_mode: 'live',
            status: 'delivered',
            to_address: REPLY_MAILBOX,
            from_address: m.from,
            subject: m.subject.slice(0, 255),
            body: bodyText,
            provider: 'microsoft_graph',
            provider_message_id: m.id,
            provider_response: null,
            metadata: { ingested_at: new Date().toISOString(), conversation_id: m.conversationId, received_at: m.received },
            created_at: new Date(m.received),
          } as any);
          detail.persisted = true;
        }
      } else if (persist && bodyText && !(existing as any).body) {
        // Backfill the body on a row recorded before we captured message bodies.
        await CommunicationLog.update({ body: bodyText }, { where: { id: (existing as any).id } });
      }

      // 2) Advance the lead to 'replied' at most once per run (never demote).
      const stageOrder = PIPELINE_ORDER[lead.pipeline_stage as keyof typeof PIPELINE_ORDER] ?? 0;
      if (!advancedLeads.has(lead.id) && stageOrder < PIPELINE_ORDER.replied) {
        advancedLeads.add(lead.id);
        detail.advanced = true;
        if (persist) await Lead.update({ pipeline_stage: 'replied' }, { where: { id: lead.id } });
      }
      result.details.push(detail);
    } catch (e) {
      result.errors++;
      logger.warn('replyIngestion: message failed', { msg_id: m.id, error: (e as Error).message });
    }
  }

  result.distinctResponders = responders.size;
  result.advanced = advancedLeads.size;

  logger.info('replyIngestion complete', {
    mode: persist ? 'apply' : 'dry-run',
    scanned: result.scanned, candidates: result.candidates, validated: result.validated,
    distinctResponders: result.distinctResponders, newReplies: result.newReplies,
    advanced: result.advanced, errors: result.errors,
  });
  return result;
}
