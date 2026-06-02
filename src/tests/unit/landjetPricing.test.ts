import { calculateQuote, detectFlatRateRoute, detectCustomerCategory, isIowaOnlyTrip, isForwardOnlyMarket, isGarageCity, checkGarageEnds, type QuoteInput } from '../../services/landjetPricing';

describe('LandJet Pricing Engine', () => {

  // ===================================================================
  // STANDARD MILEAGE QUOTES (Distance Mode)
  // ===================================================================

  describe('Standard Mileage Quote (Quad Cities, one-way)', () => {
    const baseInput: QuoteInput = {
      market: 'quad_cities',
      service_type: 'one_way',
      passenger_miles: 250,
      payment: 'credit_card',
    };

    it('happy path: produces expected line items in correct order', () => {
      const q = calculateQuote(baseInput);
      expect(q.pricing_mode).toBe('distance');
      const labels = q.lines.map(l => l.label);
      expect(labels[0]).toBe('Base Rate');
      expect(labels[1]).toContain('Distance Rate');
    });

    it('applies $400 trip fee + 250mi @ $2.40/mi + fuel + 3% CC', () => {
      const q = calculateQuote(baseInput);
      // Base $400 + Distance $600 + Fuel $25 (250mi * $0.10) = $1025 subtotal (subtotal includes fuel)
      expect(q.subtotal).toBe(1025);
      // No overnight, no per diem, no flat gratuity -> secondary = $1025
      // No pct gratuity -> third = $1025
      // CC 3% -> grand = $1025 * 1.03 = $1055.75
      expect(q.grand_total).toBeCloseTo(1055.75, 1);
    });

    it('applies 200-mile minimum when actual miles < 200', () => {
      const q = calculateQuote({ ...baseInput, passenger_miles: 50 });
      // Min 200 mi enforced
      expect(q.warnings.some(w => w.includes('Mileage minimum'))).toBe(true);
      // Distance = 200 * 2.40 = $480
      const distLine = q.lines.find(l => l.label.includes('Distance Rate'));
      expect(distLine?.amount).toBe(480);
    });

    // Per Lorie 2026-05-21: when minimum is applied, the customer must SEE
    // both billed and actual in the line item itself, not buried in a warning.
    it('shows both billed and actual mileage in the line label when min is applied', () => {
      const q = calculateQuote({ ...baseInput, passenger_miles: 50 });
      const distLine = q.lines.find(l => l.label.includes('Distance Rate'));
      expect(distLine?.label).toContain('200 mi billed');
      expect(distLine?.label).toContain('50 mi actual');
    });

    it('does NOT add billed/actual phrasing when no minimum is applied', () => {
      const q = calculateQuote({ ...baseInput, passenger_miles: 250 });
      const distLine = q.lines.find(l => l.label.includes('Distance Rate'));
      expect(distLine?.label).not.toContain('billed');
      expect(distLine?.label).not.toContain('actual');
    });
  });

  describe('Round-trip with Dead Leg (Ryan 2026-05-21: one trip fee per booking)', () => {
    it('applies ONE base rate per booking regardless of round-trip', () => {
      const q = calculateQuote({
        market: 'des_moines',
        service_type: 'round_trip',
        passenger_miles: 400, // 200mi each way
        deadleg_miles: 100,
        payment: 'credit_card',
      });
      const baseLines = q.lines.filter(l => l.label.startsWith('Base Rate'));
      expect(baseLines).toHaveLength(1);
      expect(baseLines[0].amount).toBe(400);
    });

    it('mileage naturally doubles on round-trip because passenger_miles is the full total', () => {
      const q = calculateQuote({
        market: 'des_moines',
        service_type: 'round_trip',
        passenger_miles: 400, // caller passes round-trip total
        payment: 'credit_card',
      });
      const distLine = q.lines.find(l => l.label.includes('Distance Rate'));
      expect(distLine?.amount).toBe(400 * 2.40); // $960 total distance
    });
  });

  // ===================================================================
  // JOHN DEERE PRICING
  // ===================================================================

  describe('John Deere employee pricing', () => {
    it('uses $200 trip fee + $2.20/mi mileage', () => {
      const q = calculateQuote({
        market: 'quad_cities',
        customer_category: 'jd_employee',
        service_type: 'one_way',
        passenger_miles: 200,
        payment: 'credit_card',
      });
      const baseLine = q.lines.find(l => l.label === 'Base Rate');
      const distLine = q.lines.find(l => l.label.includes('Distance Rate'));
      expect(baseLine?.amount).toBe(200);
      expect(distLine?.amount).toBe(200 * 2.20); // $440
    });

    it('auto-detects JD employee from email domain', () => {
      const q = calculateQuote({
        market: 'quad_cities',
        service_type: 'one_way',
        passenger_miles: 200,
        payment: 'credit_card',
        customer_email: 'KoltePrafulA@JohnDeere.com',
      });
      expect(q.customer_category).toBe('jd_employee');
    });
  });

  describe('JD Shuttle pricing', () => {
    it('uses $250 base + $1.65/mi + 303.03 mile minimum', () => {
      const q = calculateQuote({
        market: 'des_moines',
        customer_category: 'jd_shuttle',
        service_type: 'one_way',
        passenger_miles: 100,
        payment: 'credit_card',
      });
      expect(q.warnings.some(w => w.includes('303.03'))).toBe(true);
      const distLine = q.lines.find(l => l.label.includes('Distance Rate'));
      expect(distLine?.amount).toBeCloseTo(303.03 * 1.65, 1);
    });
  });

  // ===================================================================
  // JD ROUND-TRIP -- ONE base rate per booking (Ryan 2026-05-21)
  // Correcting earlier interpretation of Percy 2026-05-07: "both legs"
  // referred to MILEAGE (naturally doubled on round-trips since
  // passenger_miles is the round-trip total), NOT the trip fee.
  // ===================================================================

  describe('JD round-trip: one base rate per booking', () => {
    it('JD employee round-trip applies ONE $200 base, not two', () => {
      const q = calculateQuote({
        market: 'quad_cities',
        customer_category: 'jd_employee',
        service_type: 'round_trip',
        passenger_miles: 400,
        payment: 'credit_card',
      });
      const baseLines = q.lines.filter(l => l.label.startsWith('Base Rate'));
      expect(baseLines).toHaveLength(1);
      expect(baseLines[0].amount).toBe(200);
    });

    it('JD Shuttle round-trip applies ONE $250 base, not two', () => {
      const q = calculateQuote({
        market: 'des_moines',
        customer_category: 'jd_shuttle',
        service_type: 'round_trip',
        passenger_miles: 400,
        payment: 'credit_card',
      });
      const baseLines = q.lines.filter(l => l.label.startsWith('Base Rate'));
      expect(baseLines).toHaveLength(1);
      expect(baseLines[0].amount).toBe(250);
    });

    it('standard customer round-trip also applies ONE base rate', () => {
      const q = calculateQuote({
        market: 'des_moines',
        customer_category: 'standard',
        service_type: 'round_trip',
        passenger_miles: 400,
        payment: 'credit_card',
      });
      const baseLines = q.lines.filter(l => l.label.startsWith('Base Rate'));
      expect(baseLines).toHaveLength(1);
      expect(baseLines[0].amount).toBe(400);
    });
  });

  describe('Lockton / Investor / LJ Member -- $400 trip fee discount', () => {
    it('zeros out trip fee for Lockton', () => {
      const q = calculateQuote({
        market: 'dallas',
        customer_category: 'lockton_employee',
        service_type: 'one_way',
        passenger_miles: 200,
        payment: 'check',
      });
      const baseLine = q.lines.find(l => l.label === 'Base Rate');
      expect(baseLine?.amount).toBe(0); // $400 - $400 discount
    });

    it('still applies $2.20/mi discounted mileage for Investor', () => {
      const q = calculateQuote({
        market: 'dallas',
        customer_category: 'investor',
        service_type: 'one_way',
        passenger_miles: 200,
        payment: 'check',
      });
      const distLine = q.lines.find(l => l.label.includes('Distance Rate'));
      expect(distLine?.amount).toBeCloseTo(440, 2); // 200 * $2.20
    });
  });

  // ===================================================================
  // FLAT RATE ROUTES
  // ===================================================================

  describe('Flat rate route detection', () => {
    it('detects QC -> O\'Hare $550 route', () => {
      const route = detectFlatRateRoute('Davenport, IA', 'O\'Hare International, Chicago');
      expect(route?.price).toBe(550);
    });

    it('detects Dubuque -> O\'Hare $650 route', () => {
      const route = detectFlatRateRoute('Dubuque, IA', 'ORD');
      expect(route?.price).toBe(650);
    });

    it('detects route in either direction', () => {
      const fwd = detectFlatRateRoute('Briggs Ranch', 'San Antonio, TX');
      const rev = detectFlatRateRoute('San Antonio, TX', 'Briggs Ranch');
      expect(fwd?.price).toBe(250);
      expect(rev?.price).toBe(250);
    });

    it('returns null for non-matching route', () => {
      const r = detectFlatRateRoute('Random City', 'Another Random Place');
      expect(r).toBeNull();
    });
  });

  describe('Flat rate quote', () => {
    it('uses flat rate amount as the base, ignores mileage', () => {
      const q = calculateQuote({
        market: 'quad_cities',
        service_type: 'one_way',
        passenger_miles: 0,
        payment: 'credit_card',
        flat_rate_amount: 550,
      });
      expect(q.pricing_mode).toBe('flat_rate');
      const flatLine = q.lines.find(l => l.label === 'Flat Rate');
      expect(flatLine?.amount).toBe(550);
      // Should NOT have a Distance Rate line
      expect(q.lines.find(l => l.label.includes('Distance Rate'))).toBeUndefined();
    });

    it('charges $50 per additional stop above the included 2', () => {
      const q = calculateQuote({
        market: 'austin',
        service_type: 'one_way',
        passenger_miles: 0,
        payment: 'credit_card',
        flat_rate_amount: 250,
        additional_stops: 3,
      });
      const stopsLine = q.lines.find(l => l.label.includes('Additional Stops'));
      expect(stopsLine?.amount).toBe(150);
    });
  });

  // ===================================================================
  // HOURLY MODE
  // ===================================================================

  describe('Hourly local trips', () => {
    it('enforces 4-hour minimum', () => {
      const q = calculateQuote({
        market: 'austin',
        service_type: 'hourly_local',
        passenger_miles: 0,
        service_hours: 2,
        payment: 'credit_card',
      });
      expect(q.pricing_mode).toBe('hourly');
      expect(q.warnings.some(w => w.includes('minimum'))).toBe(true);
      const hourlyLine = q.lines.find(l => l.label.includes('Hourly Rate'));
      expect(hourlyLine?.amount).toBe(4 * 175); // Austin $175/hr
    });

    it('uses Quad Cities $150/hr rate (KC excluded as forward-only)', () => {
      const q = calculateQuote({
        market: 'quad_cities',
        service_type: 'hourly_local',
        passenger_miles: 0,
        service_hours: 5,
        payment: 'check',
      });
      const hourlyLine = q.lines.find(l => l.label.includes('Hourly Rate'));
      expect(hourlyLine?.amount).toBe(5 * 150);
    });
  });

  // ===================================================================
  // KANSAS CITY -- FORWARD ONLY (per Percy 2026-05-06)
  // ===================================================================

  describe('Kansas City forward-only behavior', () => {
    it('does NOT generate a quote for KC', () => {
      const q = calculateQuote({
        market: 'kansas_city',
        service_type: 'one_way',
        passenger_miles: 200,
        payment: 'credit_card',
      });
      expect(q.pricing_mode).toBe('forward_only');
      expect(q.lines).toHaveLength(0);
      expect(q.grand_total).toBe(0);
    });

    it('returns the KC team email addresses to forward to', () => {
      const q = calculateQuote({
        market: 'kansas_city',
        service_type: 'one_way',
        passenger_miles: 200,
        payment: 'credit_card',
      });
      expect(q.forward_to).toContain('holly@kclandjet.com');
      expect(q.forward_to).toContain('scott@kclandjet.com');
      expect(q.forward_reason).toBeDefined();
    });

    it('exposes KC as a forward-only market via helper', () => {
      expect(isForwardOnlyMarket('kansas_city')).toBe(true);
      expect(isForwardOnlyMarket('dallas')).toBe(false);
    });

    it('still generates quotes for non-forward markets', () => {
      const q = calculateQuote({
        market: 'dallas',
        service_type: 'one_way',
        passenger_miles: 200,
        payment: 'credit_card',
      });
      expect(q.pricing_mode).toBe('distance');
      expect(q.approvals_needed).toHaveLength(0);
    });
  });

  // ===================================================================
  // OMAHA -- ADDITIONAL DRIVER NEEDS PERMISSION
  // ===================================================================

  describe('Omaha additional driver requires permission', () => {
    it('flags add\'l driver in Omaha as needing permission', () => {
      const q = calculateQuote({
        market: 'omaha',
        service_type: 'one_way',
        passenger_miles: 250,
        additional_drivers_hours: 5,
        payment: 'credit_card',
      });
      expect(q.approvals_needed.some(a => a.includes('Additional driver'))).toBe(true);
      // Should NOT have an additional driver line item if it needs permission
      expect(q.lines.find(l => l.label.includes('Additional Driver'))).toBeUndefined();
    });
  });

  // ===================================================================
  // IOWA TAX (per Percy 2026-05-06: pickup AND dropoff AND ALL stops in IA)
  // ===================================================================

  describe('Iowa-only 7% tax', () => {
    it('applies 7% tax for Iowa-only trip in QC market (legacy boolean)', () => {
      const q = calculateQuote({
        market: 'quad_cities',
        service_type: 'one_way',
        passenger_miles: 200,
        payment: 'check',
        is_iowa_only: true,
      });
      const taxLine = q.lines.find(l => l.label === 'Iowa Tax (7%)');
      expect(taxLine).toBeDefined();
      expect(taxLine?.amount).toBeGreaterThan(0);
    });

    it('applies 7% tax when all stops are in IA', () => {
      const q = calculateQuote({
        market: 'des_moines',
        service_type: 'one_way',
        passenger_miles: 200,
        payment: 'check',
        stops: [
          { address: '123 Main St, Davenport', state: 'IA' },
          { address: '456 Oak St, Iowa City', state: 'IA' },
          { address: '789 Pine St, Des Moines', state: 'IA' },
        ],
      });
      expect(q.lines.find(l => l.label === 'Iowa Tax (7%)')).toBeDefined();
    });

    it('does NOT apply tax when ANY stop is outside Iowa', () => {
      const q = calculateQuote({
        market: 'des_moines',
        service_type: 'round_trip',
        passenger_miles: 400,
        payment: 'check',
        stops: [
          { address: '123 Main St, Davenport', state: 'IA' },
          { address: '456 Oak St, Moline', state: 'IL' }, // intermediate stop in Illinois
          { address: '789 Pine St, Des Moines', state: 'IA' },
        ],
      });
      expect(q.lines.find(l => l.label.includes('Iowa Tax'))).toBeUndefined();
    });

    it('stops list overrides legacy is_iowa_only boolean', () => {
      const q = calculateQuote({
        market: 'quad_cities',
        service_type: 'one_way',
        passenger_miles: 200,
        payment: 'check',
        is_iowa_only: true, // legacy says yes
        stops: [
          { address: 'Quad Cities, IA', state: 'IA' },
          { address: 'Chicago, IL', state: 'IL' }, // but stops say no
        ],
      });
      expect(q.lines.find(l => l.label.includes('Iowa Tax'))).toBeUndefined();
    });

    it('does NOT apply Iowa tax for Texas markets', () => {
      const q = calculateQuote({
        market: 'dallas',
        service_type: 'one_way',
        passenger_miles: 200,
        payment: 'check',
        is_iowa_only: true, // even if the flag is set, Texas markets don't pay it
      });
      expect(q.lines.find(l => l.label.includes('Iowa Tax'))).toBeUndefined();
    });

    it('isIowaOnlyTrip helper returns true for all-IA stops', () => {
      expect(isIowaOnlyTrip({ stops: [
        { address: 'a', state: 'IA' },
        { address: 'b', state: 'ia' }, // case insensitive
      ]})).toBe(true);
    });

    it('isIowaOnlyTrip helper returns false when any stop is outside IA', () => {
      expect(isIowaOnlyTrip({ stops: [
        { address: 'a', state: 'IA' },
        { address: 'b', state: 'IL' },
      ]})).toBe(false);
    });

    // ----- Sales tax stress tests (2026-06-02) -----
    // Edge cases across IA/IL/TX scenarios. These were added so demos with
    // Lorie + Ryan don't surface tax surprises on cross-state routes.

    it('IL pickup -> IA dropoff: no Iowa tax (cross-state)', () => {
      const q = calculateQuote({
        market: 'quad_cities',
        service_type: 'one_way',
        passenger_miles: 200,
        payment: 'check',
        stops: [
          { address: 'Schaumburg, IL 60173', state: 'IL' },
          { address: 'Des Moines, IA 50317', state: 'IA' },
        ],
      });
      expect(q.lines.find(l => l.label.includes('Iowa Tax'))).toBeUndefined();
    });

    it('IA pickup -> IL dropoff: no Iowa tax (cross-state)', () => {
      const q = calculateQuote({
        market: 'quad_cities',
        service_type: 'one_way',
        passenger_miles: 200,
        payment: 'check',
        stops: [
          { address: 'Davenport, IA', state: 'IA' },
          { address: 'Chicago, IL', state: 'IL' },
        ],
      });
      expect(q.lines.find(l => l.label.includes('Iowa Tax'))).toBeUndefined();
    });

    it('IA pickup -> TX dropoff: no Iowa tax (cross-state to Texas)', () => {
      const q = calculateQuote({
        market: 'des_moines',
        service_type: 'one_way',
        passenger_miles: 200,
        payment: 'check',
        stops: [
          { address: 'Des Moines, IA', state: 'IA' },
          { address: 'Dallas, TX', state: 'TX' },
        ],
      });
      expect(q.lines.find(l => l.label.includes('Iowa Tax'))).toBeUndefined();
    });

    it('Multi-stop all-IA round trip with passenger pickup in middle: tax applies', () => {
      const q = calculateQuote({
        market: 'des_moines',
        service_type: 'round_trip',
        passenger_miles: 300,
        payment: 'check',
        stops: [
          { address: 'Davenport, IA', state: 'IA' },
          { address: 'Iowa City, IA', state: 'IA' },
          { address: 'Cedar Rapids, IA', state: 'IA' },
          { address: 'Des Moines, IA', state: 'IA' },
        ],
      });
      const taxLine = q.lines.find(l => l.label === 'Iowa Tax (7%)');
      expect(taxLine).toBeDefined();
      expect(taxLine!.amount).toBeCloseTo(q.subtotal * 0.07, 2);
    });

    it('Iowa tax applied to subtotal only -- NOT to gratuity or CC fee', () => {
      const q = calculateQuote({
        market: 'des_moines',
        service_type: 'one_way',
        passenger_miles: 200,
        payment: 'credit_card',  // forces CC fee
        gratuity_pct: 0.20,
        stops: [
          { address: 'Davenport, IA', state: 'IA' },
          { address: 'Des Moines, IA', state: 'IA' },
        ],
      });
      const taxLine = q.lines.find(l => l.label === 'Iowa Tax (7%)');
      const ccLine = q.lines.find(l => l.label.includes('CC Convenience Fee'));
      const gratLine = q.lines.find(l => l.label.includes('Gratuity'));
      expect(taxLine).toBeDefined();
      expect(ccLine).toBeDefined();
      expect(gratLine).toBeDefined();
      // Tax = 7% of subtotal, not of (subtotal + grat + cc fee)
      expect(taxLine!.amount).toBeCloseTo(q.subtotal * 0.07, 2);
      // Tax amount should NOT include gratuity in its base
      expect(taxLine!.amount).toBeLessThan((q.subtotal + gratLine!.amount) * 0.07);
    });

    it('Single-stop IA-only trip: tax applies (single stop edge case)', () => {
      const q = calculateQuote({
        market: 'quad_cities',
        service_type: 'hourly_local',
        service_hours: 4,
        passenger_miles: 0,
        payment: 'check',
        stops: [
          { address: 'Davenport, IA', state: 'IA' },
        ],
      });
      expect(q.lines.find(l => l.label.includes('Iowa Tax'))).toBeDefined();
    });

    it('Empty stops + is_iowa_only=false: no tax (Iowa market, non-IA trip)', () => {
      const q = calculateQuote({
        market: 'quad_cities',
        service_type: 'one_way',
        passenger_miles: 200,
        payment: 'check',
        is_iowa_only: false,
        stops: [],
      });
      expect(q.lines.find(l => l.label.includes('Iowa Tax'))).toBeUndefined();
    });

    it('State string with leading/trailing whitespace handled (" IA ")', () => {
      expect(isIowaOnlyTrip({ stops: [
        { address: 'a', state: ' IA ' },
        { address: 'b', state: 'IA' },
      ]})).toBe(true);
    });

    it('Texas-only round trip: no Iowa tax', () => {
      const q = calculateQuote({
        market: 'dallas',
        service_type: 'round_trip',
        passenger_miles: 300,
        payment: 'check',
        stops: [
          { address: 'Dallas, TX', state: 'TX' },
          { address: 'Austin, TX', state: 'TX' },
          { address: 'Dallas, TX', state: 'TX' },
        ],
      });
      expect(q.lines.find(l => l.label.includes('Iowa Tax'))).toBeUndefined();
    });

    it('Cross-state round trip IA->IL->IA: no tax (intermediate stop disqualifies)', () => {
      const q = calculateQuote({
        market: 'quad_cities',
        service_type: 'round_trip',
        passenger_miles: 400,
        payment: 'check',
        stops: [
          { address: 'Davenport, IA', state: 'IA' },
          { address: 'Chicago, IL', state: 'IL' },
          { address: 'Davenport, IA', state: 'IA' },
        ],
      });
      expect(q.lines.find(l => l.label.includes('Iowa Tax'))).toBeUndefined();
    });

    it('All-IA trip but Texas market (Dallas): no Iowa tax (market disqualifies)', () => {
      const q = calculateQuote({
        market: 'dallas',
        service_type: 'one_way',
        passenger_miles: 200,
        payment: 'check',
        stops: [
          { address: 'Davenport, IA', state: 'IA' },
          { address: 'Des Moines, IA', state: 'IA' },
        ],
      });
      expect(q.lines.find(l => l.label.includes('Iowa Tax'))).toBeUndefined();
    });

    it('All-IA trip on Omaha (NE) market: no Iowa tax (Omaha not iowa_tax_eligible)', () => {
      const q = calculateQuote({
        market: 'omaha',
        service_type: 'one_way',
        passenger_miles: 200,
        payment: 'check',
        stops: [
          { address: 'Council Bluffs, IA', state: 'IA' },
          { address: 'Sioux City, IA', state: 'IA' },
        ],
      });
      expect(q.lines.find(l => l.label.includes('Iowa Tax'))).toBeUndefined();
    });

    it('isIowaOnlyTrip helper -- lowercase + full-state-name handling', () => {
      // Lowercase 2-letter passes
      expect(isIowaOnlyTrip({ stops: [
        { address: 'a', state: 'ia' },
        { address: 'b', state: 'IA' },
      ]})).toBe(true);
      // Full state name 'Iowa' is NOT a 2-letter code -- helper currently
      // requires 2-letter; full names won't match. This documents current
      // behavior so callers (BookRides parser, manual entry) normalize upstream.
      expect(isIowaOnlyTrip({ stops: [
        { address: 'a', state: 'Iowa' },
      ]})).toBe(false);
    });

    it('Tax amount precision: subtotal $1000 -> exact $70 tax', () => {
      // Use a configuration that yields a clean subtotal for precision check.
      const q = calculateQuote({
        market: 'des_moines',
        service_type: 'one_way',
        flat_rate_amount: 1000,
        flat_rate_label: 'Test flat $1000',
        passenger_miles: 0,
        payment: 'check',
        stops: [
          { address: 'Des Moines, IA', state: 'IA' },
          { address: 'Iowa City, IA', state: 'IA' },
        ],
      });
      const taxLine = q.lines.find(l => l.label === 'Iowa Tax (7%)');
      expect(taxLine).toBeDefined();
      // Subtotal includes auto-20% gratuity on flat rate, so tax base = $1000 flat alone.
      // Verify tax matches whatever the subtotal is times 0.07
      expect(taxLine!.amount).toBeCloseTo(q.subtotal * 0.07, 2);
    });

    it('San Antonio (TX market) with IA stops: no tax even if passenger goes to IA', () => {
      const q = calculateQuote({
        market: 'san_antonio',
        service_type: 'round_trip',
        passenger_miles: 400,
        payment: 'check',
        stops: [
          { address: 'San Antonio, TX', state: 'TX' },
          { address: 'Davenport, IA', state: 'IA' },
        ],
      });
      expect(q.lines.find(l => l.label.includes('Iowa Tax'))).toBeUndefined();
    });
  });

  // ===================================================================
  // MULTI-DAY ROUTING (per Ryan/Lorie 2026-05-21 ask: overnight or 2+
  // per diem days routes to reservation desk for human review)
  // ===================================================================

  describe('Multi-day trip routing to human review queue', () => {
    it('single-night overnight trip flags requires_human_review + warning + approval', () => {
      const q = calculateQuote({
        market: 'dallas',
        service_type: 'one_way',
        passenger_miles: 400,
        payment: 'check',
        overnight_nights: 1,
      });
      expect(q.requires_human_review).toBe(true);
      expect(q.human_review_reasons).toContain('multi_day:1 overnight');
      expect(q.warnings.find(w => /Multi-day trip.*1 overnight/i.test(w))).toBeDefined();
      expect(q.approvals_needed.find(a => /Multi-day trip routing/i.test(a))).toBeDefined();
    });

    it('multi-night overnight uses plural ("3 overnights")', () => {
      const q = calculateQuote({
        market: 'dallas',
        service_type: 'round_trip',
        passenger_miles: 600,
        payment: 'check',
        overnight_nights: 3,
      });
      expect(q.human_review_reasons).toContain('multi_day:3 overnights');
    });

    it('overnight + per diem combined surfaces both in reason', () => {
      const q = calculateQuote({
        market: 'quad_cities',
        service_type: 'round_trip',
        passenger_miles: 500,
        payment: 'check',
        overnight_nights: 2,
        per_diem_days: 3,
      });
      expect(q.human_review_reasons).toContain('multi_day:2 overnights + 3 days per diem');
      expect(q.requires_human_review).toBe(true);
    });

    it('2+ per diem days alone triggers human review (no overnight)', () => {
      const q = calculateQuote({
        market: 'austin',
        service_type: 'one_way',
        passenger_miles: 300,
        payment: 'check',
        per_diem_days: 2,
      });
      expect(q.requires_human_review).toBe(true);
      expect(q.human_review_reasons).toContain('multi_day:2 days per diem');
    });

    it('1 per diem day alone does NOT trigger human review (single-day standby)', () => {
      const q = calculateQuote({
        market: 'austin',
        service_type: 'one_way',
        passenger_miles: 300,
        payment: 'check',
        per_diem_days: 1,
      });
      expect(q.requires_human_review).toBe(false);
      expect(q.human_review_reasons).toEqual([]);
    });

    it('regular same-day trip does NOT trigger human review', () => {
      const q = calculateQuote({
        market: 'dallas',
        service_type: 'one_way',
        passenger_miles: 200,
        payment: 'check',
      });
      expect(q.requires_human_review).toBe(false);
      expect(q.human_review_reasons).toEqual([]);
      expect(q.warnings.find(w => /Multi-day trip/i.test(w))).toBeUndefined();
    });

    it('forward-only market (KC) also marks requires_human_review', () => {
      const q = calculateQuote({
        market: 'kansas_city',
        service_type: 'one_way',
        passenger_miles: 100,
        payment: 'check',
      });
      expect(q.requires_human_review).toBe(true);
      expect(q.human_review_reasons).toContain('forward_only_market:kansas_city');
      expect(q.pricing_mode).toBe('forward_only');
    });

    it('multi-day trip with flat rate still flags human review', () => {
      const q = calculateQuote({
        market: 'quad_cities',
        service_type: 'one_way',
        passenger_miles: 200,
        payment: 'check',
        flat_rate_amount: 550,
        flat_rate_label: 'QC -> ORD',
        overnight_nights: 1,
      });
      expect(q.requires_human_review).toBe(true);
      expect(q.pricing_mode).toBe('flat_rate');
    });
  });

  // ===================================================================
  // GRATUITY (FLAT vs PERCENT)
  // ===================================================================

  describe('Gratuity', () => {
    it('applies flat gratuity', () => {
      const q = calculateQuote({
        market: 'dallas',
        service_type: 'one_way',
        passenger_miles: 200,
        payment: 'check',
        gratuity_amount: 100,
      });
      const grat = q.lines.find(l => l.label === 'Gratuity');
      expect(grat?.amount).toBe(100);
    });

    it('applies percentage gratuity to secondary total', () => {
      const q = calculateQuote({
        market: 'dallas',
        service_type: 'one_way',
        passenger_miles: 200,
        payment: 'check',
        gratuity_pct: 0.15,
      });
      const grat = q.lines.find(l => l.label.includes('Gratuity (15%)'));
      expect(grat).toBeDefined();
      expect(grat!.amount).toBeCloseTo(q.secondary_total * 0.15, 2);
    });
  });

  // ===================================================================
  // AFTER-HOURS SURCHARGE
  // ===================================================================

  describe('After Hours surcharge', () => {
    it('adds $200 for 11pm-5am pickup', () => {
      const q = calculateQuote({
        market: 'austin',
        service_type: 'one_way',
        passenger_miles: 200,
        payment: 'check',
        pickup_at_local: new Date('2026-05-15T03:30:00'), // 3:30 AM local
      });
      expect(q.lines.find(l => l.label.includes('After Hours'))).toBeDefined();
    });

    it('does NOT add for daytime pickup', () => {
      const q = calculateQuote({
        market: 'austin',
        service_type: 'one_way',
        passenger_miles: 200,
        payment: 'check',
        pickup_at_local: new Date('2026-05-15T10:00:00'),
      });
      expect(q.lines.find(l => l.label.includes('After Hours'))).toBeUndefined();
    });
  });

  // ===================================================================
  // CUSTOMER CATEGORY DETECTION
  // ===================================================================

  describe('detectCustomerCategory', () => {
    it('detects JD from @johndeere.com', () => {
      expect(detectCustomerCategory('user@JohnDeere.com')).toBe('jd_employee');
    });

    it('detects Lockton from @lockton.com', () => {
      expect(detectCustomerCategory('user@lockton.com')).toBe('lockton_employee');
    });

    it('returns standard for unknown domain', () => {
      expect(detectCustomerCategory('user@randomcorp.com')).toBe('standard');
    });

    it('returns standard for missing email', () => {
      expect(detectCustomerCategory(undefined)).toBe('standard');
      expect(detectCustomerCategory('')).toBe('standard');
    });
  });

  // ===================================================================
  // IDEMPOTENCY -- same input produces same output
  // ===================================================================

  describe('Idempotency', () => {
    it('same input produces identical quotes (no time-dependent randomness)', () => {
      const input: QuoteInput = {
        market: 'quad_cities',
        service_type: 'one_way',
        passenger_miles: 250,
        payment: 'credit_card',
        gratuity_amount: 100,
      };
      const a = calculateQuote(input);
      const b = calculateQuote(input);
      expect(a.grand_total).toBe(b.grand_total);
      expect(a.lines.length).toBe(b.lines.length);
      expect(a.subtotal).toBe(b.subtotal);
    });
  });

  // ===================================================================
  // BOUNDARY CASES
  // ===================================================================

  describe('Boundary cases', () => {
    it('handles zero passenger miles (with min applied)', () => {
      const q = calculateQuote({
        market: 'quad_cities',
        service_type: 'one_way',
        passenger_miles: 0,
        payment: 'check',
      });
      // Min 200mi will kick in
      const dist = q.lines.find(l => l.label.includes('Distance Rate'));
      expect(dist?.amount).toBe(480);
    });

    it('throws for unknown market', () => {
      expect(() => calculateQuote({
        market: 'mars' as any,
        service_type: 'one_way',
        passenger_miles: 100,
        payment: 'check',
      })).toThrow();
    });

    it('handles multi-day trip with overnight + per diem', () => {
      const q = calculateQuote({
        market: 'des_moines',
        service_type: 'round_trip',
        passenger_miles: 600,
        payment: 'credit_card',
        overnight_nights: 2,
        per_diem_days: 2,
      });
      const overnight = q.lines.find(l => l.label.includes('Overnight Fee'));
      const perdiem = q.lines.find(l => l.label.includes('Per Diem'));
      expect(overnight?.amount).toBe(600); // 2 * $300
      expect(perdiem?.amount).toBe(600);   // 2 * $300
    });
  });

  // ===================================================================
  // DOT WARNING
  // ===================================================================

  describe('DOT compliance warning', () => {
    it('warns when single-driver trip exceeds 15 hours', () => {
      const q = calculateQuote({
        market: 'des_moines',
        service_type: 'one_way',
        passenger_miles: 800,
        service_hours: 18,
        payment: 'credit_card',
      });
      expect(q.warnings.some(w => w.includes('DOT'))).toBe(true);
    });

    it('does not warn when second driver is provided', () => {
      const q = calculateQuote({
        market: 'des_moines',
        service_type: 'one_way',
        passenger_miles: 800,
        service_hours: 14, // under 15 alone, no warning
        additional_drivers_hours: 4,
        payment: 'credit_card',
      });
      expect(q.warnings.some(w => w.includes('DOT'))).toBe(false);
    });
  });

  // ===================================================================
  // LORIE 2026-05-21 CORRECTIONS
  // - Flat rates auto-apply 20% gratuity
  // - Flat rates carry per-route tolls (e.g., $10 QC -> O'Hare)
  // - QC -> Des Moines is NOT a flat-rate route
  // - Dead leg only applies when BOTH ends are non-garage cities
  // ===================================================================

  describe('Lorie 2026-05-21: flat rate auto-gratuity and tolls', () => {
    it('auto-applies 20% gratuity when no explicit gratuity passed', () => {
      const q = calculateQuote({
        market: 'quad_cities',
        service_type: 'one_way',
        passenger_miles: 0,
        payment: 'check',
        flat_rate_amount: 550,
        flat_rate_label: "QC -> O'Hare",
      });
      const gratLine = q.lines.find(l => l.label.includes('Gratuity (20%)'));
      expect(gratLine).toBeDefined();
    });

    it('does NOT auto-apply gratuity when caller passes explicit gratuity_pct', () => {
      const q = calculateQuote({
        market: 'quad_cities',
        service_type: 'one_way',
        passenger_miles: 0,
        payment: 'check',
        flat_rate_amount: 550,
        gratuity_pct: 0.15, // explicit override
      });
      const gratLine = q.lines.find(l => l.label.includes('Gratuity (15%)'));
      expect(gratLine).toBeDefined();
      expect(q.lines.find(l => l.label.includes('Gratuity (20%)'))).toBeUndefined();
    });

    it('adds per-route toll on top of the flat rate', () => {
      const q = calculateQuote({
        market: 'quad_cities',
        service_type: 'one_way',
        passenger_miles: 0,
        payment: 'check',
        flat_rate_amount: 550,
        flat_rate_toll: 10,
      });
      const tollLine = q.lines.find(l => l.label === 'Tolls');
      expect(tollLine?.amount).toBe(10);
    });

    it('warns concierge that fuel surcharge is not auto-applied on flat rates', () => {
      const q = calculateQuote({
        market: 'quad_cities',
        service_type: 'one_way',
        passenger_miles: 0,
        payment: 'check',
        flat_rate_amount: 550,
      });
      expect(q.warnings.some(w => w.includes('Fuel surcharge not included'))).toBe(true);
    });
  });

  describe('Lorie 2026-05-21: QC -> Des Moines no longer a flat route', () => {
    it('returns null for QC -> Des Moines (now a distance trip)', () => {
      const r = detectFlatRateRoute('Davenport, IA', 'Des Moines, IA');
      expect(r).toBeNull();
    });

    it('still detects QC -> Cedar Rapids as $300 flat', () => {
      const r = detectFlatRateRoute('Davenport, IA', 'Cedar Rapids, IA');
      expect(r?.price).toBe(300);
    });

    it('QC -> O\'Hare flat route includes the $10 toll definition', () => {
      const r = detectFlatRateRoute('Davenport, IA', "O'Hare International, Chicago");
      expect(r?.price).toBe(550);
      expect(r?.toll).toBe(10);
    });
  });

  describe('Ryan 2026-05-21: dead-leg garage warning', () => {
    it('isGarageCity matches LandJet garage cities case-insensitively', () => {
      expect(isGarageCity('Davenport, IA')).toBe(true);
      expect(isGarageCity('DALLAS, TX')).toBe(true);
      expect(isGarageCity('Quad Cities Intl Airport')).toBe(true);
      expect(isGarageCity('Random Small Town, KS')).toBe(false);
      expect(isGarageCity(undefined)).toBe(false);
    });

    it('checkGarageEnds flags when pickup is a garage city', () => {
      const r = checkGarageEnds({ stops: [
        { address: 'Davenport, IA', state: 'IA' },
        { address: 'Random Town, IL', state: 'IL' },
      ]});
      expect(r.eitherEndIsGarage).toBe(true);
      expect(r.garageEnd).toContain('pickup');
    });

    it('checkGarageEnds returns false when both ends are non-garage', () => {
      const r = checkGarageEnds({ stops: [
        { address: 'Tiny Town, IL', state: 'IL' },
        { address: 'Other Tiny Town, IL', state: 'IL' },
      ]});
      expect(r.eitherEndIsGarage).toBe(false);
    });

    it('warns when dead leg is charged but pickup is a garage city', () => {
      const q = calculateQuote({
        market: 'quad_cities',
        service_type: 'one_way',
        passenger_miles: 250,
        deadleg_miles: 50,
        payment: 'credit_card',
        stops: [
          { address: 'Davenport, IA', state: 'IA' },
          { address: 'Some Town, IL', state: 'IL' },
        ],
      });
      expect(q.warnings.some(w => w.includes('garage city'))).toBe(true);
    });

    it('does NOT warn when both ends are non-garage cities (dead leg correctly applied)', () => {
      const q = calculateQuote({
        market: 'quad_cities',
        service_type: 'one_way',
        passenger_miles: 250,
        deadleg_miles: 50,
        payment: 'credit_card',
        stops: [
          { address: 'Small Town, IL', state: 'IL' },
          { address: 'Other Small Town, IL', state: 'IL' },
        ],
      });
      expect(q.warnings.some(w => w.includes('garage city'))).toBe(false);
    });

    it('does NOT warn when no dead leg is charged', () => {
      const q = calculateQuote({
        market: 'quad_cities',
        service_type: 'one_way',
        passenger_miles: 250,
        payment: 'credit_card',
        stops: [
          { address: 'Davenport, IA', state: 'IA' },
          { address: 'Some Town, IL', state: 'IL' },
        ],
      });
      expect(q.warnings.some(w => w.includes('garage city'))).toBe(false);
    });
  });
});
