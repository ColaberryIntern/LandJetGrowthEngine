/**
 * Outreach personalization guard.
 *
 * The base interpolateVariables() leaves an unfilled {{token}} in the text and
 * an empty {{first_name}} renders the literal "{{first_name}}" or a bare
 * "Hi ,". Both ship broken, impersonal mail to a real prospect. This module is
 * the hardened path: it fills friendly fallbacks for name-shaped tokens, strips
 * any leftover {{tokens}} so nothing literal is ever transmitted, tidies the
 * punctuation that stripping leaves behind, and REPORTS what it had to fix so a
 * pre-send guard / test can fail on a real leak.
 *
 * Pure + total: never throws, no I/O.
 */

/** Tokens that should degrade to a human-friendly word rather than vanish. */
const FRIENDLY_FALLBACKS: Record<string, string> = {
  first_name: 'there',
  sender_name: 'The LandJet Team',
  sender_first_name: 'The LandJet Team',
  company: 'your team',
};

const TOKEN_RE = /\{\{(\w+)\}\}/g;

/** Return the list of {{token}} names still present in a string. */
export function findUnresolvedTokens(text: string): string[] {
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(TOKEN_RE.source, 'g');
  while ((m = re.exec(text)) !== null) found.add(m[1]);
  return [...found];
}

/** Collapse the artifacts that stripping an empty token leaves: doubled spaces,
 *  a space before a comma/period, an empty greeting line. */
function tidy(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/(^|\n)\s*(Hi|Hello|Hey|Dear)\s*,/gi, '$1$2 there,')
    .replace(/[ \t]+\n/g, '\n')
    .trimEnd();
}

export interface PersonalizeResult {
  text: string;
  /** Tokens we substituted with a fallback because the lead value was empty. */
  fallbacksUsed: string[];
  /** Tokens we could not resolve at all (unknown/misspelled) and stripped. */
  unresolved: string[];
}

/**
 * Personalize a template against a variables map with hardening.
 *  1. A known token with an empty value uses its friendly fallback.
 *  2. A known token with a value is substituted normally.
 *  3. An unknown/misspelled token (e.g. {{firstname}}) is stripped and reported.
 * The returned text is guaranteed free of {{tokens}}.
 */
export function personalize(template: string, variables: Record<string, string>): PersonalizeResult {
  const fallbacksUsed: string[] = [];
  const unresolved: string[] = [];

  let text = (template || '').replace(TOKEN_RE, (match, key: string) => {
    const val = variables[key];
    if (val !== undefined && String(val).trim() !== '') return String(val);
    if (key in FRIENDLY_FALLBACKS) {
      fallbacksUsed.push(key);
      return FRIENDLY_FALLBACKS[key];
    }
    // Known-but-empty (no fallback) or unknown token: strip + report.
    unresolved.push(key);
    return '';
  });

  text = tidy(text);
  return { text, fallbacksUsed, unresolved };
}

/**
 * Hard assertion for tests / pre-send: throws if any literal {{token}} survives.
 * personalize() already guarantees this, so a throw means a caller bypassed it.
 */
export function assertNoPlaceholderLeak(text: string): void {
  const leaked = findUnresolvedTokens(text);
  if (leaked.length > 0) {
    throw new Error(`Personalization leak: unresolved tokens ${leaked.map(t => `{{${t}}}`).join(', ')}`);
  }
}

/**
 * Escape a lead-supplied value before it is placed into HTML so a company name
 * like "<script>" or "Smith & Co <b>" cannot break the email body or inject
 * markup. Plain-text bodies are escaped at the send boundary; this is the guard
 * for any path that builds HTML directly from lead fields.
 */
export function escapeHtmlField(value: string | null | undefined): string {
  return (value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
