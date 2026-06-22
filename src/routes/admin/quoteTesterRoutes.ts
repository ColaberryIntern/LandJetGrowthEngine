// Quote Tester API -- Lorie + reservation desk + Ali test interface.
//
// Two input modes:
//   1. paste -- a BookRides email body. We run the existing parser to extract
//      pickup, dropoff, etc., then run the pricing engine.
//   2. manual -- a structured QuoteInput, used when you want to test a
//      what-if scenario without crafting an email.
//
// Returns the full QuoteOutput from the pricing engine PLUS a calculation
// trail: each major step (mode detection, customer category, base rate,
// mileage, deadleg, surcharges, tax, multi-day, gratuity, CC fee) with the
// inputs that drove it and the running total after that step. This is what
// lets the UI show "here is exactly why this quote came out to $X".
//
// Margin calculator: if cost inputs are configured in system_settings, we
// compute projected margin and assign a routing band:
//   60%+   -> green  (auto-approve)
//   50-60  -> amber  (reservation desk approval)
//   <50    -> red    (Ryan approval)

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { logger } from '../../config/logger';
import {
  calculateQuote,
  detectCustomerCategory,
  detectFlatRateRoute,
  isIowaOnlyTrip,
  isGarageCity,
  type QuoteInput,
  type QuoteOutput,
  type CustomerCategory,
  type Market,
  type ServiceType,
} from '../../services/landjetPricing';
import {
  parseBookRidesEmail,
  isBookRidesEmail,
} from '../../services/bookRidesParser';
import {
  detectMarketForTrip,
  extractStopsFromTrip,
  mapServiceType,
} from '../../services/inboundQuoteEngine';
import { SystemSetting } from '../../models/SystemSetting';

const router = Router();
router.use(authenticate);

// ---------------------------------------------------------------------------
// Calculation trail -- structured explanation of how the quote was built
// ---------------------------------------------------------------------------

interface TrailStep {
  phase: string;         // short label, e.g. "Pricing Mode", "Base Rate"
  explanation: string;   // human-readable why
  inputs: Record<string, unknown>;
  output: { label: string; amount: number } | null; // null = informational only
  running_total: number;
}

