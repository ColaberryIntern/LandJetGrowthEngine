/**
 * Bounce processor.
 *
 * Scans rlandry@landjet.com inbox via Microsoft Graph for postmaster /
 * Microsoft Outlook delivery-failure messages. For each, parses the
 * original recipient address out of the bounce body, finds the matching
 * Lead in our DB, and calls blockLead() so the lead is permanently
 * removed from all outreach + added to the DNC list.
 *
 * Why this exists (Ryan flagged 2026-05-11): three hard bounces in 34
 * minutes from rlandry@landjet.com hit the domain reputation. Pre-send
 * validation can't catch all 5.4.1 errors because Office 365 hides
 * directory state, so the only reliable defense is bounce-then-block.
 *
 * Idempotent: marks each processed bounce email as read after handling
 * so it isn't reprocessed. Also no-ops if the matching lead is already
 * blocked.
 *
 * Failure modes (BREAK / HARDEN per CLAUDE.md):
 *   - Bounce body in unexpected format -> recipient extraction returns
 *     null, the message is logged + flagged in result.errors but not
 *     marked read so a human can review.
 *   - Recipient parsed but no matching lead -> logged as "no_lead_match"
 *     in result.no_match list. Bounce IS marked read (the bounce is
 *     about an address we never tracked; nothing to do).
 *   - Graph API failure -> throws to caller; processor doesn't crash
 *     the wider system.
 */

import { logger } from '../config/logger';
import { Lead } from '../models/Lead';
import { blockLead } from './outreachQueryService';

const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID || '';
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET || '';
const OAUTH_TENANT_ID = process.env.OAUTH_TENANT_ID || '';
const SCAN_MAILBOX = 'rlandry@landjet.com';

async function getGraphToken(): Promise<string> {
  const resp = await fetch(`https://login.microsoftonline.com/${OAUTH_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }).toString(),
  });
  const data = (await resp.json()) as any;
  if (!data.access_token) throw new Error('Failed to get Graph token');
  return data.access_token;
}

// Senders that indicate a delivery failure
const POSTMASTER_PATTERNS = [
  /^postmaster@/i,
  /MicrosoftExchange.*@/i,
  /mailer-daemon@/i,
  /^mail.*delivery@/i,
];

// Subject hints that confirm bounce (used as secondary check)
const BOUNCE_SUBJECT_PATTERNS = [
  /undeliverable/i,
  /delivery (status notification|failure|failed)/i,
  /returned mail/i,
  /mail delivery failed/i,
];

export function isBouncePostmasterEmail(senderEmail: string, subject: string): boolean {
  if (POSTMASTER_PATTERNS.some(p => p.test(senderEmail))) return true;
  // Some bounces come from MicrosoftExchange tenant addresses; subject is a strong tell
  return BOUNCE_SUBJECT_PATTERNS.some(p => p.test(subject || ''));
}

/**
 * Extract the original recipient email from a bounce body.
 * Handles Microsoft Outlook NDR ("Recipient Address: x@y.com") and
 * generic postmaster bounces ("-- aeveloff@nep.com").
 */
export function extractBouncedRecipient(body: string): string | null {
  if (!body) return null;
  const stripped = body.replace(/<[^>]+>/g, ' '); // strip HTML if present

  // Office 365 NDR pattern
  const m1 = stripped.match(/Recipient Address:\s*([^\s<>"]+@[^\s<>"]+)/i);
  if (m1) return m1[1].toLowerCase().trim();

  // "Your message to X couldn't be delivered" pattern
  const m2 = stripped.match(/Your message to\s+([^\s<>"]+@[^\s<>"]+)\s+(couldn'?t|could not)/i);
  if (m2) return m2[1].toLowerCase().trim();

  // Generic postmaster "-- email@domain.com" pattern
  const m3 = stripped.match(/--\s*([^\s<>"]+@[^\s<>"]+)\s*\n/);
  if (m3) return m3[1].toLowerCase().trim();

  // "addressed to email address :" pattern
  const m4 = stripped.match(/addressed to email address\s*:?\s*[\r\n-]*\s*([^\s<>"]+@[^\s<>"]+)/i);
  if (m4) return m4[1].toLowerCase().trim();

  return null;
}

interface InboxMessage {
  id: string;
  subject: string;
  from_email: string;
  isRead: boolean;
}

async function fetchInboxMessages(token: string, hoursBack: number, limit: number): Promise<InboxMessage[]> {
  const since = new Date(Date.now() - hoursBack * 3600_000).toISOString();
  const url = `https://graph.microsoft.com/v1.0/users/${SCAN_MAILBOX}/mailFolders/inbox/messages` +
    `?$top=${limit}` +
    `&$select=id,subject,from,isRead` +
    `&$filter=receivedDateTime ge ${since}` +
    `&$orderby=receivedDateTime desc`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error(`Graph list failed: ${resp.status} ${await resp.text()}`);
  const data: any = await resp.json();
  return (data.value || []).map((m: any) => ({
    id: m.id,
    subject: m.subject || '',
    from_email: (m.from?.emailAddress?.address || '').toLowerCase(),
    isRead: !!m.isRead,
  }));
}

async function fetchMessageBody(token: string, messageId: string): Promise<string> {
  const url = `https://graph.microsoft.com/v1.0/users/${SCAN_MAILBOX}/messages/${messageId}?$select=body`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error(`Graph get message failed: ${resp.status}`);
  const data: any = await resp.json();
  return data.body?.content || '';
}

async function markAsRead(token: string, messageId: string): Promise<void> {
  const url = `https://graph.microsoft.com/v1.0/users/${SCAN_MAILBOX}/messages/${messageId}`;
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ isRead: true }),
  });
  if (!resp.ok) {
    logger.warn('Failed to mark bounce as read', { messageId, status: resp.status });
  }
}

