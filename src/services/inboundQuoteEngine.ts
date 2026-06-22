/**
 * Inbound quote engine -- ties the BookRides parser and the pricing engine
 * to inbound email processing.
 *
 * Flow:
 *   raw email body -> parseBookRidesEmail() -> detectMarket() -> calculateQuote()
 *
 * Three outcomes:
 *   1. priced       -- we have a structured quote ready for review
 *   2. forward_only -- KC market; the inbound is forwarded to the local team
 *   3. manual       -- not parseable as BookRides, falls back to generic AI flow
 *
 * Failure modes (BREAK / HARDEN per CLAUDE.md):
 *   - Email is not BookRides (handled: returns mode='manual')
 *   - Pickup city does not match any known market (handled: returns mode='manual'
 *     with reason='unknown_market')
 *   - Trip has no flat-rate route AND we cannot derive miles (handled: quote
 *     returned with passenger_miles=0 and a warning prompting concierge to fill in)
 *   - State codes missing from addresses (handled: Iowa tax defaults to false,
 *     concierge can override)
 */

import { logger } from '../config/logger';
import { isBookRidesEmail, parseBookRidesEmail, BookRidesTrip } from './bookRidesParser';
import {
  calculateQuote,
  detectFlatRateRoute,
  detectCustomerCategory,
  Market,
  ServiceType,
  Payment,
  TripStop,
  QuoteOutput,
} from './landjetPricing';
import { searchFaqs, FaqMatch } from './landjetFaqService';
import { extractTripFromText } from './nlTripExtraction';

export type InboundProcessMode = 'priced' | 'forward_only' | 'faq' | 'manual';

export interface InboundProcessResult {
  mode: InboundProcessMode;
  trip?: BookRidesTrip;          // present for 'priced' and 'forward_only'
  market?: Market;               // present for 'priced' and 'forward_only'
  quote?: QuoteOutput;           // present for 'priced'
  forward_to?: string[];         // present for 'forward_only'
  forward_reason?: string;       // present for 'forward_only'
  faq_matches?: FaqMatch[];      // present for 'faq' (top matched FAQ entries)
  manual_reason?: string;        // present for 'manual' (e.g., 'not_bookrides', 'unknown_market', 'nl_no_route')
  source?: 'bookrides' | 'nl';   // how the trip was obtained: rigid parse vs LLM extraction
}

// =====================================================================
// MARKET DETECTION
// =====================================================================

/**
 * Map a city or address fragment to a LandJet Market.
 *
 * Detection order:
 *   1. LandJet office identifier in email header ("LandJet Austin", "LJAustin@landjet.com")
 *   2. City name match in pickup address
 *   3. State + heuristic (rare; only when city is unrecognized)
 */
const MARKET_OFFICE_PATTERNS: { market: Market; patterns: RegExp[] }[] = [
  { market: 'quad_cities',  patterns: [/landjet\s+quad\s+cities/i, /ljquadcities@landjet/i, /ljqc@landjet/i] },
  { market: 'des_moines',   patterns: [/landjet\s+des\s+moines/i, /ljdesmoines@landjet/i, /ljdm@landjet/i] },
  { market: 'dallas',       patterns: [/landjet\s+dallas/i, /ljdallas@landjet/i] },
  { market: 'san_antonio',  patterns: [/landjet\s+san\s+antonio/i, /ljsanantonio@landjet/i, /ljsa@landjet/i] },
  { market: 'omaha',        patterns: [/landjet\s+omaha/i, /ljomaha@landjet/i] },
  { market: 'austin',       patterns: [/landjet\s+austin/i, /ljaustin@landjet/i] },
  { market: 'kansas_city',  patterns: [/landjet\s+kansas\s+city/i, /kclandjet\.com/i] },
];

const MARKET_CITY_MAP: { market: Market; cities: string[] }[] = [
  { market: 'quad_cities', cities: ['davenport', 'bettendorf', 'moline', 'rock island', 'quad cities', 'east moline', 'le claire', 'leclaire', 'eldridge', 'blue grass', 'walcott', 'princeton'] },
  { market: 'des_moines',  cities: ['des moines', 'west des moines', 'ankeny', 'urbandale', 'clive'] },
  { market: 'dallas',      cities: ['dallas', 'fort worth', 'plano', 'frisco', 'irving', 'arlington'] },
  { market: 'san_antonio', cities: ['san antonio', 'new braunfels'] },
  { market: 'omaha',       cities: ['omaha', 'lincoln', 'council bluffs'] },
  { market: 'austin',      cities: ['austin', 'round rock', 'cedar park', 'georgetown', 'pflugerville'] },
  { market: 'kansas_city', cities: ['kansas city', 'overland park', 'lee\'s summit', 'leawood', 'olathe'] },
];