function buildTrail(input: QuoteInput, output: QuoteOutput): TrailStep[] {
  const trail: TrailStep[] = [];
  let running = 0;

  // Phase 1: pricing mode detection
  trail.push({
    phase: 'Pricing Mode',
    explanation: output.pricing_mode === 'flat_rate'
      ? 'Trip matched a registered flat-rate route (airport or Dormie golf network), so flat-rate pricing applies.'
      : output.pricing_mode === 'hourly'
      ? 'Service type is "hourly_local" -- billed by the hour with the market minimum.'
      : output.pricing_mode === 'forward_only'
      ? 'This market is forwarded to a local concierge team. The AI engine does not generate a quote.'
      : 'Trip is distance-based -- billed per mile with a 200-mile minimum.',
    inputs: {
      market: input.market,
      service_type: input.service_type,
      flat_rate_amount: input.flat_rate_amount ?? null,
      passenger_miles: input.passenger_miles,
    },
    output: null,
    running_total: 0,
  });

  // Phase 2: customer category
  trail.push({
    phase: 'Customer Category',
    explanation: output.customer_category === 'jd_employee'
      ? 'John Deere employee pricing applied ($200 trip fee, $2.20/mi, $100 default gratuity).'
      : output.customer_category === 'jd_shuttle'
      ? 'John Deere shuttle pricing applied ($250 trip fee, $1.65/mi, 303-mile minimum).'
      : output.customer_category === 'lockton_employee'
      ? 'Lockton employee pricing -- $400 discount off trip fee, $2.20/mi.'
      : output.customer_category === 'investor'
      ? 'Investor pricing -- $400 discount off trip fee, $2.20/mi.'
      : output.customer_category === 'lj_member'
      ? 'LJ Member pricing -- $400 discount off trip fee, $2.20/mi.'
      : 'Standard customer pricing (no override).',
    inputs: {
      customer_email: input.customer_email ?? null,
      explicit_category: input.customer_category ?? null,
    },
    output: null,
    running_total: 0,
  });

  // Phase 3+: walk the line items in order, group by phase
  const groupOf = (label: string): string => {
    if (/Base Rate|Flat Rate/i.test(label)) return 'Base Rate';
    if (/Distance Rate/i.test(label)) return 'Mileage';
    if (/Dead Leg/i.test(label)) return 'Dead Leg';
    if (/Additional Time|Additional Driver/i.test(label)) return 'Add\'l Time / Driver';
    if (/Tolls/i.test(label)) return 'Tolls';
    if (/Fuel Surcharge/i.test(label)) return 'Fuel Surcharge';
    if (/After Hours/i.test(label)) return 'After Hours';
    if (/Hospitality/i.test(label)) return 'Hospitality';
    if (/Hourly Rate/i.test(label)) return 'Hourly Rate';
    if (/Additional Stops/i.test(label)) return 'Additional Stops';
    if (/Iowa Tax/i.test(label)) return 'Iowa Tax';
    if (/Overnight/i.test(label)) return 'Overnight';
    if (/Per Diem/i.test(label)) return 'Per Diem';
    if (/Gratuity/i.test(label)) return 'Gratuity';
    if (/CC Convenience Fee/i.test(label)) return 'CC Fee';
    return 'Line Item';
  };
  const explanationOf = (group: string, amount: number): string => {
    switch (group) {
      case 'Base Rate': return `Per-booking trip fee. One per booking regardless of round-trip vs one-way.`;
      case 'Mileage': return `Distance rate. Billed at the per-mile rate for the customer category. If the trip is under 200 miles the minimum applies and is shown in the label.`;
      case 'Dead Leg': return `Empty repositioning miles when neither pickup nor dropoff is a garage city. Charged at the deadleg per-mile rate.`;
      case 'Add\'l Time / Driver': return `Hours above the 10 included or a second driver. Charged at the market additional-time / additional-driver rate.`;
      case 'Tolls': return `Per-route or per-trip tolls. QC to ORD and MDW each carry a $10 toll baked into the flat rate; concierge can add others.`;
      case 'Fuel Surcharge': return `Per-mile surcharge applied when gas is above $4/gallon. Total mileage (passenger + deadleg) at the market surcharge rate.`;
      case 'After Hours': return `Pickup between 11pm and 5am. Flat $200 added to driver gratuity.`;
      case 'Hospitality': return `Catering or hospitality package cost plus 10% markup.`;
      case 'Hourly Rate': return `Hourly local trips. Minimum 4 hours at the market rate.`;
      case 'Additional Stops': return `Stops past the 2 included. $50 each.`;
      case 'Iowa Tax': return `7% Iowa sales tax. Applies only when pickup, dropoff, AND every intermediate stop is in Iowa.`;
      case 'Overnight': return `Per-night hotel charge for the driver.`;
      case 'Per Diem': return `Driver standby day rate (when driver waits while customer has meetings).`;
      case 'Gratuity': return `Auto-applied 20% on flat-rate quotes. Distance quotes use the per-category default if no explicit gratuity is set.`;
      case 'CC Fee': return `3% credit card convenience fee. Only applied on credit_card payment method.`;
      default: return `Line item from the pricing engine.`;
    }
  };

  for (const line of output.lines) {
    const group = groupOf(line.label);
    running += line.amount;
    trail.push({
      phase: group,
      explanation: explanationOf(group, line.amount),
      inputs: { label: line.label, note: line.note ?? null },
      output: { label: line.label, amount: line.amount },
      running_total: Math.round(running * 100) / 100,
    });
  }

  return trail;
}

// ---------------------------------------------------------------------------
// Margin calculator -- pulls cost inputs from system_settings if configured
// ---------------------------------------------------------------------------

interface CostInputs {
  cost_per_mile: number;
  driver_hourly: number;
  fuel_per_gallon: number;
  vehicle_mpg: number;
  other_variable_per_trip: number;
  configured: boolean;
}

async function getCostInputs(): Promise<CostInputs> {
  const setting = await SystemSetting.findOne({ where: { key: 'cost_inputs' } });
  const value = (setting?.value as Record<string, number>) || {};
  return {
    cost_per_mile: value.cost_per_mile ?? 1.20,
    driver_hourly: value.driver_hourly ?? 20,
    fuel_per_gallon: value.fuel_per_gallon ?? 3.50,
    vehicle_mpg: value.vehicle_mpg ?? 18,
    other_variable_per_trip: value.other_variable_per_trip ?? 0,
    configured: !!setting,
  };
}

