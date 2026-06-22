/**
 * reservationLearningService.ts
 * The "learn from history" half of the Reservations engine. Mines each account's
 * Sent Items for real (customer request -> human reply) pairs, stores them as
 * exemplars, and summarizes each account's voice into a tone profile. The draft
 * generator reads both so a reply from percy@ sounds like Percy and one from
 * rlandry@ sounds like Ryan. The corpus + profile improve as more replies arrive.
 *
 * FAILURE MODES (BUILD-BREAK-HARDEN):
 *  - Graph/token down -> fetch throws; callers (script/route) log non-fatal.
 *  - One malformed message -> caught per-message; the batch continues.
 *  - Re-run -> exemplars deduped by source_message_id (idempotent upsert-by-ignore).
 *  - LLM unavailable/timeout -> rebuildToneProfile returns null; drafts fall back
 *    to a neutral house voice. Nothing hard-fails.
 *  - Cost: mining is capped at maxMessages and the cap is logged (no silent trim).
 */
import { logger } from '../config/logger';
import { ReservationReplyExemplar } from '../models/ReservationReplyExemplar';
import { ReservationToneProfile } from '../models/ReservationToneProfile';
import { getGraphToken, htmlToText } from './reservationQuoteService';
import { recordLlmUsage } from './aiCost';

/** Trim an email body to just the freshly-written portion (drop quoted history). */
export function topReplyPortion(text: string): string {
  const t = (text || '').replace(/\r/g, '');
  const cuts = [
    /\nFrom:\s.+\nSent:\s/i,
    /\nOn\s.+\bwrote:/i,
    /\n-{3,}\s*Original Message\s*-{3,}/i,
    /\n_{5,}/,
    /\nSent from my /i,
    /\n>{1,}\s/,
  ];
  let end = t.length;
  for (const re of cuts) {
    const m = t.match(re);
    if (m && m.index !== undefined && m.index < end) end = m.index;
  }
  return t.slice(0, end).trim();
}

interface GraphMessage {
  id: string;
  subject: string | null;
  from: string | null;
  receivedDateTime: string | null;
  body: string;
  conversationId: string | null;
}

/** Page through a mailbox folder, newest first, up to `maxMessages`. */
async function fetchFolderMessages(
  mailbox: string,
  folder: 'sentitems' | 'inbox',
  maxMessages: number,
  token: string,
): Promise<GraphMessage[]> {
  const out: GraphMessage[] = [];
  let url: string | null =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/mailFolders/${folder}/messages` +
    `?$top=50&$select=id,subject,from,toRecipients,receivedDateTime,sentDateTime,body,conversationId&$orderby=receivedDateTime desc`;
  while (url && out.length < maxMessages) {
    const r: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Graph ${folder} ${r.status}: ${(await r.text()).slice(0, 160)}`);
    const data = (await r.json()) as { value?: any[]; '@odata.nextLink'?: string };
    for (const m of data.value || []) {
      out.push({
        id: m.id,
        subject: m.subject || null,
        from: m.from?.emailAddress?.address || null,
        receivedDateTime: m.sentDateTime || m.receivedDateTime || null,
        body: m.body?.contentType === 'html' ? htmlToText(m.body?.content || '') : (m.body?.content || ''),
        conversationId: m.conversationId || null,
      });
      if (out.length >= maxMessages) break;
    }
    url = data['@odata.nextLink'] || null;
  }
  return out;
}

/** Does this sent message look like a customer-facing reservation/quote reply? */
function looksLikeQuoteReply(subject: string | null, body: string): boolean {
  const s = `${subject || ''} ${body}`.toLowerCase();
  return /quote|reservation|trip|pickup|drop ?off|book|sprinter|sedan|shuttle|\$\d/.test(s);
}

export interface MineResult { mailbox: string; scanned: number; capped: boolean; created: number; skipped: number; }

/**
 * Mine one mailbox's Sent Items for (inbound -> reply) exemplars. For each sent
 * message we keep the freshly-written reply text, and pair it with the most
 * recent customer message in the same thread (pulled from the inbox by
 * conversationId, cached per thread to bound Graph calls).
 */