export function detectMarketFromOfficeHeader(emailBody: string): Market | null {
  for (const entry of MARKET_OFFICE_PATTERNS) {
    if (entry.patterns.some(p => p.test(emailBody))) return entry.market;
  }
  return null;
}

export function detectMarketFromAddress(address: string): Market | null {
  if (!address) return null;
  const lower = address.toLowerCase();
  for (const entry of MARKET_CITY_MAP) {
    if (entry.cities.some(city => lower.includes(city))) return entry.market;
  }
  return null;
}

/**
 * Best-effort market detection for an inbound BookRides email.
 * Tries office header first, then pickup address, then dropoff address.
 */
export function detectMarketForTrip(emailBody: string, trip: BookRidesTrip): Market | null {
  return (
    detectMarketFromOfficeHeader(emailBody) ||
    detectMarketFromAddress(trip.pickup_address || '') ||
    detectMarketFromAddress(trip.dropoff_address || '') ||
    null
  );
}

// =====================================================================
// STATE EXTRACTION (for Iowa tax determination)
// =====================================================================

/**
 * Extract a 2-letter US state code from a free-form address string.
 * Returns null if no obvious state code is found.
 *
 * Patterns it handles:
 *   "1551 Thoreau Dr N, Schaumburg, IL 60173, USA"  -> 'IL'
 *   "3000 E Grand Ave, Des Moines, IA 50317"        -> 'IA'
 *   "Austin, TX"                                     -> 'TX'
 */
export function extractStateFromAddress(address: string): string | null {
  if (!address) return null;
  // Match a 2-letter state code followed by a 5-digit ZIP, or at the end of a comma-separated segment
  const zipMatch = address.match(/\b([A-Z]{2})\s+\d{5}/);
  if (zipMatch) return zipMatch[1];

  // Fallback: 2-letter code preceded by ", " near the end
  const commaMatch = address.match(/,\s*([A-Z]{2})\b/);
  if (commaMatch) return commaMatch[1];

  return null;
}

export function extractStopsFromTrip(trip: BookRidesTrip): TripStop[] {
  const stops: TripStop[] = [];
  if (trip.pickup_address) {
    const state = extractStateFromAddress(trip.pickup_address);
    if (state) stops.push({ address: trip.pickup_address, state });
  }
  if (trip.dropoff_address) {
    const state = extractStateFromAddress(trip.dropoff_address);
    if (state) stops.push({ address: trip.dropoff_address, state });
  }
  return stops;
}

// =====================================================================
// SERVICE TYPE MAPPING
// =====================================================================

export function mapServiceType(bookRidesType?: string): ServiceType {
  if (!bookRidesType) return 'one_way';
  const lower = bookRidesType.toLowerCase();
  if (lower.includes('round')) return 'round_trip';
  if (lower.includes('hour')) return 'hourly_local';
  return 'one_way';
}

// =====================================================================
// MAIN ORCHESTRATOR
// =====================================================================

/**
 * Process an inbound email body and produce a pricing decision.
 * This is the single entry point the inbound route should call.
 *
 * @param emailBody  Raw email body (text or HTML stripped)
 * @param senderEmail  The sender's email (for customer category detection)
 */
export function processInboundEmail(emailBody: string, senderEmail?: string): InboundProcessResult {
  // Step 1: is this a BookRides email at all?
  if (!isBookRidesEmail(emailBody)) {
    // Try FAQ pre-pass before falling through to manual.
    const faqMatches = searchFaqs(emailBody, { limit: 3, threshold: 0.35 });
    if (faqMatches.length > 0) {
      return { mode: 'faq', faq_matches: faqMatches };
    }
    return { mode: 'manual', manual_reason: 'not_bookrides' };
  }

  // Step 2: parse it
  const trip = parseBookRidesEmail(emailBody);
  if (!trip) {
    return { mode: 'manual', manual_reason: 'parse_failed' };
  }

  // Steps 3-9: price the parsed trip
  return priceTripResult(trip, emailBody, senderEmail, 'bookrides');
}

/**
 * Price a trip (from either the rigid BookRides parser or the NL extractor).
 * Shared so both paths produce identical quote output. `source` is carried
 * through so callers can treat LLM-extracted quotes as needs-review.
 */