interface MarginResult {
  configured: boolean;
  total_revenue: number;
  total_cost: number;
  margin_amount: number;
  margin_pct: number;
  band: 'green' | 'amber' | 'red';
  approval: 'auto' | 'reservation_desk' | 'ryan';
  cost_breakdown: { label: string; amount: number }[];
}

function computeMargin(input: QuoteInput, output: QuoteOutput, costs: CostInputs): MarginResult {
  const totalMiles = (input.passenger_miles || 0) + (input.deadleg_miles || 0);
  const drivingHours = totalMiles / 50; // ~50 mph average
  const fuelCost = (totalMiles / costs.vehicle_mpg) * costs.fuel_per_gallon;
  const driverCost = drivingHours * costs.driver_hourly;
  const vehicleCost = totalMiles * costs.cost_per_mile;
  const other = costs.other_variable_per_trip;

  const cost_breakdown = [
    { label: 'Driver hours', amount: Math.round(driverCost * 100) / 100 },
    { label: `Fuel (${totalMiles} mi @ ${costs.vehicle_mpg} mpg)`, amount: Math.round(fuelCost * 100) / 100 },
    { label: 'Vehicle (per-mile cost)', amount: Math.round(vehicleCost * 100) / 100 },
    { label: 'Other variable', amount: other },
  ];
  const total_cost = cost_breakdown.reduce((s, c) => s + c.amount, 0);
  const total_revenue = output.grand_total;
  const margin_amount = total_revenue - total_cost;
  const margin_pct = total_revenue > 0 ? (margin_amount / total_revenue) * 100 : 0;
  let band: 'green' | 'amber' | 'red' = 'green';
  let approval: 'auto' | 'reservation_desk' | 'ryan' = 'auto';
  if (margin_pct < 50) { band = 'red'; approval = 'ryan'; }
  else if (margin_pct < 60) { band = 'amber'; approval = 'reservation_desk'; }
  return {
    configured: costs.configured,
    total_revenue: Math.round(total_revenue * 100) / 100,
    total_cost: Math.round(total_cost * 100) / 100,
    margin_amount: Math.round(margin_amount * 100) / 100,
    margin_pct: Math.round(margin_pct * 10) / 10,
    band,
    approval,
    cost_breakdown,
  };
}

// ---------------------------------------------------------------------------
// Google Maps helpers -- Distance Matrix + Embed Directions
// ---------------------------------------------------------------------------

function buildEmbedUrl(origin: string, destination: string, roundTrip: boolean): string | null {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || !origin || !destination) return null;
  // For round trip, route A -> B -> A via waypoint so the map shows the loop.
  const params = new URLSearchParams({ key, mode: 'driving' });
  if (roundTrip) {
    params.set('origin', origin);
    params.set('destination', origin);
    params.set('waypoints', destination);
  } else {
    params.set('origin', origin);
    params.set('destination', destination);
  }
  return `https://www.google.com/maps/embed/v1/directions?${params.toString()}`;
}

