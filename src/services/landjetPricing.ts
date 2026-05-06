/**
 * LandJet quote pricing engine.
 *
 * Source of truth: Master Pricing document provided by Percy on 2026-05-06.
 *
 * Calculation order:
 *   1. Determine pricing mode: FlatRate route OR Hourly (local trips) OR Distance (1+ hour trips)
 *   2. Apply customer category override (JD employee, JD shuttle, Lockton, Investor, Member)
 *   3. Calculate base components (Trip Fee, Mileage, Deadleg, Add'l Driver, Add'l Time, Tolls, Fuel Surcharge, After Hours)
 *   4. SECONDARY = base + Tax + Overnight + Per Diem + flat Gratuity
 *   5. THIRD = SECONDARY + (% Gratuity * SECONDARY)
 *   6. GRAND = THIRD + (3% * THIRD) when CC payment
 *
 * Open items flagged TODO_PERCY -- waiting on confirmation from Percy:
 *   - Customer category detection rule (we use email domain match by default)
 *   - "Iowa-only trip" 7% tax: assumes BOTH pickup and dropoff in Iowa
 *   - Kansas City "needs approval" line items: we apply corp default and flag for concierge
 *   - JD round-trip base rate: master doc says base only on initial leg; sample JD quote applied to both legs.
 *     Default behavior: follow master doc. Override with `applyBaseToReturnLeg` if needed.
 */

import { logger } from '../config/logger';

// =====================================================================
// TYPES
// =====================================================================

export type Market =
  | 'quad_cities'
  | 'des_moines'
  | 'dallas'
  | 'san_antonio'
  | 'omaha'
  | 'austin'
  | 'kansas_city';

export type CustomerCategory =
  | 'standard'
  | 'jd_employee'
  | 'jd_shuttle'
  | 'lockton_employee'
  | 'investor'
  | 'lj_member';

export type ServiceType = 'one_way' | 'round_trip' | 'hourly_local';

export type Payment = 'credit_card' | 'check' | 'invoice';

/**
 * Trip stop -- pickup, dropoff, or intermediate. State must be the 2-letter abbreviation
 * (e.g., 'IA', 'IL'). Used for Iowa-only tax determination per Percy's rule:
 * "Iowa tax when Drop off and Pick-up and ALL STOPS are in Iowa"
 */
export interface TripStop {
  address: string;
  state: string; // 'IA', 'IL', 'TX', etc.
}

export interface QuoteInput {
  market: Market;
  customer_category?: CustomerCategory;
  service_type: ServiceType;
  passenger_miles: number; // total passenger-occupied miles for the leg(s)
  deadleg_miles?: number;  // total empty repositioning miles
  service_hours?: number;  // for hourly trips, OR additional hours over the 10 included
  pickup_at_local?: Date;  // used for after-hours surcharge detection
  is_iowa_only?: boolean;  // legacy: pre-computed Iowa-only flag (true = pickup AND dropoff AND all stops in Iowa)
  stops?: TripStop[];      // preferred: list every stop. Iowa tax applies only if ALL are in IA.
  payment: Payment;
  // Optional: pre-priced flat-rate route override (when caller already detected one)
  flat_rate_amount?: number;
  // Gratuity options (concierge picks one)
  gratuity_amount?: number; // flat dollars
  gratuity_pct?: number;    // 0-1 (e.g., 0.15 for 15%)
  // Multi-day
  overnight_nights?: number;
  per_diem_days?: number;
  // Toll / hospitality / additional stops
  tolls?: number;
  hospitality_cost?: number; // pre-markup; engine adds 10%
  additional_stops?: number; // for flat-rate trips, $50/stop
  additional_drivers_hours?: number; // hours of second driver service
  // Round-trip behavior
  apply_base_to_return_leg?: boolean; // default false (master doc rule)
  // Customer email (used for auto-category detection if customer_category not provided)
  customer_email?: string;
}

export interface QuoteLine {
  label: string;
  amount: number;
  note?: string;
}