export function priceTripResult(
  trip: BookRidesTrip,
  emailBody: string,
  senderEmail: string | undefined,
  source: 'bookrides' | 'nl',
  opts: { passengerMiles?: number } = {},
): InboundProcessResult {
  const market = detectMarketForTrip(emailBody, trip);
  if (!market) {
    if (source !== 'nl') {
      logger.warn('Inbound BookRides email could not be matched to a market', {
        pickup: trip.pickup_address, dropoff: trip.dropoff_address,
      });
    }
    // nl_no_route: we understood it is a booking request but lack a routable
    // pickup/dropoff -- surface it to a human with the extracted details.
    return { mode: 'manual', trip, manual_reason: source === 'nl' ? 'nl_no_route' : 'unknown_market', source };
  }

  const customerEmail = senderEmail || trip.passenger_email;
  const customer_category = detectCustomerCategory(customerEmail);
  const stops = extractStopsFromTrip(trip);
  const service_type = mapServiceType(trip.service_type);
  const flatRoute = detectFlatRateRoute(trip.pickup_address || '', trip.dropoff_address || '');
  const flatRateAmount = flatRoute ? flatRoute.price : undefined;

  let quote: QuoteOutput;
  try {
    quote = calculateQuote({
      market,
      customer_category,
      service_type,
      passenger_miles: opts.passengerMiles && opts.passengerMiles > 0 ? opts.passengerMiles : 0, // real miles when distance lookup succeeds; else concierge fills in
      stops,
      payment: 'credit_card',
      customer_email: customerEmail,
      flat_rate_amount: flatRateAmount,
    });
  } catch (e) {
    logger.error('calculateQuote threw on inbound trip', { error: (e as Error).message });
    return { mode: 'manual', trip, manual_reason: 'pricing_error', source };
  }

  if (quote.pricing_mode === 'forward_only') {
    return { mode: 'forward_only', trip, market, forward_to: quote.forward_to, forward_reason: quote.forward_reason, source };
  }
  return { mode: 'priced', trip, market, quote, source };
}

/**
 * Async wrapper: try the rigid BookRides path first; if the email is not in that
 * format, fall back to an LLM extraction of the trip and price that. This is how
 * free-form requests ("book me an 8-seater Monday, Dallas to DFW") get quoted.
 */
export async function processInboundEmailNL(emailBody: string, senderEmail?: string): Promise<InboundProcessResult> {
  const base = processInboundEmail(emailBody, senderEmail);

  // INCOMPLETE BookRides parse: the rigid parser found a trip but is missing a
  // routable pickup or dropoff (common when the "email" is really a free-form
  // concierge thread, not a structured BookRides quote-request). Fall back to
  // the LLM to fill the missing address, then re-price so distance can apply.
  // Marked source 'nl' so the AI-filled trip stays human-reviewed.
  if (base.mode === 'priced' && base.trip && (!base.trip.pickup_address || !base.trip.dropoff_address)) {
    const filled = await extractTripFromText(emailBody);
    if (filled && (filled.pickup_address || filled.dropoff_address)) {
      const merged: BookRidesTrip = {
        ...base.trip,
        pickup_address: base.trip.pickup_address || filled.pickup_address || undefined,
        dropoff_address: base.trip.dropoff_address || filled.dropoff_address || undefined,
        service_type: base.trip.service_type || filled.service_type || undefined,
        passengers: base.trip.passengers ?? filled.passengers ?? undefined,
        passenger_name: base.trip.passenger_name || filled.passenger_name || 'Customer',
      };
      if (merged.pickup_address && merged.dropoff_address) {
        return priceTripResult(merged, emailBody, senderEmail, 'nl');
      }
    }
    // Could not complete a real route. The rigid parser likely hallucinated a
    // partial trip out of a free-form concierge thread (already-quoted email,
    // flight details, etc.). Do NOT present a fabricated price -- route to a
    // human as manual instead.
    return { mode: 'manual', trip: base.trip, manual_reason: 'incomplete_parse', source: 'bookrides' };
  }

  // Only NL-fall-back when the email simply was not BookRides format. A real
  // BookRides email that failed to parse/price should stay as-is for a human.
  if (base.mode !== 'manual' || (base.manual_reason && base.manual_reason !== 'not_bookrides')) {
    return base;
  }

  const extracted = await extractTripFromText(emailBody);
  if (!extracted) return base; // not a booking request, or extraction unavailable

  const trip: BookRidesTrip = {
    passenger_name: extracted.passenger_name || 'Customer',
    passenger_email: senderEmail,
    pickup_address: extracted.pickup_address || undefined,
    dropoff_address: extracted.dropoff_address || undefined,
    service_type: extracted.service_type || undefined,
    date_of_service: extracted.date_of_service || undefined,
    passengers: extracted.passengers ?? undefined,
    vehicle: extracted.vehicle || undefined,
    raw_extracted_at: new Date().toISOString(),
  };
  return priceTripResult(trip, emailBody, senderEmail, 'nl');
}
