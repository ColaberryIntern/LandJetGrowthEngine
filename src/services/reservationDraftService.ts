/**
 * reservationDraftService.ts
 * Generates the customer-facing reply for a reservation, in the VOICE of the
 * account it will be sent from (tone profile + most-similar past replies), and
 * scores it against a self-evaluating rubric. The rubric improves over time
 * because its inputs -- the exemplar corpus and the per-account tone profile --
 * grow as more real replies are mined and sent.
 *
 * FAILURE MODES (BUILD-BREAK-HARDEN):
 *  - LLM down/timeout -> falls back to the deterministic house template so the
 *    operator is never blocked; rubric still scores the fallback.
 *  - No tone profile yet -> generates in a neutral-but-correct house voice.
 *  - Bad JSON from the model -> caught; falls back to template.
 *  - Always strips em dashes (Ali's hard rule for client comms).
 */
import { logger } from '../config/logger';
import { ReservationQuote, ReservationAiDraft } from '../models/ReservationQuote';
import { composeQuoteReply, fetchConversationText } from './reservationQuoteService';
import { getToneProfile, getTopExemplars } from './reservationLearningService';
import { recordLlmUsage } from './aiCost';

const EM_DASH = /—|–/g;
function deDash(s: string): string { return (s || '').replace(EM_DASH, '-').replace(/\s-\s/g, ', '); }

interface DraftFacts {
  firstName: string;
  route: string | null;
  total: string | null;
  service: string | null;
  date: string | null;
  passengers: number | null;
}