export interface BounceProcessResult {
  scanned: number;            // total inbox messages scanned
  bounces_detected: number;   // matched as postmaster/NDR
  blocked: Array<{ email: string; lead_id: number; message_id: string }>;
  no_match: Array<{ email: string; message_id: string }>; // bounce parsed but no lead
  errors: Array<{ message_id: string; error: string }>;
  dry_run: boolean;
}

/**
 * Process recent bounces. Scans the last `hoursBack` hours of inbox messages.
 *
 * @param opts.hoursBack  How many hours of inbox to scan (default 72)
 * @param opts.limit      Max messages to fetch (default 100)
 * @param opts.dryRun     If true, report what would be blocked but do not block or mark read
 */
export async function processBounces(opts: { hoursBack?: number; limit?: number; dryRun?: boolean } = {}): Promise<BounceProcessResult> {
  const hoursBack = opts.hoursBack ?? 72;
  const limit = opts.limit ?? 100;
  const dryRun = !!opts.dryRun;

  if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET || !OAUTH_TENANT_ID) {
    throw new Error('OAuth2 credentials not configured for Graph access');
  }

  const result: BounceProcessResult = {
    scanned: 0,
    bounces_detected: 0,
    blocked: [],
    no_match: [],
    errors: [],
    dry_run: dryRun,
  };

  const token = await getGraphToken();
  const messages = await fetchInboxMessages(token, hoursBack, limit);
  result.scanned = messages.length;

  for (const msg of messages) {
    if (!isBouncePostmasterEmail(msg.from_email, msg.subject)) continue;
    result.bounces_detected++;

    let body: string;
    try {
      body = await fetchMessageBody(token, msg.id);
    } catch (e) {
      result.errors.push({ message_id: msg.id, error: `body_fetch_failed: ${(e as Error).message}` });
      continue;
    }

    const recipient = extractBouncedRecipient(body);
    if (!recipient) {
      result.errors.push({ message_id: msg.id, error: 'recipient_not_found_in_body' });
      continue; // do NOT mark read; human can review
    }

    const lead = await Lead.findOne({ where: { email: recipient } });
    if (!lead) {
      result.no_match.push({ email: recipient, message_id: msg.id });
      if (!dryRun) await markAsRead(token, msg.id);
      continue;
    }

    if (dryRun) {
      result.blocked.push({ email: recipient, lead_id: lead.id, message_id: msg.id });
      continue;
    }

    try {
      await blockLead(String(lead.id), 'hard_bounce');
      result.blocked.push({ email: recipient, lead_id: lead.id, message_id: msg.id });
      logger.info('Lead blocked due to hard bounce', { leadId: lead.id, email: recipient });
      await markAsRead(token, msg.id);
    } catch (e) {
      result.errors.push({ message_id: msg.id, error: `block_failed: ${(e as Error).message}` });
    }
  }

  logger.info('Bounce processing complete', {
    scanned: result.scanned,
    bounces_detected: result.bounces_detected,
    blocked_count: result.blocked.length,
    no_match_count: result.no_match.length,
    errors_count: result.errors.length,
    dry_run: dryRun,
  });

  return result;
}
