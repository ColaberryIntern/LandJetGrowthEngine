import {
  processInboundEmail,
  detectMarketFromOfficeHeader,
  detectMarketFromAddress,
  extractStateFromAddress,
  extractStopsFromTrip,
  mapServiceType,
} from '../../services/inboundQuoteEngine';
import { BookRidesTrip } from '../../services/bookRidesParser';

const BOOKRIDES_QC_TO_DM = `LandJet Quad Cities
8665263538
LJQuadCities@landjet.com

Quote Request

Trip Details

Passenger Info
Sara Johnson
Phone: 5635551234
Email: sara.johnson@example.com

Reservation Info
Date Of Service: 06/12/2026
Service Type: One Way
Start Time: 7:30 AM
Reservation #: 4400123
Passengers: 3
Luggage: 2
Vehicle: Executive Sedan

Pickup
1500 River Dr, Davenport, IA 52801, USA

Dropoff
3000 E Grand Ave, Des Moines, IA 50317, USA

Charges
This email was sent to you to confirm that you requested a quote.

© 2026 Book Rides Online, Inc. All Rights Reserved`;

const BOOKRIDES_QC_TO_OHARE_FLAT = `LandJet Quad Cities
LJQuadCities@landjet.com

Passenger Info
Mark Stevens
Email: mark@example.com

Reservation Info
Date Of Service: 07/01/2026
Service Type: One Way
Reservation #: 4400999

Pickup
1500 River Dr, Davenport, IA 52801, USA

Dropoff
10000 W O'Hare Ave, Chicago, IL 60666, USA

© 2026 Book Rides Online, Inc.`;

const BOOKRIDES_KC_TRIP = `LandJet Kansas City
LJKansasCity@landjet.com

Passenger Info
Tom Howard
Email: tom@example.com

Reservation Info
Date Of Service: 06/15/2026
Service Type: One Way
Reservation #: 4400777

Pickup
4400 Main St, Kansas City, MO 64111, USA

Dropoff
7000 Crown Center, Kansas City, MO 64108, USA

© 2026 Book Rides Online, Inc.`;

const BOOKRIDES_AUSTIN_TRIP = `LandJet Austin
LJAustin@landjet.com

Passenger Info
Amy Chen
Email: amy@example.com

Reservation Info
Date Of Service: 08/20/2026
Service Type: Round Trip
Reservation #: 4401111

Pickup
500 W 2nd St, Austin, TX 78701, USA

Dropoff
3600 Presidential Blvd, Austin, TX 78719, USA

© 2026 Book Rides Online, Inc.`;

const NON_BOOKRIDES = 'Hi, I was wondering if you have availability next Tuesday at 3pm? Thanks, John';

