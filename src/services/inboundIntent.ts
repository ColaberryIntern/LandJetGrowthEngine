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

/** The message above the signature/boilerplate (drop sign-off + policy footer). */
function messageBody(text: string): string {
  const t = lead(text);
  const cut = t.search(/\n?\s*(warm regards|best regards|kind regards|best,|regards,|thanks,|thank you,|sincerely|cheers,|reservation team|cancellation policy|payment terms|get in\. get connected|p:\s*8)/i);
  return (cut > 0 ? t.slice(0, cut) : t).trim();
}

export type OutboundIntent = 'closing' | 'open';

/**
 * Classify a reply WE sent. 'closing' = a courtesy that ends the thread with
 * nothing pending ("Thank you for letting us know"). 'open' = we sent something
 * the customer must act on (a quote, a question, a confirm-to-book) so the ball
 * is genuinely in their court. Conservative: defaults to 'open'.
 */
export function classifyOutboundIntent(text: string): OutboundIntent {
  const t = messageBody(text);
  if (!t) return 'open';
  // A price, a question, or an explicit call to action means we are waiting on them.
  if (/\$\s?\d|\?|please (confirm|let us know|advise|review|reply|provide)|let us know if you|would you like|to (confirm|book|proceed|secure)|your (quote|estimate|total) (is|comes|for)|attached (is|you)|we (need|require)|could you|can you (confirm|send|provide)|once you confirm|awaiting your/i.test(t)) return 'open';
  // A short courtesy / acknowledgment that closes the loop.
  if (/thank you for (letting us know|the update|reaching|your)|thanks for (letting us know|the update|reaching)|sounds good|you'?re all set|we'?re all set|happy to help|glad to (help|hear)|no problem|safe travels|talk soon|see you (then|soon)|got it,? (thank|thanks)|appreciate the update/i.test(t)) return 'closing';
  return 'open';
}
