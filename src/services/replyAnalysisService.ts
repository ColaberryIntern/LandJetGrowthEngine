/**
 * Reply Intelligence -- for a lead who replied, assemble three things side by
 * side and let the system learn:
 *   1. theirReply   - what the lead actually wrote
 *   2. proposedReply- what WE would have replied (AI draft in Ryan's voice)
 *   3. actualReply  - what Ryan actually sent back (pulled from the thread)
 * plus a similarity score (proposed vs actual).
 *
 * Gets smarter over time: every time we find Ryan's actual reply we persist the
 * (their message -> Ryan's reply) pair on the inbound row's metadata, and feed
 * recent pairs back as few-shot examples so the AI proposal drifts toward Ryan's
 * real voice and decisions. The similarity score should climb as it learns.
 */

import { QueryTypes } from 'sequelize';
import { getSequelize } from '../config/database';
import { CommunicationLog } from '../models/CommunicationLog';
import { Lead } from '../models/Lead';
import { logger } from '../config/logger';
import { htmlToText } from './reservationQuoteService';
import { recordLlmUsage } from './aiCost';

const REPLY_MAILBOX = process.env.WEEKLY_BRIEFING_REPLY_MAILBOX || 'rlandry@landjet.com';
const OUR_SENDERS = new Set(['rlandry@landjet.com', 'ryan@landjet.com', 'ryan.landry@landjet.com']);

async function getGraphToken(): Promise<string | null> {
  const t = process.env.OAUTH_TENANT_ID, c = process.env.OAUTH_CLIENT_ID, s = process.env.OAUTH_CLIENT_SECRET;
  if (!t || !c || !s) return null;
  try {
    const r = await fetch(`https://login.microsoftonline.com/${t}/oauth2/v2.0/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: c, client_secret: s, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
    });
    if (!r.ok) return null;
    return ((await r.json()) as { access_token?: string }).access_token || null;
  } catch { return null; }
}

function tokens(s: string): Set<string> { return new Set((s.toLowerCase().match(/[a-z0-9']+/g) || [])); }
/** Jaccard token similarity, 0-100. */
function similarity(a: string, b: string): number {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const t of A) if (B.has(t)) inter++;
  return Math.round((inter / (A.size + B.size - inter)) * 100);
}

export interface ReplyAnalysis {
  lead: { id: number; name: string; email: string; company: string | null };
  theirReply: { subject: string | null; body: string; date: string } | null;
  actualReply: { body: string; date: string } | null;
  proposedReply: string;
  proposedError: string | null;
  similarityPct: number | null;
  learnedFrom: number; // # of (their->ours) example pairs used to prime the proposal
}

async function generateProposed(
  lead: Lead, theirMessage: string, examples: { inbound: string; reply: string }[],
): Promise<{ body: string; error: string | null }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { body: '', error: 'OPENAI_API_KEY not configured' };
  if (!theirMessage.trim()) return { body: '', error: 'No inbound message to reply to' };

  const fewshot = examples.slice(0, 3).map((e, i) =>
    `Example ${i + 1}\nThey wrote: """${e.inbound.slice(0, 600)}"""\nRyan replied: """${e.reply.slice(0, 600)}"""`,
  ).join('\n\n');

  const system = `You are Ryan Landry, CEO of LandJet (premium executive ground transportation / mobile boardroom). Write the reply Ryan would actually send to this person's message. Be concise, warm, direct, no corporate fluff, no "I hope this finds you well". Match Ryan's voice from the examples if given. Output ONLY the reply text, ready to send.${fewshot ? `\n\nPast examples of how Ryan replies:\n${fewshot}` : ''}`;
  const user = `The lead is ${lead.first_name} ${lead.last_name}${lead.company ? ` at ${lead.company}` : ''}.\nThey wrote:\n"""${theirMessage.slice(0, 1500)}"""\n\nWrite Ryan's reply.`;

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: process.env.AI_MODEL || 'gpt-4o', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.6, max_tokens: 400 }),
    });
    if (!r.ok) return { body: '', error: r.status === 429 ? 'AI quota exceeded' : `AI unavailable (${r.status})` };
    const data = (await r.json()) as any;
    recordLlmUsage({ source: 'reply_analysis', usage: data.usage });
    const body = (data.choices?.[0]?.message?.content || '').trim();
    return body ? { body, error: null } : { body: '', error: 'AI returned empty' };
  } catch (e) { return { body: '', error: (e as Error).message }; }
}

