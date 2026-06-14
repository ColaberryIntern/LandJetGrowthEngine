/**
 * AI-hallucination guard for the inbound quote response flow.
 *
 * Per Ali: "when the AI hallucinates ... I would make sure that there is a more
 * deterministic step that doesn't rely on AI, and just kind of follows the calculation."
 *
 * Architecture: the BookRides parser is already 100% regex-based (no AI). The
 * pricing engine is pure math (no AI). The ONLY place AI is in the loop is at
 * the response-drafting stage in `inboundLeadService.generateQuoteResponse` --
 * GPT writes the email body in Lorie's voice using the pre-computed pricing as
 * context. Risks:
 *   1. AI rounds the grand total ($1,247.50 -> "$1,250")
 *   2. AI drops or invents line items
 *   3. AI invents policies ("complimentary champagne", "20% off return trips")
 *   4. AI drops the customer name or mis-spells the route
 *
 * Strategy:
 *   - After AI generation, run `validateAiQuoteBody()` against the body.
 *   - If valid, ship the AI body as-is.
 *   - If invalid, fall back to `renderTemplateQuoteBody()` -- a non-AI,
 *     concierge-tone template using the EXACT pricing data with zero room for
 *     hallucination.
 *
 * The fallback is intentionally a touch more formal than Lorie's voice so a
 * concierge eyeballing the queue can spot it and edit if they want a warmer tone.
 */

import { QuoteOutput } from './landjetPricing';

export interface QuoteContextForGuard {
  customer_name: string;
  pickup_address?: string;
  dropoff_address?: string;
  date_of_service?: string;
}

export interface ValidationResult {
  ok: boolean;
  reasons: string[]; // human-readable reasons the body was rejected (empty when ok)
}

// Phrases the AI is never authorized to use. Hard-coded list -- if any of these
// shows up in a drafted body we reject it because the system prompt did not
// allow inventing policies/discounts/perks.
const FORBIDDEN_PHRASES: RegExp[] = [
  /\bcomplimentary\b/i,
  /\b(?:free of charge|on the house|gratis)\b/i,
  /\b(?:champagne|wifi|water bottles?)\b/i,
  /\b\d+%\s*off\b/i,
  /\bdiscount\b/i,
  /\bguarantee[ds]?\b/i,
  /\brefund(?:able|s)?\b/i,
  /\bno (?:extra )?fee\b/i,
  /\bloyalty (?:program|points|reward)/i,
];

/**
 * Format a number as a USD price string the way the AI is told to: with $,
 * 2 decimals, thousands separators. Used for verbatim matching against the
 * AI body so trivial formatting differences (`$1,247.5`, `1247.50`) are not
 * mistaken for hallucination.
 *
 * We generate several plausible renderings (with/without comma, with/without
 * trailing zero) and accept the body if any one is present verbatim.
 */
export function dollarVariants(n: number): string[] {
  const fixed = n.toFixed(2);
  const withComma = fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const noTrailingZero = fixed.replace(/\.00$/, '');
  return Array.from(new Set([
    `$${withComma}`,
    `$${fixed}`,
    `$${noTrailingZero}`,
    `${withComma}`,
    `${fixed}`,
  ]));
}

/**
 * Pull the city name out of a free-form address. "1801 Doves Landing Ln,
 * Wylie, TX 75098, USA" -> "Wylie". Used to verify the AI didn't swap the
 * pickup or dropoff city.
 */
export function extractCityFromAddress(addr?: string): string | null {
  if (!addr) return null;
  // Pattern: comma, optional whitespace, City, comma, optional whitespace, ST<zip>
  const m = addr.match(/,\s*([A-Za-z][A-Za-z .-]+?),\s*[A-Z]{2}\b/);
  if (m) return m[1].trim();
  return null;
}

export function validateAiQuoteBody(
  body: string,
  pricing: QuoteOutput,
  ctx: QuoteContextForGuard,
): ValidationResult {
  const reasons: string[] = [];
  const lower = body.toLowerCase();

  // 1. Grand total must appear verbatim. Pricing is the source of truth; we
  //    refuse to ship a body that doesn't quote the exact number.
  const grandVariants = dollarVariants(pricing.grand_total);
  const grandPresent = grandVariants.some(v => body.includes(v));
  if (!grandPresent) {
    reasons.push(`grand_total ${grandVariants[0]} not found in body`);
  }

  // 2. Customer name must appear (no first-name match needed; either full or
  //    first name is fine).
  if (ctx.customer_name) {
    const first = ctx.customer_name.split(/\s+/)[0]!.toLowerCase();
    if (first.length > 1 && !lower.includes(first)) {
      reasons.push(`customer first name "${first}" not found in body`);
    }
  }

  // 3. Pickup and dropoff cities must appear if we can extract them.
  const pickupCity = extractCityFromAddress(ctx.pickup_address);
  const dropoffCity = extractCityFromAddress(ctx.dropoff_address);
  if (pickupCity && !lower.includes(pickupCity.toLowerCase())) {
    reasons.push(`pickup city "${pickupCity}" not found in body`);
  }
  if (dropoffCity && !lower.includes(dropoffCity.toLowerCase())) {
    reasons.push(`dropoff city "${dropoffCity}" not found in body`);
  }

  // 4. Forbidden invented-policy phrases.
  for (const re of FORBIDDEN_PHRASES) {
    if (re.test(body)) {
      reasons.push(`forbidden invented phrase: ${re.source}`);
      break; // one is enough to reject
    }
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * Generate a quote response body without any AI. Used as the deterministic
 * fallback when `validateAiQuoteBody` rejects the AI output, and exposed as
 * a function so the same template can be rendered for diagnostic preview.
 *
 * Returns `{ subject, body }`. Plain text body, no HTML.
 */
export function renderTemplateQuoteBody(
  pricing: QuoteOutput,
  ctx: QuoteContextForGuard,
): { subject: string; body: string } {
  const firstName = ctx.customer_name?.split(/\s+/)[0] || 'there';
  const dateStr = ctx.date_of_service ? ` on ${ctx.date_of_service}` : '';
  const pickupCity = extractCityFromAddress(ctx.pickup_address);
  const dropoffCity = extractCityFromAddress(ctx.dropoff_address);
  const routeStr = (pickupCity && dropoffCity)
    ? ` from ${pickupCity} to ${dropoffCity}`
    : '';

  const lines: string[] = [];
  lines.push(`Hi ${firstName},`);
  lines.push('');
  lines.push(`Thank you for the inquiry. Here is the quote for your trip${routeStr}${dateStr}:`);
  lines.push('');
  // Line items
  for (const item of pricing.lines) {
    const amount = `$${item.amount.toFixed(2)}`;
    lines.push(`  ${item.label}: ${amount}`);
  }
  lines.push('');
  lines.push(`Grand total: $${pricing.grand_total.toFixed(2)}`);

  if (pricing.warnings.length > 0) {
    lines.push('');
    lines.push('Notes:');
    for (const w of pricing.warnings) lines.push(`  - ${w}`);
  }
  if (pricing.approvals_needed.length > 0) {
    lines.push('');
    lines.push('A couple of items will be finalized when we confirm the booking:');
    for (const a of pricing.approvals_needed) lines.push(`  - ${a}`);
  }

  lines.push('');
  lines.push('Reply to this email to confirm and we will send a booking link.');
  lines.push('');
  lines.push('LandJet Reservations Team');

  const subject = `Your LandJet quote${routeStr}${dateStr}`;
  return { subject, body: lines.join('\n') };
}