export interface QuoteOutput {
  market: Market;
  customer_category: CustomerCategory;
  service_type: ServiceType;
  pricing_mode: 'flat_rate' | 'hourly' | 'distance' | 'forward_only';
  lines: QuoteLine[];
  subtotal: number;        // before gratuity, fuel, CC fees
  secondary_total: number; // after tax + overnight + per diem + flat gratuity
  third_total: number;     // after % gratuity
  grand_total: number;     // after CC fee
  warnings: string[];      // e.g., DOT compliance, "needs approval"
  approvals_needed: string[]; // line items that need concierge approval
  forward_to?: string[];   // populated when pricing_mode === 'forward_only'
  forward_reason?: string; // human-readable reason for forwarding
}

/**
 * Markets the AI engine should NOT quote for. Inbound emails routed to these markets
 * are forwarded to the local concierge team to quote on their own.
 *
 * Per Percy on 2026-05-06: "For now leave KC out. It will be forwarded to an email
 * address and they will quote on their own."
 */
const FORWARD_ONLY_MARKETS: Partial<Record<Market, { recipients: string[]; reason: string }>> = {
  kansas_city: {
    recipients: ['holly@kclandjet.com', 'scott@kclandjet.com'],
    reason: 'Kansas City quotes are handled by the local team (Holly, Scott). Per Percy, AI does not generate KC quotes.',
  },
};

export function isForwardOnlyMarket(market: Market): boolean {
  return market in FORWARD_ONLY_MARKETS;
}

export function getForwardConfig(market: Market) {
  return FORWARD_ONLY_MARKETS[market];
}

// =====================================================================
// RATE CARDS
// =====================================================================

interface MarketRates {
  trip_fee: number;
  mileage_rate: number;
  min_mileage: number;
  overnight: number;
  per_diem_default: number;
  deadleg_per_mi: number;
  additional_time_hr: number;
  additional_driver_hr: number | 'needs_permission';
  hourly_rate: number;
  hourly_min_hours: number;
  fuel_surcharge_per_mi: number | 'needs_approval' | null; // null = none
  cc_fee_pct: number | 'needs_approval' | null; // null = none
  iowa_tax_eligible: boolean; // Iowa markets pay 7% on Iowa-only trips
}

const MARKET_RATES: Record<Market, MarketRates> = {
  quad_cities: {
    trip_fee: 400, mileage_rate: 2.40, min_mileage: 200, overnight: 300, per_diem_default: 300,
    deadleg_per_mi: 1.15, additional_time_hr: 75, additional_driver_hr: 30,
    hourly_rate: 150, hourly_min_hours: 4,
    fuel_surcharge_per_mi: 0.10, cc_fee_pct: 0.03, iowa_tax_eligible: true,
  },
  des_moines: {
    trip_fee: 400, mileage_rate: 2.40, min_mileage: 200, overnight: 300, per_diem_default: 300,
    deadleg_per_mi: 1.15, additional_time_hr: 75, additional_driver_hr: 30,
    hourly_rate: 150, hourly_min_hours: 4,
    fuel_surcharge_per_mi: 0.10, cc_fee_pct: 0.03, iowa_tax_eligible: true,
  },
  dallas: {
    trip_fee: 400, mileage_rate: 2.40, min_mileage: 200, overnight: 300, per_diem_default: 300,
    deadleg_per_mi: 1.15, additional_time_hr: 75, additional_driver_hr: 30,
    hourly_rate: 150, hourly_min_hours: 4,
    fuel_surcharge_per_mi: 0.10, cc_fee_pct: 0.03, iowa_tax_eligible: false,
  },
  san_antonio: {
    trip_fee: 400, mileage_rate: 2.40, min_mileage: 200, overnight: 300, per_diem_default: 300,
    deadleg_per_mi: 1.15, additional_time_hr: 75, additional_driver_hr: 30,
    hourly_rate: 150, hourly_min_hours: 4,
    fuel_surcharge_per_mi: 0.10, cc_fee_pct: 0.03, iowa_tax_eligible: false,
  },
  omaha: {
    trip_fee: 400, mileage_rate: 2.30, min_mileage: 200, overnight: 300, per_diem_default: 300,
    deadleg_per_mi: 2.00, additional_time_hr: 75, additional_driver_hr: 'needs_permission',
    hourly_rate: 125, hourly_min_hours: 4,
    fuel_surcharge_per_mi: null, cc_fee_pct: null, iowa_tax_eligible: false,
  },
  austin: {
    trip_fee: 400, mileage_rate: 2.50, min_mileage: 200, overnight: 325, per_diem_default: 300,
    deadleg_per_mi: 2.00, additional_time_hr: 125, additional_driver_hr: 30,
    hourly_rate: 175, hourly_min_hours: 4,
    fuel_surcharge_per_mi: 0.10, cc_fee_pct: 0.03, iowa_tax_eligible: false,
  },
  kansas_city: {
    trip_fee: 400, mileage_rate: 2.40, min_mileage: 200, overnight: 300, per_diem_default: 300,
    deadleg_per_mi: 2.00, additional_time_hr: 75, additional_driver_hr: 30,
    hourly_rate: 200, hourly_min_hours: 4,
    fuel_surcharge_per_mi: 'needs_approval', cc_fee_pct: 'needs_approval', iowa_tax_eligible: false,
  },
};

