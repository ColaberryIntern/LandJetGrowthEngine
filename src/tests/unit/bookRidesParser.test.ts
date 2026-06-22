import { isBookRidesEmail, parseBookRidesEmail } from '../../services/bookRidesParser';

const SAMPLE_BOOKRIDES_EMAIL = `LandJet Austin
8830 Business Park Drive, Suite 100, Austin, TX 78759
8665263538
LJAustin@landjet.com

Quote Request

Trip Details

Passenger Info
Blake Wilson
Phone: 6054600604
Email: Blakewilson1188@gmail.com

Reservation Info
Date Of Service: 04/07/2026
Service Type: Round Trip
Start Time: 8:27 AM
Reservation #: 3341491
Passengers: 2
Luggage: 1
Vehicle: Conference Room

Pickup
1551 Thoreau Dr N, Schaumburg, IL 60173, USA

Dropoff
3000 E Grand Ave, Des Moines, IA 50317, USA

Charges
This email was sent to you to confirm that you requested a quote.

© 2026 Book Rides Online, Inc. All Rights Reserved`;

describe('BookRides Email Parser', () => {

  describe('isBookRidesEmail', () => {
    it('returns true for actual BookRides email', () => {
      expect(isBookRidesEmail(SAMPLE_BOOKRIDES_EMAIL)).toBe(true);
    });

    it('returns false for unrelated email', () => {
      expect(isBookRidesEmail('Hi, just checking on my reservation tomorrow')).toBe(false);
    });

    it('returns false for empty input', () => {
      expect(isBookRidesEmail('')).toBe(false);
      expect(isBookRidesEmail(null as any)).toBe(false);
    });
  });

  describe('parseBookRidesEmail (happy path)', () => {
    const trip = parseBookRidesEmail(SAMPLE_BOOKRIDES_EMAIL);

    it('extracts passenger info', () => {
      expect(trip?.passenger_name).toBe('Blake Wilson');
      expect(trip?.passenger_phone).toBe('6054600604');
      expect(trip?.passenger_email).toBe('Blakewilson1188@gmail.com');
    });

    it('extracts reservation info', () => {
      expect(trip?.date_of_service).toBe('04/07/2026');
      expect(trip?.service_type).toBe('Round Trip');
      expect(trip?.start_time).toBe('8:27 AM');
      expect(trip?.reservation_number).toBe('3341491');
      expect(trip?.passengers).toBe(2);
      expect(trip?.luggage).toBe(1);
      expect(trip?.vehicle).toBe('Conference Room');
    });

    it('extracts pickup and dropoff addresses', () => {
      expect(trip?.pickup_address).toContain('1551 Thoreau Dr N');
      expect(trip?.pickup_address).toContain('Schaumburg, IL');
      expect(trip?.dropoff_address).toContain('3000 E Grand Ave');
      expect(trip?.dropoff_address).toContain('Des Moines, IA');
    });

    it('records timestamp of parse', () => {
      expect(trip?.raw_extracted_at).toBeDefined();
      expect(new Date(trip!.raw_extracted_at).getTime()).toBeGreaterThan(0);
    });
  });

  describe('parseBookRidesEmail (failure path)', () => {
    it('returns null for non-BookRides email', () => {
      expect(parseBookRidesEmail('hello world this is just a regular email')).toBeNull();
    });

    it('returns null for empty input', () => {
      expect(parseBookRidesEmail('')).toBeNull();
    });

    it('returns null when essential fields missing', () => {
      // Has the BookRides marker but no actual reservation data
      const partial = 'Book Rides Online\n© 2026 Book Rides Online, Inc.';
      const result = parseBookRidesEmail(partial);
      expect(result).toBeNull();
    });
  });

  describe('parseBookRidesEmail (boundary cases)', () => {
    it('handles email with extra whitespace and CRLF line endings', () => {
      const messy = SAMPLE_BOOKRIDES_EMAIL.replace(/\n/g, '\r\n   ');
      const trip = parseBookRidesEmail(messy);
      expect(trip?.passenger_name).toBe('Blake Wilson');
      expect(trip?.reservation_number).toBe('3341491');
    });

    it('handles missing optional fields gracefully', () => {
      const minimal = `Book Rides Online
Passenger Info
Jane Doe
Reservation Info
Date Of Service: 06/01/2026
Reservation #: 9999999
Pickup
123 Main St, Anywhere, USA
Dropoff
456 Oak Ave, Somewhere, USA`;
      const trip = parseBookRidesEmail(minimal);
      expect(trip).not.toBeNull();
      expect(trip?.passenger_name).toBe('Jane Doe');
      expect(trip?.reservation_number).toBe('9999999');
      expect(trip?.passenger_phone).toBeUndefined();
      expect(trip?.luggage).toBeUndefined();
    });
  });

  describe('Idempotency', () => {
    it('parsing the same email twice produces equivalent results (excluding timestamp)', () => {
      const a = parseBookRidesEmail(SAMPLE_BOOKRIDES_EMAIL);
      const b = parseBookRidesEmail(SAMPLE_BOOKRIDES_EMAIL);
      expect(a?.passenger_name).toBe(b?.passenger_name);
      expect(a?.reservation_number).toBe(b?.reservation_number);
      expect(a?.pickup_address).toBe(b?.pickup_address);
      expect(a?.dropoff_address).toBe(b?.dropoff_address);
    });
  });

  describe('Reply threads with repeated/quoted blocks (deterministic best-match)', () => {
    it('picks the most complete Pickup/Dropoff (with City, ST ZIP) over a truncated quoted copy', () => {
      // Simulates a "Re:" thread: a truncated quote appears first, the full
      // address block appears lower. The parser must choose the complete one.
      const thread = `Re: LandJet 6/29

Reservation #: 3500900
Pickup
Davenport
Dropoff
O'Hare

----- quoted -----
Reservation #: 3500900
Pickup
6110 Hillandale Rd, Davenport, IA 52806
Dropoff
Chicago O'Hare International Airport, Chicago, IL 60666`;
      const trip = parseBookRidesEmail(thread);
      expect(trip?.pickup_address).toBe('6110 Hillandale Rd, Davenport, IA 52806');
      expect(trip?.dropoff_address).toContain('IL 60666');
    });

    it('uses the first Stop(s) as the dropoff on a round trip with no Dropoff label', () => {
      const roundTrip = `LandJet 6/29/26

Reservation #: 3500901
Service Type: Round Trip
Pickup
6110 Hillandale Rd, Davenport, IA 52806
Stop(s)
2300 E Devon Ave, Elk Grove Village, IL 60007
Return Date: 7/13/26`;
      const trip = parseBookRidesEmail(roundTrip);
      expect(trip?.pickup_address).toBe('6110 Hillandale Rd, Davenport, IA 52806');
      expect(trip?.dropoff_address).toBe('2300 E Devon Ave, Elk Grove Village, IL 60007');
    });
  });
});