async function fetchDistanceMatrix(origin: string, destination: string): Promise<{ miles: number; duration_min: number } | { error: string }> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return { error: 'GOOGLE_MAPS_API_KEY is not configured on the server. Add it to the backend .env to enable auto-mileage.' };
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&units=imperial&key=${key}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!r.ok) return { error: `Google Distance Matrix returned HTTP ${r.status}.` };
    const data: any = await r.json();
    if (data.status !== 'OK') return { error: `Google Distance Matrix status: ${data.status} ${data.error_message || ''}`.trim() };
    const el = data.rows?.[0]?.elements?.[0];
    if (!el || el.status !== 'OK') return { error: `Route not found between those addresses (status: ${el?.status || 'unknown'}).` };
    const miles = Math.round((el.distance.value / 1609.344) * 10) / 10;
    const duration_min = Math.round(el.duration.value / 60);
    return { miles, duration_min };
  } catch (e) {
    return { error: `Google Distance Matrix call failed: ${(e as Error).message}` };
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

router.post('/test', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { method, email_body, quote_input, pickup_address, dropoff_address } = req.body || {};

    let resolvedInput: QuoteInput;
    let parsedTrip: any = null;
    let parseError: string | null = null;
    let mapOrigin: string | null = null;
    let mapDestination: string | null = null;
    let mapRoundTrip = false;

    if (method === 'paste') {
      if (!email_body || typeof email_body !== 'string') {
        return res.status(400).json({ error: 'email_body is required for paste mode' });
      }
      if (!isBookRidesEmail(email_body)) {
        // Allow it anyway -- maybe a different inbound format -- but flag.
        parseError = 'Body does not look like a BookRides email. Trying anyway.';
      }
      const trip = parseBookRidesEmail(email_body);
      if (!trip) {
        return res.status(400).json({ error: 'Could not parse trip details from the email. Use manual mode instead.' });
      }
      parsedTrip = trip;
      const market = detectMarketForTrip(email_body, trip);
      if (!market) {
        return res.status(400).json({
          error: 'Could not detect market from email. Use manual mode with explicit market.',
          parsed_trip: trip,
        });
      }
      const stops = extractStopsFromTrip(trip);
      resolvedInput = {
        market,
        service_type: mapServiceType(trip.service_type),
        // BookRides parser does not extract miles -- caller can override via
        // manual mode for the distance. Default to 200 so the engine returns
        // the minimum-mileage fallback rather than $0.
        passenger_miles: 200,
        stops,
        payment: 'credit_card',
        customer_email: trip.passenger_email,
      };
      mapOrigin = trip.pickup_address || null;
      mapDestination = trip.dropoff_address || null;
      mapRoundTrip = /round\s*trip/i.test(trip.service_type || '');
    } else if (method === 'manual') {
      if (!quote_input || typeof quote_input !== 'object') {
        return res.status(400).json({ error: 'quote_input is required for manual mode' });
      }
      resolvedInput = quote_input as QuoteInput;
      mapOrigin = (pickup_address || '').toString().trim() || null;
      mapDestination = (dropoff_address || '').toString().trim() || null;
      mapRoundTrip = resolvedInput.service_type === 'round_trip';
    } else {
      return res.status(400).json({ error: 'method must be "paste" or "manual"' });
    }

    const quote = calculateQuote(resolvedInput);
    const trail = buildTrail(resolvedInput, quote);
    const costs = await getCostInputs();
    const margin = computeMargin(resolvedInput, quote, costs);

    const map_embed_url = (mapOrigin && mapDestination) ? buildEmbedUrl(mapOrigin, mapDestination, mapRoundTrip) : null;

    res.json({
      method,
      parse_error: parseError,
      parsed_trip: parsedTrip,
      input: resolvedInput,
      quote,
      trail,
      margin,
      map: {
        origin: mapOrigin,
        destination: mapDestination,
        round_trip: mapRoundTrip,
        embed_url: map_embed_url,
        configured: !!process.env.GOOGLE_MAPS_API_KEY,
      },
    });
  } catch (error) {
    logger.error('POST /admin/quotes/test failed', { error: (error as Error).message });
    next(error);
  }
});

// Distance lookup -- Google Distance Matrix wrapper. Used to auto-fill
// passenger_miles in manual mode and to render the embed map.
router.post('/distance', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { origin, destination, round_trip } = req.body || {};
    if (!origin || !destination || typeof origin !== 'string' || typeof destination !== 'string') {
      return res.status(400).json({ error: 'origin and destination are required strings' });
    }
    const result = await fetchDistanceMatrix(origin, destination);
    if ('error' in result) {
      return res.status(200).json({
        configured: !!process.env.GOOGLE_MAPS_API_KEY,
        error: result.error,
        embed_url: buildEmbedUrl(origin, destination, !!round_trip),
      });
    }
    res.json({
      configured: true,
      miles: result.miles,
      duration_min: result.duration_min,
      embed_url: buildEmbedUrl(origin, destination, !!round_trip),
    });
  } catch (error) {
    logger.error('POST /admin/quotes/distance failed', { error: (error as Error).message });
    next(error);
  }
});

// Cost inputs management -- so Ali (or eventually Ryan via the UI) can
// update the assumptions without redeploying code.
router.get('/cost-inputs', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const costs = await getCostInputs();
    res.json(costs);
  } catch (error) { next(error); }
});