// =====================================================================
// CUSTOMER CATEGORY OVERRIDES
// =====================================================================

interface CustomerOverride {
  trip_fee?: number;
  mileage_rate?: number;
  min_mileage?: number;
  default_gratuity_amount?: number;
  /**
   * If true, the trip fee discount applies as a $400 reduction off the trip fee
   * (used for Lockton, Investor, LJ Member where master doc says "$400 discount")
   */
  trip_fee_discount?: number;
  notes?: string[];
}

const CUSTOMER_OVERRIDES: Record<CustomerCategory, CustomerOverride> = {
  standard: {},
  jd_employee: {
    trip_fee: 200,
    mileage_rate: 2.20,
    min_mileage: 200,
    default_gratuity_amount: 100, // master doc: "$75 or $100"
    notes: ['John Deere employee pricing applied'],
  },
  jd_shuttle: {
    trip_fee: 250,
    mileage_rate: 1.65,
    min_mileage: 303.03, // master doc value
    default_gratuity_amount: 100,
    notes: ['John Deere shuttle pricing applied'],
  },
  lockton_employee: {
    mileage_rate: 2.20,
    trip_fee_discount: 400,
    default_gratuity_amount: 100,
    notes: ['Lockton employee: $400 discount off trip fee', 'Invoice $200 base rate to KC when billing'],
  },
  investor: {
    mileage_rate: 2.20,
    trip_fee_discount: 400,
    notes: ['Investor pricing: $400 discount off trip fee', 'Corp markets only -- 10% discount in franchise markets'],
  },
  lj_member: {
    mileage_rate: 2.20,
    trip_fee_discount: 400,
    default_gratuity_amount: 100,
    notes: ['LJ Member pricing: $400 discount off trip fee'],
  },
};

// =====================================================================
// FLAT RATE ROUTES
// =====================================================================

interface FlatRoute {
  pattern: RegExp; // case-insensitive matched against `${pickup}|${dropoff}` normalized
  price: number;
  label: string;
  includes_stops?: number; // default 2; each additional $50
  oneway: boolean;        // true = price is each way, false = price is full round-trip
}