describe('Inbound Quote Engine', () => {

  describe('detectMarketFromOfficeHeader', () => {
    it('detects Quad Cities from email header', () => {
      expect(detectMarketFromOfficeHeader(BOOKRIDES_QC_TO_DM)).toBe('quad_cities');
    });
    it('detects Austin from email header', () => {
      expect(detectMarketFromOfficeHeader(BOOKRIDES_AUSTIN_TRIP)).toBe('austin');
    });
    it('detects Kansas City from kclandjet.com domain', () => {
      const body = 'reply-to: holly@kclandjet.com';
      expect(detectMarketFromOfficeHeader(body)).toBe('kansas_city');
    });
    it('returns null when no office header present', () => {
      expect(detectMarketFromOfficeHeader('hello world')).toBeNull();
    });
  });

  describe('detectMarketFromAddress', () => {
    it('matches Davenport to quad_cities', () => {
      expect(detectMarketFromAddress('1500 River Dr, Davenport, IA 52801')).toBe('quad_cities');
    });
    it('matches Des Moines to des_moines', () => {
      expect(detectMarketFromAddress('3000 E Grand Ave, Des Moines, IA 50317')).toBe('des_moines');
    });
    it('matches Austin to austin', () => {
      expect(detectMarketFromAddress('500 W 2nd St, Austin, TX 78701')).toBe('austin');
    });
    it('matches Kansas City to kansas_city', () => {
      expect(detectMarketFromAddress('4400 Main St, Kansas City, MO 64111')).toBe('kansas_city');
    });
    it('returns null for unknown city', () => {
      expect(detectMarketFromAddress('123 Main St, Boise, ID 83702')).toBeNull();
    });
  });

  describe('extractStateFromAddress', () => {
    it('extracts state from full address with ZIP', () => {
      expect(extractStateFromAddress('1500 River Dr, Davenport, IA 52801, USA')).toBe('IA');
    });
    it('extracts state from address with comma but no ZIP', () => {
      expect(extractStateFromAddress('Austin, TX')).toBe('TX');
    });
    it('returns null when no state code present', () => {
      expect(extractStateFromAddress('just some text')).toBeNull();
    });
    it('returns null on empty input', () => {
      expect(extractStateFromAddress('')).toBeNull();
    });
  });

  describe('extractStopsFromTrip', () => {
    it('builds stops array with state codes from pickup + dropoff', () => {
      const trip: BookRidesTrip = {
        passenger_name: 'Test',
        pickup_address: '1500 River Dr, Davenport, IA 52801',
        dropoff_address: '3000 E Grand Ave, Des Moines, IA 50317',
        raw_extracted_at: new Date().toISOString(),
      };
      const stops = extractStopsFromTrip(trip);
      expect(stops).toHaveLength(2);
      expect(stops[0].state).toBe('IA');
      expect(stops[1].state).toBe('IA');
    });

    it('omits stops with no parseable state', () => {
      const trip: BookRidesTrip = {
        passenger_name: 'Test',
        pickup_address: 'no state info here',
        dropoff_address: '3000 E Grand Ave, Des Moines, IA 50317',
        raw_extracted_at: new Date().toISOString(),
      };
      const stops = extractStopsFromTrip(trip);
      expect(stops).toHaveLength(1);
      expect(stops[0].state).toBe('IA');
    });
  });

  describe('mapServiceType', () => {
    it('maps "Round Trip" to round_trip', () => {
      expect(mapServiceType('Round Trip')).toBe('round_trip');
    });
    it('maps "One Way" to one_way', () => {
      expect(mapServiceType('One Way')).toBe('one_way');
    });
    it('maps "Hourly" to hourly_local', () => {
      expect(mapServiceType('Hourly Local')).toBe('hourly_local');
    });
    it('defaults to one_way when undefined', () => {
      expect(mapServiceType(undefined)).toBe('one_way');
    });
  });

  describe('processInboundEmail (happy path - QC to Des Moines, all-IA)', () => {
    const result = processInboundEmail(BOOKRIDES_QC_TO_DM, 'sara.johnson@example.com');

    it('returns priced mode', () => {
      expect(result.mode).toBe('priced');
    });
    it('detects quad_cities market', () => {
      expect(result.market).toBe('quad_cities');
    });
    it('extracts the trip', () => {
      expect(result.trip?.passenger_name).toBe('Sara Johnson');
      expect(result.trip?.pickup_address).toContain('Davenport');
    });
    it('produces a quote', () => {
      expect(result.quote).toBeDefined();
      expect(result.quote?.customer_category).toBe('standard');
      expect(result.quote?.lines.length).toBeGreaterThan(0);
    });
    it('applies Iowa tax (all stops in IA, QC market is IA-eligible)', () => {
      const taxLine = result.quote?.lines.find(l => /tax/i.test(l.label));
      expect(taxLine).toBeDefined();
    });
  });

  describe('processInboundEmail (flat-rate route - QC to O\'Hare)', () => {
    const result = processInboundEmail(BOOKRIDES_QC_TO_OHARE_FLAT);

    it('returns priced mode', () => {
      expect(result.mode).toBe('priced');
    });
    it('uses flat_rate pricing mode', () => {
      expect(result.quote?.pricing_mode).toBe('flat_rate');
    });
    it('does NOT apply Iowa tax (dropoff in IL disqualifies)', () => {
      const taxLine = result.quote?.lines.find(l => /tax/i.test(l.label));
      expect(taxLine).toBeUndefined();
    });
  });

  describe('processInboundEmail (KC -> forward_only)', () => {
    const result = processInboundEmail(BOOKRIDES_KC_TRIP);

    it('returns forward_only mode', () => {
      expect(result.mode).toBe('forward_only');
    });
    it('detects kansas_city market', () => {
      expect(result.market).toBe('kansas_city');
    });
    it('includes forward recipients', () => {
      expect(result.forward_to).toContain('holly@kclandjet.com');
      expect(result.forward_to).toContain('scott@kclandjet.com');
    });
    it('produces no quote', () => {
      expect(result.quote).toBeUndefined();
    });
    it('includes a forward_reason', () => {
      expect(result.forward_reason).toBeTruthy();
    });
  });

  describe('processInboundEmail (Austin trip, no Iowa tax)', () => {
    const result = processInboundEmail(BOOKRIDES_AUSTIN_TRIP);

    it('returns priced mode', () => {
      expect(result.mode).toBe('priced');
    });
    it('detects austin market', () => {
      expect(result.market).toBe('austin');
    });
    it('does NOT apply Iowa tax (Austin market is not iowa_tax_eligible)', () => {
      const taxLine = result.quote?.lines.find(l => /tax/i.test(l.label));
      expect(taxLine).toBeUndefined();
    });
  });

  describe('processInboundEmail (failure paths)', () => {
    it('returns manual mode for non-BookRides email', () => {
      const result = processInboundEmail(NON_BOOKRIDES);
      expect(result.mode).toBe('manual');
      expect(result.manual_reason).toBe('not_bookrides');
    });

    it('returns manual mode for empty body', () => {
      const result = processInboundEmail('');
      expect(result.mode).toBe('manual');
    });

    it('returns manual+unknown_market when city is not recognized', () => {
      const unknownCityEmail = `Book Rides Online
Passenger Info
John Doe
Reservation Info
Date Of Service: 09/01/2026
Reservation #: 5500001
Pickup
123 Main St, Springfield, MA 01103
Dropoff
456 Oak Ave, Springfield, MA 01104`;
      const result = processInboundEmail(unknownCityEmail);
      expect(result.mode).toBe('manual');
      expect(result.manual_reason).toBe('unknown_market');
      expect(result.trip).toBeDefined(); // we still parsed it
    });
  });

  describe('processInboundEmail (customer category detection)', () => {
    const jdEmail = BOOKRIDES_QC_TO_DM.replace('sara.johnson@example.com', 'sara.johnson@johndeere.com');

    it('detects JD employee from sender domain', () => {
      const result = processInboundEmail(jdEmail, 'sara.johnson@johndeere.com');
      expect(result.quote?.customer_category).toBe('jd_employee');
    });

    it('falls back to passenger_email when sender not provided', () => {
      const result = processInboundEmail(jdEmail);
      expect(result.quote?.customer_category).toBe('jd_employee');
    });
  });

  describe('Idempotency', () => {
    it('produces equivalent output on repeated calls (excluding timestamps)', () => {
      const a = processInboundEmail(BOOKRIDES_QC_TO_DM, 'sara@example.com');
      const b = processInboundEmail(BOOKRIDES_QC_TO_DM, 'sara@example.com');
      expect(a.mode).toBe(b.mode);
      expect(a.market).toBe(b.market);
      expect(a.quote?.grand_total).toBe(b.quote?.grand_total);
      expect(a.quote?.lines.length).toBe(b.quote?.lines.length);
    });
  });
});
