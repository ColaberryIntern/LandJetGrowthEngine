/**
 * inboundIntent.ts
 * Classify the intent of a customer's latest message so the queue can be smart
 * about what actually needs a human. A "Sounds great, thank you!" closing does
 * NOT need a reply; a question does. Deterministic and cheap (no LLM): runs on
 * Graph's bodyPreview during lifecycle reconciliation.
 */
export type InboundIntent = 'gratitude' | 'confirmation' | 'question' | 'other';

/** Strip a trailing email signature/quoted-history tail so it does not skew matching. */
function lead(text: string): string {
  const t = (text || '').replace(/\r/g, '').toLowerCase();
  const cut = t.search(/\bfrom:\s|\bon\s.+\bwrote:|-{3,}\s*original|sent from my /i);
  return (cut > 0 ? t.slice(0, cut) : t).slice(0, 600).trim();
}

/**
 * Order matters: a message that asks something needs a reply even if it also
 * says thanks; an explicit go-ahead is a confirmation (action: book it); a bare
 * acknowledgment is a closing that needs nothing. Everything else is 'other'.
 */
export function classifyInboundIntent(text: string): InboundIntent {
  const t = lead(text);
  if (!t) return 'other';

  const hasQuestion = /\?/.test(t) ||
    /\b(can you|could you|would you|will you|what(?:'s| is| are| time)|when |where |how (much|many|long|do|does|would)|do you|does it|is it|is there|are there|can we|could we|any chance|any way|reschedul|cancel|change the|update the|instead|add (a|an|another)|what about|let me know if|is that)\b/.test(t);
  if (hasQuestion) return 'question';

  const isConfirmation =
    /\b(confirm(ed|ing|s)?|let'?s (do it|book|proceed|go|move forward)|please (book|proceed|go ahead|schedule|move forward)|go ahead|book it|we'?re good to go|approved?|yes,? (let'?s|please|go|that works|book|proceed)|that works for us|we accept|ready to book)\b/.test(t);
  if (isConfirmation) return 'confirmation';

  const isGratitude =
    /\b(thank you|thanks|thx|thank u|sounds (great|good|perfect|wonderful)|looks (great|good|perfect)|perfect|great,? (thank|that)|appreciate (it|you|your)|much appreciated|got it|will do|see you|talk soon|cheers|all set|we'?re all set|no (further|other) questions|that'?s all|nothing else|you'?re the best)\b/.test(t);
  if (isGratitude) return 'gratitude';

  return 'other';
}

/** Does the customer's latest message actually require us to reply/act? */
export function intentNeedsReply(intent: InboundIntent): boolean {
  return intent !== 'gratitude';
}