const FLAT_ROUTES: FlatRoute[] = [
  // LJ Connect to Airport
  { label: 'QC -> O\'Hare', pattern: /(quad cities|davenport|bettendorf|moline|rock island).*?(o'?hare|ord)/i, price: 550, oneway: true },
  { label: 'QC -> Chicago Midway', pattern: /(quad cities|davenport|bettendorf|moline|rock island).*?midway/i, price: 550, oneway: true },
  { label: 'QC -> Rockford', pattern: /(quad cities|davenport|bettendorf).*?rockford/i, price: 550, oneway: true },
  { label: 'QC -> Des Moines', pattern: /(quad cities|davenport|bettendorf).*?des moines/i, price: 550, oneway: true },
  { label: 'QC -> Cedar Rapids', pattern: /(quad cities|davenport|bettendorf).*?cedar rapids/i, price: 300, oneway: true },
  { label: 'QC -> Peoria', pattern: /(quad cities|davenport|bettendorf).*?peoria/i, price: 300, oneway: true },
  { label: 'Dubuque -> O\'Hare', pattern: /dubuque.*?(o'?hare|ord)/i, price: 650, oneway: true },
  { label: 'Iowa City -> O\'Hare', pattern: /iowa city.*?(o'?hare|ord)/i, price: 700, oneway: true },
  { label: 'Cedar Rapids -> O\'Hare', pattern: /cedar rapids.*?(o'?hare|ord)/i, price: 750, oneway: true },
  { label: 'Des Moines -> O\'Hare', pattern: /des moines.*?(o'?hare|ord)/i, price: 1100, oneway: true },
  { label: 'Dallas/Fort Worth -> DFW', pattern: /(dallas|fort worth).*?dfw/i, price: 300, oneway: true },
  { label: 'Indy -> Indianapolis Airport', pattern: /indy.*?(indianapolis airport|ind)/i, price: 150, oneway: true },
  // Dormie golf routes
  { label: 'Arbor Links -> QC', pattern: /arbor links.*?(quad cities|davenport)/i, price: 1000, oneway: true },
  { label: 'Arbor Links -> Omaha/Lincoln', pattern: /arbor links.*?(omaha|lincoln)/i, price: 450, oneway: true },
  { label: 'Arbor Links -> Des Moines/KC', pattern: /arbor links.*?(des moines|kansas city)/i, price: 600, oneway: true },
  { label: 'Briggs Ranch -> San Antonio', pattern: /briggs ranch.*?san antonio/i, price: 250, oneway: true },
  { label: 'Briggs Ranch -> Austin', pattern: /briggs ranch.*?austin/i, price: 500, oneway: true },
  { label: 'Briggs Ranch -> Dallas/Houston', pattern: /briggs ranch.*?(dallas|houston)/i, price: 1000, oneway: true },
  { label: 'GreyBull -> Lincoln/Omaha', pattern: /greybull.*?(lincoln|omaha)/i, price: 900, oneway: true },
  { label: 'GreyBull -> Des Moines/KC', pattern: /greybull.*?(des moines|kansas city)/i, price: 900, oneway: true },
  { label: 'Victoria National -> QC', pattern: /victoria national.*?(quad cities|davenport)/i, price: 900, oneway: true },
  { label: 'Victoria National -> Indy', pattern: /victoria national.*?(indy|indianapolis)/i, price: 600, oneway: true },
  // Football game day
  { label: 'QC -> Iowa Hawkeyes (Kinnick)', pattern: /(quad cities|davenport).*?(kinnick|iowa city|iowa hawkeyes)/i, price: 1200, oneway: true },
  { label: 'Des Moines -> Iowa Hawkeyes (Kinnick)', pattern: /des moines.*?(kinnick|iowa city|iowa hawkeyes)/i, price: 1500, oneway: true },
  { label: 'QC -> Iowa State (Jack Trice)', pattern: /(quad cities|davenport).*?(iowa state|cyclones|jack trice|jace trice|ames)/i, price: 1500, oneway: true },
  { label: 'Des Moines -> Iowa State (Jack Trice)', pattern: /des moines.*?(iowa state|cyclones|jack trice|jace trice|ames)/i, price: 1200, oneway: true },
];

export function detectFlatRateRoute(pickup: string, dropoff: string): FlatRoute | null {
  const haystack = `${pickup} ${dropoff}`;
  const reverseHaystack = `${dropoff} ${pickup}`;
  for (const route of FLAT_ROUTES) {
    if (route.pattern.test(haystack) || route.pattern.test(reverseHaystack)) {
      return route;
    }
  }
  return null;
}

// =====================================================================
// CUSTOMER CATEGORY DETECTION (default rule)
// =====================================================================

const KNOWN_DOMAINS: Record<string, CustomerCategory> = {
  'johndeere.com': 'jd_employee',
  'lockton.com': 'lockton_employee',
};

export function detectCustomerCategory(email?: string): CustomerCategory {
  if (!email || !email.includes('@')) return 'standard';
  const domain = email.split('@')[1].toLowerCase().trim();
  return KNOWN_DOMAINS[domain] || 'standard';
}

/**
 * Determine if Iowa 7% tax applies. Per Percy on 2026-05-06: tax only when
 * pickup, dropoff, AND every intermediate stop are all in Iowa.
 *
 * Accepts either pre-computed `is_iowa_only` boolean or an explicit `stops` list.
 * If `stops` provided, it overrides the boolean (more reliable).
 */
export function isIowaOnlyTrip(input: Pick<QuoteInput, 'is_iowa_only' | 'stops'>): boolean {
  if (input.stops && input.stops.length > 0) {
    return input.stops.every(s => s.state.trim().toUpperCase() === 'IA');
  }
  return !!input.is_iowa_only;
}

// =====================================================================
// MAIN QUOTE FUNCTION
// =====================================================================

export function calculateQuote(input: QuoteInput): QuoteOutput {
  const market = input.market;
  const rates = MARKET_RATES[market];
  if (!rates) throw new Error(`Unknown market: ${market}`);

  // Forward-only markets short-circuit: AI does NOT quote, just routes to local team
  if (isForwardOnlyMarket(market)) {
    const cfg = getForwardConfig(market)!;
    return {
      market,
      customer_category: input.customer_category || 'standard',
      service_type: input.service_type,
      pricing_mode: 'forward_only',
      lines: [],
      subtotal: 0,
      secondary_total: 0,
      third_total: 0,
      grand_total: 0,
      warnings: [`Forward-only market: ${market}. ${cfg.reason}`],
      approvals_needed: [],
      forward_to: cfg.recipients,
      forward_reason: cfg.reason,
    };
  }

  // Determine customer category (explicit > email-detected > standard)
  const customer_category: CustomerCategory =
    input.customer_category || detectCustomerCategory(input.customer_email) || 'standard';
  const override = CUSTOMER_OVERRIDES[customer_category];

  // Apply overrides to rates
  const effective_trip_fee = (override.trip_fee ?? rates.trip_fee) - (override.trip_fee_discount ?? 0);
  const effective_mileage_rate = override.mileage_rate ?? rates.mileage_rate;
  const effective_min_mileage = override.min_mileage ?? rates.min_mileage;

  const lines: QuoteLine[] = [];
  const warnings: string[] = [];
  const approvals_needed: string[] = [];

  // ------------------------------------------------------------------
  // FLAT RATE MODE
  // ------------------------------------------------------------------
  if (input.flat_rate_amount != null) {
    return buildFlatRateQuote(input, customer_category, market, lines, warnings, approvals_needed);
  }

  // ------------------------------------------------------------------
  // HOURLY MODE (local trips)
  // ------------------------------------------------------------------
  if (input.service_type === 'hourly_local') {
    const hours = Math.max(input.service_hours || 0, rates.hourly_min_hours);
    if ((input.service_hours || 0) < rates.hourly_min_hours) {
      warnings.push(`Hourly minimum ${rates.hourly_min_hours} hours applied (requested ${input.service_hours || 0})`);
    }
    lines.push({ label: `Hourly Rate (${hours} hrs @ $${rates.hourly_rate}/hr)`, amount: hours * rates.hourly_rate });
    if (input.tolls) lines.push({ label: 'Tolls', amount: input.tolls });
    return finalizeQuote({
      market, customer_category, service_type: input.service_type,
      pricing_mode: 'hourly', lines, input, rates, warnings, approvals_needed, suppress_trip_fee: true, suppress_mileage: true,
    });
  }

  // ------------------------------------------------------------------
  // DISTANCE MODE (default for one-way and round-trip)
  // ------------------------------------------------------------------
  // Trip Fee (base rate)
  // Master doc rule: applied to one-way trips and the INITIAL leg of round-trips, NOT the return leg
  // Override available via apply_base_to_return_leg (matches some JD quotes)
  const passenger_miles = input.passenger_miles;
  const deadleg_miles = input.deadleg_miles ?? 0;

  // Trip fee
  if (input.service_type === 'one_way') {
    lines.push({ label: 'Base Rate', amount: effective_trip_fee });
  } else if (input.service_type === 'round_trip') {
    if (input.apply_base_to_return_leg) {
      lines.push({ label: 'Base Rate (initial leg)', amount: effective_trip_fee });
      lines.push({ label: 'Base Rate (return leg)', amount: effective_trip_fee, note: 'TODO_PERCY: master doc says return leg is $0; this matches JD sample quote' });
    } else {
      lines.push({ label: 'Base Rate (initial leg only)', amount: effective_trip_fee });
    }
  }

  // Mileage (apply min)
  const billable_miles = Math.max(passenger_miles, effective_min_mileage);
  if (billable_miles > passenger_miles) {
    warnings.push(`Mileage minimum ${effective_min_mileage} mi applied (actual ${passenger_miles} mi)`);
  }
  lines.push({ label: `Distance Rate (${billable_miles} mi @ $${effective_mileage_rate.toFixed(2)}/mi)`, amount: billable_miles * effective_mileage_rate });

  // Deadleg
  if (deadleg_miles > 0) {
    lines.push({ label: `Dead Leg (${deadleg_miles} mi @ $${rates.deadleg_per_mi.toFixed(2)}/mi)`, amount: deadleg_miles * rates.deadleg_per_mi });
  }

  // Additional Time (hours over the 10 included)
  if ((input.service_hours || 0) > 10) {
    const overage = (input.service_hours || 0) - 10;
    lines.push({ label: `Additional Time (${overage} hrs @ $${rates.additional_time_hr}/hr)`, amount: overage * rates.additional_time_hr });
  }

  // Additional Driver
  if (input.additional_drivers_hours && input.additional_drivers_hours > 0) {
    if (rates.additional_driver_hr === 'needs_permission') {
      approvals_needed.push(`Additional driver in ${market} requires permission`);
    } else {
      lines.push({ label: `Additional Driver (${input.additional_drivers_hours} hrs @ $${rates.additional_driver_hr}/hr)`, amount: input.additional_drivers_hours * rates.additional_driver_hr });
    }
  }

  // Tolls
  if (input.tolls) lines.push({ label: 'Tolls', amount: input.tolls });

  // Hospitality Package
  if (input.hospitality_cost) {
    const total = input.hospitality_cost * 1.10;
    lines.push({ label: `Hospitality Package (cost + 10%)`, amount: total });
  }

  // Fuel Surcharge
  const total_miles = billable_miles + deadleg_miles;
  if (rates.fuel_surcharge_per_mi === 'needs_approval') {
    approvals_needed.push(`Kansas City fuel surcharge ($${0.10}/mi default) needs approval`);
    // Apply default and flag
    lines.push({ label: `Fuel Surcharge (${total_miles} mi @ $0.10/mi) -- pending approval`, amount: total_miles * 0.10, note: 'Pending Holly/Scott approval' });
  } else if (rates.fuel_surcharge_per_mi != null) {
    lines.push({ label: `Fuel Surcharge (${total_miles} mi @ $${rates.fuel_surcharge_per_mi}/mi)`, amount: total_miles * rates.fuel_surcharge_per_mi });
  }

  // After Hours Surcharge
  if (input.pickup_at_local) {
    const hour = input.pickup_at_local.getHours();
    if (hour >= 23 || hour < 5) {
      lines.push({ label: 'After Hours Surcharge (pickup 11pm-5am)', amount: 200, note: 'Added to driver gratuity' });
    }
  }

  return finalizeQuote({
    market, customer_category, service_type: input.service_type,
    pricing_mode: 'distance', lines, input, rates, warnings, approvals_needed,
  });
}

// =====================================================================
// HELPERS
// =====================================================================

function buildFlatRateQuote(
  input: QuoteInput,
  customer_category: CustomerCategory,
  market: Market,
  lines: QuoteLine[],
  warnings: string[],
  approvals_needed: string[],
): QuoteOutput {
  const rates = MARKET_RATES[market];
  lines.push({ label: 'Flat Rate', amount: input.flat_rate_amount! });

  // Additional stops past the 2 included
  if (input.additional_stops && input.additional_stops > 0) {
    lines.push({ label: `Additional Stops (${input.additional_stops} @ $50)`, amount: input.additional_stops * 50 });
  }

  if (input.tolls) lines.push({ label: 'Tolls', amount: input.tolls });

  return finalizeQuote({
    market, customer_category, service_type: input.service_type,
    pricing_mode: 'flat_rate', lines, input, rates, warnings, approvals_needed,
    suppress_trip_fee: true, suppress_mileage: true, suppress_fuel_surcharge: true,
  });
}

interface FinalizeArgs {
  market: Market;
  customer_category: CustomerCategory;
  service_type: ServiceType;
  pricing_mode: 'flat_rate' | 'hourly' | 'distance';
  lines: QuoteLine[];
  input: QuoteInput;
  rates: MarketRates;
  warnings: string[];
  approvals_needed: string[];
  suppress_trip_fee?: boolean;
  suppress_mileage?: boolean;
  suppress_fuel_surcharge?: boolean;
}

function finalizeQuote(args: FinalizeArgs): QuoteOutput {
  const { input, rates, lines, warnings, approvals_needed } = args;

  const subtotal = sum(lines);

  // Tax (Iowa-only trips at 7%) -- per Percy: pickup AND dropoff AND ALL stops in Iowa
  const apply_iowa_tax = !!(isIowaOnlyTrip(input) && rates.iowa_tax_eligible);
  const tax = apply_iowa_tax ? subtotal * 0.07 : 0;
  if (tax > 0) lines.push({ label: 'Iowa Tax (7%)', amount: tax });

  // Overnight + Per Diem
  if (input.overnight_nights && input.overnight_nights > 0) {
    lines.push({ label: `Overnight Fee (${input.overnight_nights} nights @ $${rates.overnight})`, amount: input.overnight_nights * rates.overnight });
  }
  if (input.per_diem_days && input.per_diem_days > 0) {
    lines.push({ label: `Per Diem (${input.per_diem_days} days @ $${rates.per_diem_default})`, amount: input.per_diem_days * rates.per_diem_default });
  }

  // Flat dollar gratuity (or default for customer category)
  const override = CUSTOMER_OVERRIDES[args.customer_category];
  const flat_gratuity = input.gratuity_amount ?? (override.default_gratuity_amount && input.gratuity_pct == null ? override.default_gratuity_amount : 0);
  if (flat_gratuity > 0) lines.push({ label: 'Gratuity', amount: flat_gratuity });

  const secondary_total = sum(lines);

  // Percentage gratuity (only one or the other)
  let pct_gratuity = 0;
  if (input.gratuity_pct && input.gratuity_pct > 0 && !input.gratuity_amount) {
    pct_gratuity = secondary_total * input.gratuity_pct;
    lines.push({ label: `Gratuity (${(input.gratuity_pct * 100).toFixed(0)}%)`, amount: pct_gratuity });
  }
  const third_total = secondary_total + pct_gratuity;

  // CC Convenience Fee
  let cc_fee = 0;
  if (input.payment === 'credit_card') {
    if (rates.cc_fee_pct === 'needs_approval') {
      approvals_needed.push(`Kansas City CC fee (3% default) needs approval`);
      cc_fee = third_total * 0.03;
      lines.push({ label: 'CC Convenience Fee (3%) -- pending approval', amount: cc_fee, note: 'Pending Holly/Scott approval' });
    } else if (rates.cc_fee_pct != null && rates.cc_fee_pct > 0) {
      cc_fee = third_total * rates.cc_fee_pct;
      lines.push({ label: `CC Convenience Fee (${(rates.cc_fee_pct * 100).toFixed(0)}%)`, amount: cc_fee });
    }
  }
  const grand_total = third_total + cc_fee;

  // Push customer-category notes as warnings
  for (const note of override.notes ?? []) warnings.push(note);

  // DOT compliance check
  if ((input.service_hours ?? 0) > 15 && !input.additional_drivers_hours) {
    warnings.push('DOT: trips over 15 hrs require a second driver. Add additional_drivers_hours.');
  }

  return {
    market: args.market,
    customer_category: args.customer_category,
    service_type: args.service_type,
    pricing_mode: args.pricing_mode,
    lines,
    subtotal,
    secondary_total,
    third_total,
    grand_total,
    warnings,
    approvals_needed,
  };
}

function sum(lines: QuoteLine[]): number {
  return Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
}