export async function mineSentReplies(opts: { mailbox: string; maxMessages?: number } ): Promise<MineResult> {
  const mailbox = opts.mailbox;
  const maxMessages = opts.maxMessages ?? 300;
  const token = await getGraphToken();
  const sent = await fetchFolderMessages(mailbox, 'sentitems', maxMessages, token);
  const capped = sent.length >= maxMessages;
  if (capped) logger.info('mineSentReplies hit the cap (older replies not scanned)', { mailbox, maxMessages });

  // Cache the inbound side per conversation so we do not re-fetch a thread.
  const inboundByConv = new Map<string, GraphMessage | null>();
  let created = 0, skipped = 0;

  for (const s of sent) {
    try {
      const reply = topReplyPortion(s.body);
      if (reply.length < 20 || !looksLikeQuoteReply(s.subject, reply)) { skipped++; continue; }

      const exists = await ReservationReplyExemplar.findOne({ where: { source_message_id: s.id }, attributes: ['id'] });
      if (exists) { skipped++; continue; }

      let inboundExcerpt: string | null = null;
      if (s.conversationId) {
        if (!inboundByConv.has(s.conversationId)) {
          inboundByConv.set(s.conversationId, await fetchLatestInbound(mailbox, s.conversationId, s.receivedDateTime, token));
        }
        const inb = inboundByConv.get(s.conversationId) || null;
        inboundExcerpt = inb ? topReplyPortion(inb.body).slice(0, 1200) : null;
      }

      await ReservationReplyExemplar.create({
        mailbox,
        source_message_id: s.id,
        conversation_id: s.conversationId,
        inbound_subject: s.subject,
        inbound_excerpt: inboundExcerpt,
        reply_excerpt: reply.slice(0, 1600),
        sent_at: s.receivedDateTime ? new Date(s.receivedDateTime) : null,
      } as any);
      created++;
    } catch (e) {
      skipped++;
      logger.warn('mineSentReplies skipped one message (non-fatal)', { mailbox, id: s.id, error: (e as Error).message });
    }
  }

  logger.info('mineSentReplies complete', { mailbox, scanned: sent.length, capped, created, skipped });
  return { mailbox, scanned: sent.length, capped, created, skipped };
}

