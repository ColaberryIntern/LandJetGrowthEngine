/**
 * BookRidesOnline email parser.
 *
 * BookRides auto-emails LandJet inboxes when a customer fills out the website quote form.
 * The email has a structured format we can parse without LLM:
 *
 *   Passenger Info: name, phone, email
 *   Reservation Info: date of service, service type, start time, reservation #, passengers, luggage, vehicle
 *   Pickup: full address
 *   Dropoff: full address
 *
 * This parser is deterministic (regex-based) and idempotent. It returns a structured
 * trip object that the pricing engine can consume directly.
 */

export interface BookRidesTrip {
  passenger_name: string;
  passenger_phone?: string;
  passenger_email?: string;
  date_of_service?: string;     // raw "MM/DD/YYYY" as appears in email
  service_type?: 'Round Trip' | 'One Way' | string;
  start_time?: string;          // raw "8:27 AM"
  reservation_number?: string;
  passengers?: number;
  luggage?: number;
  vehicle?: string;
  pickup_address?: string;
  dropoff_address?: string;
  raw_extracted_at: string;     // ISO timestamp of parse
}

const FIELD_PATTERNS: Record<keyof Omit<BookRidesTrip, 'raw_extracted_at'>, RegExp> = {
  passenger_name: /Passenger Info\s*\n+\s*([^\n]+)/i,
  passenger_phone: /Phone:\s*([0-9()\-\s.]+)/i,
  passenger_email: /Email:\s*([^\s\n]+@[^\s\n]+)/i,
  date_of_service: /Date Of Service:\s*([0-9/.-]+)/i,
  service_type: /Service Type:\s*([^\n]+)/i,
  start_time: /Start Time:\s*([^\n]+)/i,
  reservation_number: /Reservation #:\s*(\d+)/i,
  passengers: /Passengers:\s*(\d+)/i,
  luggage: /Luggage:\s*(\d+)/i,
  vehicle: /Vehicle:\s*([^\n]+)/i,
  pickup_address: /Pickup\s*\n+\s*([^\n]+(?:\n(?!\s*(?:Dropoff|Charges|This email|©))[^\n]+)*)/i,
  dropoff_address: /Dropoff\s*\n+\s*([^\n]+(?:\n(?!\s*(?:Pickup|Charges|This email|©|Return Info))[^\n]+)*)/i,
};

/**
 * Detect if an email body looks like a BookRides notification.
 * Cheap check before running the full parser.
 */
export function isBookRidesEmail(body: string): boolean {
  if (!body) return false;
  const indicators = [
    /BookRides/i,
    /Book Rides Online/i,
    /Reservation #:/i,
    /Date Of Service:/i,
  ];
  return indicators.some(re => re.test(body));
}

/**
 * Parse a BookRides email body into structured trip data.
 * Returns null if the email is not parseable as BookRides.
 */
export function parseBookRidesEmail(body: string): BookRidesTrip | null {
  if (!isBookRidesEmail(body)) return null;

  // Normalize: strip leading whitespace from each line for predictable matching
  const normalized = body
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(l => l.replace(/^\s+/, ''))
    .join('\n');

  const trip: BookRidesTrip = {
    passenger_name: '',
    raw_extracted_at: new Date().toISOString(),
  };

  for (const [key, pattern] of Object.entries(FIELD_PATTERNS) as [keyof typeof FIELD_PATTERNS, RegExp][]) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const value = match[1].trim();

    if (key === 'passengers' || key === 'luggage') {
      (trip as any)[key] = parseInt(value, 10);
    } else if (key === 'pickup_address' || key === 'dropoff_address') {
      // Collapse multi-line addresses into a single line for the pricing engine
      (trip as any)[key] = value.replace(/\n+/g, ', ').replace(/\s{2,}/g, ' ').trim();
    } else {
      (trip as any)[key] = value;
    }
  }

  return trip.passenger_name || trip.reservation_number ? trip : null;
}