router.put('/cost-inputs', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body || {};
    const value = {
      cost_per_mile: Number(body.cost_per_mile) || 0,
      driver_hourly: Number(body.driver_hourly) || 0,
      fuel_per_gallon: Number(body.fuel_per_gallon) || 0,
      vehicle_mpg: Number(body.vehicle_mpg) || 18,
      other_variable_per_trip: Number(body.other_variable_per_trip) || 0,
    };
    await SystemSetting.upsert({
      key: 'cost_inputs',
      value: value as any,
      description: 'Cost inputs for margin calculator (set by Ali per Ryan inputs)',
    });
    res.json({ ...value, configured: true });
  } catch (error) { next(error); }
});

// Sample BookRides emails -- for the UI to offer quick "try one of these".
// Format matches the real notifications LandJet receives from bookridesonline.com
// (verified against a real email pulled from the LJ Austin inbox 2026-03-03).
// Each sample exercises a specific engine path so the team can validate the
// 2026-05-21 Lorie corrections in one click each.
router.get('/samples', authorize('campaigns:read'), async (_req: Request, res: Response) => {
  res.json([
    {
      name: 'Real: Blake Wilson IL -> IA round trip',
      category: 'real',
      blurb: 'Actual BookRides email from 2026-03-03. Schaumburg IL pickup, Des Moines IA dropoff, round trip. Tests cross-state routing (no Iowa tax should apply).',
      email_body: `LandJet Austin\n8830 Business Park Drive, Suite 100, Austin, TX 78759\n8665263538\nLJAustin@landjet.com\n\nQuote Request\n\nTrip Details\n\nPassenger Info\n\nBlake Wilson\nPhone: 6054600604\nEmail: Blakewilson1188@gmail.com\n\nReservation Info\n\nDate Of Service: 04/07/2026\nService Type: Round Trip\nStart Time: 8:27 AM\nReservation #: 3341491\nPassengers: 2\nLuggage: 1\nVehicle: Conference Room\n\nPickup\n\n1551 Thoreau Dr N, Schaumburg, IL 60173, USA\n\nDropoff\n\n3000 E Grand Ave, Des Moines, IA 50317, USA\n`,
    },
    {
      name: "QC -> O'Hare flat rate",
      category: 'flat_rate',
      blurb: 'Davenport to O\'Hare. Triggers the $550 QC->ORD flat rate with the $10 toll and auto-20% gratuity (per Lorie 2026-05-21).',
      email_body: `LandJet Quad Cities\nLJQuadCities@landjet.com\n\nQuote Request\n\nPassenger Info\n\nMatt Tuft\nPhone: 3094567890\nEmail: matt.tuft@insightassetmgmt.com\n\nReservation Info\n\nDate Of Service: 06/15/2026\nService Type: One Way\nStart Time: 5:30 AM\nReservation #: 3341492\nPassengers: 1\nLuggage: 1\nVehicle: Executive Sedan\n\nPickup\n\n2950 Eastern Ave, Davenport, IA 52803, USA\n\nDropoff\n\n10000 W O'Hare Ave, Chicago, IL 60666, USA\n`,
    },
    {
      name: 'QC -> Des Moines distance',
      category: 'distance',
      blurb: 'Confirms the 2026-05-21 fix: QC->DSM is NOT a flat rate. Should price as distance ($400 base + $2.40/mi + Iowa 7% tax since all-IA).',
      email_body: `LandJet Quad Cities\nLJQuadCities@landjet.com\n\nQuote Request\n\nPassenger Info\n\nJane Doe\nPhone: 5631234567\nEmail: jane.doe@example.com\n\nReservation Info\n\nDate Of Service: 06/20/2026\nService Type: One Way\nStart Time: 2:00 PM\nReservation #: 3341493\nPassengers: 3\nLuggage: 2\nVehicle: Executive Sedan\n\nPickup\n\n123 Main St, Davenport, IA 52801, USA\n\nDropoff\n\n555 Walnut St, Des Moines, IA 50309, USA\n`,
    },
    {
      name: 'JD employee round-trip',
      category: 'customer_category',
      blurb: 'John Deere domain email triggers JD rate card: $200 trip fee, $2.20/mi, $100 default gratuity. Trip fee is ONE per booking per Ryan 2026-05-21.',
      email_body: `LandJet Quad Cities\nLJQuadCities@landjet.com\n\nQuote Request\n\nPassenger Info\n\nPraful Kolte\nPhone: 3098001234\nEmail: KoltePrafulA@JohnDeere.com\n\nReservation Info\n\nDate Of Service: 06/12/2026\nService Type: Round Trip\nStart Time: 7:00 AM\nReservation #: 3341494\nPassengers: 2\nLuggage: 0\nVehicle: Conference Room\n\nPickup\n\n1 John Deere Pl, Moline, IL 61265, USA\n\nDropoff\n\nJohn Deere Des Moines Works, Ankeny, IA 50021, USA\n`,
    },
    {
      name: 'Kansas City forward-only',
      category: 'forward_only',
      blurb: 'Per Percy 2026-05-06: AI does NOT quote KC. Should return pricing_mode=forward_only with holly@ + scott@ kclandjet.com recipients.',
      email_body: `LandJet Kansas City\nLJKansasCity@landjet.com\n\nQuote Request\n\nPassenger Info\n\nTom Harris\nPhone: 8161234567\nEmail: tom@example.com\n\nReservation Info\n\nDate Of Service: 06/22/2026\nService Type: One Way\nStart Time: 11:00 AM\nReservation #: 3341495\nPassengers: 1\nLuggage: 1\nVehicle: Executive Sedan\n\nPickup\n\n1 Arrowhead Dr, Kansas City, MO 64129, USA\n\nDropoff\n\nKansas City International Airport, MO 64153, USA\n`,
    },
    {
      name: 'After-hours pickup (3am)',
      category: 'surcharge',
      blurb: 'Pickup between 11pm and 5am triggers the $200 after-hours surcharge added to driver gratuity.',
      email_body: `LandJet Dallas\nLJDallas@landjet.com\n\nQuote Request\n\nPassenger Info\n\nSarah Mitchell\nPhone: 2141234567\nEmail: sarah.mitchell@example.com\n\nReservation Info\n\nDate Of Service: 06/18/2026\nService Type: One Way\nStart Time: 3:00 AM\nReservation #: 3341496\nPassengers: 2\nLuggage: 3\nVehicle: Executive Sedan\n\nPickup\n\n2500 Victory Ave, Dallas, TX 75219, USA\n\nDropoff\n\nDFW International Airport, Grapevine, TX 76051, USA\n`,
    },
    {
      name: 'Austin hourly local',
      category: 'hourly',
      blurb: 'Hourly local trip in Austin. 4-hour minimum @ $175/hr applies. No mileage charge.',
      email_body: `LandJet Austin\nLJAustin@landjet.com\n\nQuote Request\n\nPassenger Info\n\nDavid Chen\nPhone: 5121234567\nEmail: dchen@techcorp.io\n\nReservation Info\n\nDate Of Service: 06/14/2026\nService Type: Hourly\nStart Time: 9:00 AM\nReservation #: 3341497\nPassengers: 4\nLuggage: 0\nVehicle: Executive SUV\n\nPickup\n\n200 W 6th St, Austin, TX 78701, USA\n\nDropoff\n\n200 W 6th St, Austin, TX 78701, USA\n`,
    },
    {
      name: 'Investor outreach trip',
      category: 'customer_category',
      blurb: 'Investor category: $400 trip fee discount applied. Useful for testing the discount path on a corporate market.',
      email_body: `LandJet Dallas\nLJDallas@landjet.com\n\nQuote Request\n\nPassenger Info\n\nMichael Rodriguez\nPhone: 2143335555\nEmail: mrod@growthequity.com\n\nReservation Info\n\nDate Of Service: 06/25/2026\nService Type: Round Trip\nStart Time: 10:00 AM\nReservation #: 3341498\nPassengers: 2\nLuggage: 2\nVehicle: Conference Room\n\nPickup\n\nDFW International Airport, Grapevine, TX 76051, USA\n\nDropoff\n\n400 W 15th St, Austin, TX 78701, USA\n`,
    },
  ]);
});