export async function analyzeReply(leadId: number): Promise<ReplyAnalysis> {
  const sq = getSequelize();
  const lead = await Lead.findByPk(leadId);
  if (!lead) throw new Error('Lead not found');
  const leadEmail = (lead.email || '').toLowerCase();

  const inbound = await CommunicationLog.findOne({
    where: { lead_id: leadId, direction: 'inbound' },
    order: [['created_at', 'DESC']],
  });
  const convId = (inbound?.metadata as any)?.conversation_id || null;

  let theirReply = inbound ? { subject: inbound.subject, body: inbound.body || '', date: new Date(inbound.created_at).toISOString() } : null;
  let actualReply: { body: string; date: string } | null = null;

  const token = await getGraphToken();
  if (token && convId) {
    try {
      const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(REPLY_MAILBOX)}/messages`
        + `?$filter=${encodeURIComponent(`conversationId eq '${convId}'`)}&$select=from,sentDateTime,bodyPreview,body&$top=50`;
      const j = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()) as { value?: any[] };
      const msgs = ((j.value || []) as any[])
        .map(m => ({ from: (m.from?.emailAddress?.address || '').toLowerCase(), date: m.sentDateTime || '', text: ((m.bodyPreview || '').trim() || htmlToText(m.body?.content || '')) }))
        .sort((a, b) => a.date.localeCompare(b.date));
      const theirs = msgs.filter(m => m.from === leadEmail);
      if (theirs.length) theirReply = { subject: theirReply?.subject || null, body: theirs[theirs.length - 1].text.slice(0, 1500), date: theirs[theirs.length - 1].date };
      const theirDate = theirReply?.date || '';
      const ours = msgs.filter(m => OUR_SENDERS.has(m.from) && m.date > theirDate);
      if (ours.length) actualReply = { body: ours[ours.length - 1].text.slice(0, 1500), date: ours[ours.length - 1].date };
    } catch (e) { logger.warn('analyzeReply: graph thread fetch failed', { error: (e as Error).message }); }
  }

  // Learn: persist the (their message -> Ryan's actual reply) pair on the inbound row.
  if (inbound && actualReply && theirReply) {
    try {
      await inbound.update({ metadata: { ...(inbound.metadata as object || {}), actual_reply: actualReply.body, actual_reply_at: actualReply.date } });
    } catch (e) { logger.warn('analyzeReply: could not persist actual reply', { error: (e as Error).message }); }
  }

  // Few-shot from other leads' learned pairs.
  const exampleRows = await sq.query<{ inbound: string; reply: string }>(
    `SELECT body AS inbound, metadata->>'actual_reply' AS reply
     FROM communication_logs
     WHERE direction='inbound' AND body IS NOT NULL AND metadata->>'actual_reply' IS NOT NULL AND lead_id <> :leadId
     ORDER BY created_at DESC LIMIT 3`,
    { type: QueryTypes.SELECT, replacements: { leadId } },
  );

  const proposed = await generateProposed(lead, theirReply?.body || '', exampleRows);
  const similarityPct = actualReply && proposed.body ? similarity(proposed.body, actualReply.body) : null;

  return {
    lead: { id: lead.id, name: `${lead.first_name} ${lead.last_name}`.trim(), email: lead.email, company: lead.company },
    theirReply,
    actualReply,
    proposedReply: proposed.body,
    proposedError: proposed.error,
    similarityPct,
    learnedFrom: exampleRows.length,
  };
}
