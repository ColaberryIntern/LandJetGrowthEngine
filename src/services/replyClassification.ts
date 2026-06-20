/**
 * Deterministic reply classifier for the briefing "Who replied" tags.
 *
 * Pure function: same (subject, body) always yields the same tag. We classify
 * with ordered keyword rules instead of an LLM so the colored tags are stable,
 * explainable, and free to compute on every render (no API call, no drift).
 * The `tone` drives the tag colour in the renderer; `label` is the text shown.
 *
 * Tracked categories (the things worth acting on):
 *   meet      -> "Wants to meet"  (scheduling language -> closest to a booking)
 *   interested-> "Interested"     (positive engagement)
 *   question  -> "Question"       (asked something, needs an answer)
 *   negative  -> "Not now"        (declined / stalled / going cold)
 *   auto      -> "Auto-reply"     (out-of-office / automated)
 *   neutral   -> "Replied"        (engaged but uncategorized)
 */

export type ReplyTone = 'meet' | 'interested' | 'question' | 'negative' | 'auto' | 'neutral';

export interface ReplyTag {
  tone: ReplyTone;
  label: string;
}

const RULES: { tone: ReplyTone; label: string; re: RegExp }[] = [
  {
    tone: 'auto', label: 'Auto-reply',
    re: /out of office|automatic reply|auto-?reply|away from my|on vacation|on holiday|annual leave|currently out|will be out/i,
  },
  {
    tone: 'negative', label: 'Not now',
    re: /not going through|aren'?t going through|no longer|not interested|no,? thank|pass on this|unsubscribe|remove me|stop emailing|no communication|not a fit|not the right|circle back|down the road|maybe later|already have a|we'?re good|no need/i,
  },
  {
    tone: 'meet', label: 'Wants to meet',
    re: /\b(call|meet|meeting|schedule|scheduling|calendar|zoom|google meet|teams|hop on|jump on|book a time|set up a time|find a time|grab time|availability|available (next|this|to)|free (next|this|on))\b|\b(mon|tues|wednes|thurs|fri)day\b|next week|this week/i,
  },
  {
    tone: 'question', label: 'Question',
    re: /\?|how much|what (is|are|would|does)|can you|could you|would you|do you (have|offer)|when can|what'?s the|pricing|how do(es)? (it|this|you)/i,
  },
  {
    tone: 'interested', label: 'Interested',
    re: /interested|sounds good|sounds great|let'?s (talk|do|chat|connect|discuss)|love to|happy to|tell me more|looking forward|absolutely|definitely|count me in|i'?m in|keen to|would like to/i,
  },
];

export function classifyReply(subject: string | null | undefined, body: string | null | undefined): ReplyTag {
  const text = `${subject ?? ''} ${body ?? ''}`;
  for (const r of RULES) {
    if (r.re.test(text)) return { tone: r.tone, label: r.label };
  }
  return { tone: 'neutral', label: 'Replied' };
}