// ---------------------------------------------------------------------------
// Reservation auto-quotes -- priced reservation emails from ljreservations@.
// GET lists them (newest first), POST /ingest triggers a manual pull.
// ---------------------------------------------------------------------------
router.get('/reservations', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ReservationQuote } = await import('../../models/ReservationQuote');
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const where: Record<string, unknown> = {};
    if (req.query.status) where.status = req.query.status as string;
    // Lifecycle filter for the operational queue. 'resolved' = booked or closed.
    const lc = req.query.lifecycle as string | undefined;
    if (lc && lc !== 'all') {
      const { Op } = await import('sequelize');
      where.lifecycle = lc === 'resolved' ? { [Op.in]: ['booked', 'closed'] } : lc;
    }
    const rows = await ReservationQuote.findAll({
      where,
      order: [['received_at', 'DESC'], ['id', 'DESC']],
      limit,
    });
    res.json({ reservations: rows, total: rows.length });
  } catch (error) { next(error); }
});

router.post('/reservations/ingest', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ingestReservationQuotes } = await import('../../services/reservationQuoteService');
    const lookbackHours = Math.min(Math.max(Number(req.body?.lookback_hours) || 72, 1), 720);
    const result = await ingestReservationQuotes({ lookbackHours });
    res.json(result);
  } catch (error) { next(error); }
});