function extractFacts(rq: ReservationQuote): DraftFacts {
  const r = (rq.result || {}) as { trip?: any; quote?: any };
  const trip = r.trip || {};
  const q = r.quote || {};
  return {
    firstName: (trip.passenger_name || '').split(' ')[0] || 'there',
    route: [trip.pickup_address, trip.dropoff_address].filter(Boolean).join(' to ') || null,
    total: q.grand_total != null ? `$${Number(q.grand_total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null,
    service: q.service_type || trip.service_type || null,
    date: trip.date_of_service || null,
    passengers: trip.passengers ?? null,
  };
}

/**
 * Self-evaluating rubric. Each applicable check is a boolean; the score is the
 * fraction passed. Checks that do not apply to this request (no price, no known
 * route) are excluded from the denominator so the score is fair.
 */
export function scoreDraft(
  draft: { subject: string; text: string },
  rq: ReservationQuote,
  tonePrimed: boolean,
): { score: number; breakdown: Record<string, boolean> } {
  const facts = extractFacts(rq);
  const text = draft.text || '';
  const lower = text.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean).length;

  const checks: Record<string, boolean> = {};
  // Always-applicable
  checks.has_greeting = /^(hi|hello|good (morning|afternoon|evening)|dear|hey)\b/i.test(text.trim());
  checks.has_signoff = /(best|thanks|thank you|regards|sincerely|cheers|landjet)\b/i.test(text.slice(-160));
  checks.length_ok = words >= 18 && words <= 230;
  checks.no_emdash = !EM_DASH.test(text);
  checks.tone_matched = tonePrimed; // generated with the account's learned voice
  // Context-dependent (only counted when relevant)
  if (facts.total) checks.includes_price = text.includes(facts.total) || /\$\d/.test(text);
  if (facts.route) {
    const firstLoc = (facts.route.split(' to ')[0] || '').split(',')[0].trim().toLowerCase();
    checks.addresses_route = firstLoc.length > 2 && lower.includes(firstLoc);
  }

  const vals = Object.values(checks);
  const score = vals.length ? +(vals.filter(Boolean).length / vals.length).toFixed(2) : 0;
  return { score, breakdown: checks };
}

function buildSystemPrompt(profile: { greeting?: string | null; signoff?: string | null; formality?: string | null; guidance?: string | null } | null, mailbox: string): string {
  const base =
    `You write a LandJet ground-transportation reservation reply to a customer, sent from ${mailbox}. ` +
    `Be accurate, warm, and concise. State the quoted price clearly and confirm the route and date. ` +
    `Invite them to confirm to get booked. Do not invent details that are not provided. ` +
    `NEVER use em dashes. Return ONLY JSON: { "subject": string, "text": string }.`;
  if (!profile || !profile.guidance) return base + ' Use a professional, friendly house voice.';
  return base +
    `\n\nMatch THIS account's real voice as closely as possible:` +
    `\n- Typical greeting: ${profile.greeting || '(natural)'}` +
    `\n- Typical sign-off: ${profile.signoff || '(natural)'}` +
    `\n- Overall tone: ${profile.formality || '(professional)'}` +
    `\n- How they write: ${profile.guidance}`;
}

/**
 * Generate the reply for one reservation, score it, and persist it on the row's
 * ai_draft. Returns the draft. Reused by the "Generate reply" button and any
 * future auto-draft pass.
 */
export async function generateDraft(rq: ReservationQuote): Promise<ReservationAiDraft> {
  const facts = extractFacts(rq);
  const replyFrom = rq.reply_from || rq.mailbox;
  const profile = await getToneProfile(replyFrom);
  const model = process.env.AI_MODEL || 'gpt-4o';
  const apiKey = process.env.OPENAI_API_KEY;

  let subject = '', text = '';
  if (apiKey) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const queryText = `${rq.subject || ''} ${facts.route || ''}`;
      const exemplars = await getTopExemplars(replyFrom, queryText, 3);
      const shots = exemplars.length
        ? '\n\nReal past replies from this account to learn the voice from (do not copy facts, only the style):\n' +
          exemplars.map((e, i) => `--- example ${i + 1} ---\n${e.reply_excerpt.slice(0, 500)}`).join('\n\n')
        : '';
      // Pull the whole conversation so the reply is written in context of
      // everything discussed, not just the latest message.
      const history = rq.conversation_id ? await fetchConversationText(rq.mailbox, rq.conversation_id, 6000) : null;
      const historyBlock = history
        ? `\n\nFull conversation so far (oldest first) -- reply in context of all of it, do not repeat what was already settled:\n${history}`
        : '';
      const factBlock =
        `Customer first name: ${facts.firstName}\n` +
        `Route: ${facts.route || '(not provided)'}\n` +
        `Service: ${facts.service || '(not provided)'}\n` +
        `Date: ${facts.date || '(not provided)'}\n` +
        `Passengers: ${facts.passengers ?? '(not provided)'}\n` +
        `Quoted total: ${facts.total || '(no price yet - acknowledge and say a quote will follow)'}\n` +
        `Original subject: ${rq.subject || '(none)'}` +
        historyBlock;

      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: buildSystemPrompt(profile, replyFrom) + shots },
            { role: 'user', content: factBlock },
          ],
          temperature: 0.4, max_tokens: 500,
        }),
        signal: controller.signal,
      });
      if (resp.ok) {
        const data = (await resp.json()) as any;
        recordLlmUsage({ source: 'reservation_draft', usage: data.usage });
        const raw = (data.choices?.[0]?.message?.content || '').replace(/```json\s*/g, '').replace(/```/g, '').trim();
        const p = JSON.parse(raw);
        subject = typeof p.subject === 'string' ? p.subject : '';
        text = typeof p.text === 'string' ? p.text : '';
      }
    } catch (e) {
      logger.warn('generateDraft LLM failed, using template fallback (non-fatal)', { id: rq.id, error: (e as Error).message });
    } finally {
      clearTimeout(timeout);
    }
  }

  // Fallback to the deterministic house template if the model gave us nothing.
  if (!text) {
    const t = composeQuoteReply(rq);
    subject = t.subject; text = t.text;
  }
  subject = deDash(subject); text = deDash(text);
  if (rq.subject && !/^re:/i.test(subject)) subject = /^re:/i.test(rq.subject) ? rq.subject : `Re: ${rq.subject}`;

  const rubric = scoreDraft({ subject, text }, rq, Boolean(profile?.guidance));
  const draft: ReservationAiDraft = {
    subject, text, generated_at: new Date().toISOString(), model, edited: false, rubric,
  };
  await rq.update({ ai_draft: draft, reply_from: replyFrom } as any);
  logger.info('reservation draft generated', { id: rq.id, reply_from: replyFrom, score: rubric.score, toned: Boolean(profile?.guidance) });
  return draft;
}