/** Find the newest message in a thread that is NOT from our own mailbox and predates the reply. */
async function fetchLatestInbound(mailbox: string, conversationId: string, beforeIso: string | null, token: string): Promise<GraphMessage | null> {
  const filter = encodeURIComponent(`conversationId eq '${conversationId}'`);
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages?$filter=${filter}&$select=id,subject,from,receivedDateTime,body,conversationId&$orderby=receivedDateTime desc&$top=20`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const data = (await r.json()) as { value?: any[] };
  const before = beforeIso ? new Date(beforeIso).getTime() : Infinity;
  const me = mailbox.toLowerCase();
  for (const m of data.value || []) {
    const from = (m.from?.emailAddress?.address || '').toLowerCase();
    const t = m.receivedDateTime ? new Date(m.receivedDateTime).getTime() : 0;
    if (from && from !== me && t <= before) {
      return {
        id: m.id, subject: m.subject || null, from,
        receivedDateTime: m.receivedDateTime || null,
        body: m.body?.contentType === 'html' ? htmlToText(m.body?.content || '') : (m.body?.content || ''),
        conversationId: m.conversationId || null,
      };
    }
  }
  return null;
}

/**
 * Summarize a mailbox's exemplars into a reusable "voice" profile via the LLM.
 * Deterministic stats (avg length) are computed in code; the LLM only labels
 * greeting/signoff/formality and writes the guidance block. Fail-soft: returns
 * null (and leaves any existing profile in place) if there is nothing to learn
 * from or the LLM is unavailable.
 */
export async function rebuildToneProfile(mailbox: string): Promise<ReservationToneProfile | null> {
  const rows = await ReservationReplyExemplar.findAll({
    where: { mailbox } as any, order: [['sent_at', 'DESC']], limit: 40,
  });
  if (rows.length === 0) { logger.info('rebuildToneProfile: no exemplars yet', { mailbox }); return null; }

  const replies = rows.map((r) => r.reply_excerpt).filter(Boolean);
  const avgLen = Math.round(replies.reduce((a, b) => a + b.split(/\s+/).length, 0) / replies.length);

  const apiKey = process.env.OPENAI_API_KEY;
  let greeting: string | null = null, signoff: string | null = null, formality: string | null = null, guidance: string | null = null;
  if (apiKey) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const sample = replies.slice(0, 15).map((r, i) => `--- reply ${i + 1} ---\n${r.slice(0, 600)}`).join('\n\n');
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: process.env.AI_MODEL || 'gpt-4o',
          messages: [
            { role: 'system', content:
              'You analyze how one person/desk writes customer reservation replies, from real examples. ' +
              'Return ONLY JSON: greeting (their typical opening line/style), signoff (their typical closing + name), ' +
              'formality (one short label e.g. "warm and brief" / "formal" / "brisk"), guidance (2-4 sentences telling ' +
              'another writer how to match this exact voice: sentence length, warmth, what they always include or omit). ' +
              'Never use em dashes anywhere.' },
            { role: 'user', content: sample },
          ],
          temperature: 0.2, max_tokens: 400,
        }),
        signal: controller.signal,
      });
      if (resp.ok) {
        const data = (await resp.json()) as any;
        recordLlmUsage({ source: 'reservation_tone_profile', usage: data.usage });
        const raw = (data.choices?.[0]?.message?.content || '').replace(/```json\s*/g, '').replace(/```/g, '').trim();
        const p = JSON.parse(raw);
        greeting = typeof p.greeting === 'string' ? p.greeting : null;
        signoff = typeof p.signoff === 'string' ? p.signoff : null;
        formality = typeof p.formality === 'string' ? p.formality : null;
        guidance = typeof p.guidance === 'string' ? p.guidance : null;
      }
    } catch (e) {
      logger.warn('rebuildToneProfile LLM failed (non-fatal)', { mailbox, error: (e as Error).message });
    } finally {
      clearTimeout(timeout);
    }
  }

  const [profile] = await ReservationToneProfile.upsert({
    mailbox, greeting, signoff, avg_length: avgLen, formality, guidance,
    sample_count: rows.length, updated_at: new Date(),
  } as any);
  logger.info('rebuildToneProfile complete', { mailbox, sample_count: rows.length, formality });
  return profile;
}

export async function getToneProfile(mailbox: string): Promise<ReservationToneProfile | null> {
  return ReservationToneProfile.findByPk(mailbox);
}

/** Cheap keyword-overlap retrieval of the most similar past replies for few-shot priming. */
export async function getTopExemplars(mailbox: string, queryText: string, k = 3): Promise<ReservationReplyExemplar[]> {
  const rows = await ReservationReplyExemplar.findAll({ where: { mailbox } as any, order: [['sent_at', 'DESC']], limit: 60 });
  const qWords = new Set((queryText || '').toLowerCase().match(/[a-z0-9]{4,}/g) || []);
  if (qWords.size === 0) return rows.slice(0, k);
  const scored = rows.map((r) => {
    const words = new Set(`${r.inbound_excerpt || ''} ${r.inbound_subject || ''}`.toLowerCase().match(/[a-z0-9]{4,}/g) || []);
    let overlap = 0;
    qWords.forEach((w) => { if (words.has(w)) overlap++; });
    return { r, overlap };
  });
  scored.sort((a, b) => b.overlap - a.overlap);
  return scored.slice(0, k).map((s) => s.r);
}

/** Mine + rebuild tone for a set of mailboxes. Used by the cron and the ops script. */
export async function learnFromMailboxes(mailboxes: string[], maxMessages = 300): Promise<Record<string, unknown>> {
  const summary: Record<string, unknown> = {};
  for (const mailbox of mailboxes) {
    try {
      const mined = await mineSentReplies({ mailbox, maxMessages });
      const profile = await rebuildToneProfile(mailbox);
      summary[mailbox] = { ...mined, profiled: Boolean(profile), formality: profile?.formality || null };
    } catch (e) {
      summary[mailbox] = { error: (e as Error).message };
      logger.error('learnFromMailboxes failed for one mailbox (non-fatal)', { mailbox, error: (e as Error).message });
    }
  }
  return summary;
}