router.get('/reservations/metrics', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { getReservationMetrics } = await import('../../services/reservationQuoteService');
    res.json(await getReservationMetrics());
  } catch (error) { next(error); }
});

// Send (or DRY-prepare) the quote reply for one reservation. Dry by default --
// real customer sends require RESERVATION_SEND_ENABLED=true on the server.
router.post('/reservations/:id/send', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sendReservationQuote } = await import('../../services/reservationQuoteService');
    const result = await sendReservationQuote(Number(req.params.id));
    res.json(result);
  } catch (error) { next(error); }
});

// Generate the AI reply (in the sending account's learned voice) + rubric score.
router.post('/reservations/:id/draft', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ReservationQuote } = await import('../../models/ReservationQuote');
    const { generateDraft } = await import('../../services/reservationDraftService');
    const rq = await ReservationQuote.findByPk(Number(req.params.id));
    if (!rq) return res.status(404).json({ error: 'not found' });
    const draft = await generateDraft(rq);
    res.json({ draft, reply_from: rq.reply_from || rq.mailbox });
  } catch (error) { next(error); }
});

// Save an operator-edited draft (preserves rubric, marks edited).
router.put('/reservations/:id/draft', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { saveReservationDraft } = await import('../../services/reservationQuoteService');
    const subject = String(req.body?.subject || '');
    const text = String(req.body?.text || '');
    if (!text.trim()) return res.status(400).json({ error: 'text is required' });
    const rq = await saveReservationDraft(Number(req.params.id), subject, text);
    res.json({ ai_draft: rq.ai_draft });
  } catch (error) { next(error); }
});

// Move a reservation through its lifecycle (needs_reply/awaiting_customer/booked/closed).
router.post('/reservations/:id/lifecycle', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { setReservationLifecycle } = await import('../../services/reservationQuoteService');
    const lifecycle = String(req.body?.lifecycle || '');
    if (!['needs_reply', 'awaiting_customer', 'booked', 'closed'].includes(lifecycle)) {
      return res.status(400).json({ error: 'invalid lifecycle' });
    }
    const rq = await setReservationLifecycle(Number(req.params.id), lifecycle as any);
    res.json({ id: rq.id, lifecycle: rq.lifecycle });
  } catch (error) { next(error); }
});

// Full thread for the conversation view (multi-message back-and-forth).
router.get('/reservations/:id/conversation', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { getConversationThread } = await import('../../services/reservationQuoteService');
    const messages = await getConversationThread(Number(req.params.id));
    res.json({ messages });
  } catch (error) { next(error); }
});

// Run the history learner (mine Sent Items + rebuild tone profiles) on demand.
router.post('/reservations/learn', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { learnFromMailboxes } = await import('../../services/reservationLearningService');
    const def = (process.env.RESERVATION_EXTRA_MAILBOXES ?? 'rlandry@landjet.com,percy@landjet.com')
      .split(',').map((s) => s.trim()).filter(Boolean);
    const mailboxes: string[] = Array.isArray(req.body?.mailboxes) && req.body.mailboxes.length
      ? req.body.mailboxes
      : ['ljreservations@landjet.com', ...def];
    const maxMessages = Math.min(Math.max(Number(req.body?.max_messages) || 300, 50), 1000);
    const summary = await learnFromMailboxes(mailboxes, maxMessages);
    res.json({ summary });
  } catch (error) { next(error); }
});

export default router;
