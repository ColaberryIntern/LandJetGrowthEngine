/**
 * reservationClassify.ts
 * Two deterministic helpers that keep the queue honest:
 *  - isNonQuoteEmail: is this just inbox noise (Instagram, SharePoint, receipts,
 *    bounces, calendar invites) rather than a transportation quote request? Only
 *    meaningful for emails that did NOT already parse/extract as a quote.
 *  - missingForQuote: what does a request still need before we can price it?
 */
import type { BookRidesTrip } from './bookRidesParser';

// Automated senders that are never a customer quote request. NOTE: BookRides
// (no-reply@bookridesonline.com) is deliberately NOT here -- it is a quote source
// and is handled before this check ever runs.
const NOISE_DOMAINS = /@(?:[a-z0-9-]+\.)*(instagram|facebookmail|facebook|fb|linkedin|twitter|tiktok|pinterest|mailchimp|mailchimpapp|constantcontact|eventbrite|calendly|docusign|hellosign|quickbooks|intuit|stripe|paypal|squareup|sharepointonline|onmicrosoft|zoom|slack|asana|trello|notion|substack|medium|youtube|google|nextdoor)\.com\b/i;

const NOISE_SENDER = /(mailer-daemon|postmaster|no-?reply@(?:sharepoint|microsoft|office365|sharepointonline))/i;

const NOISE_SUBJECT = /(added to (their|your) stor|has responded to your request|you now have access|out of office|automatic reply|undeliverable|delivery (status notification|has failed|failure)|read:|payment received|newsletter|webinar|unsubscribe|verify your|reset your password|security alert|meeting (invitation|accepted|declined|canceled)|^(accepted|declined|canceled|tentative):|your .* (subscription|account|order)|sign in|new (login|sign-in)|cart #)/i;

// A POST-BOOKING notice (invoice, receipt, or trip confirmation) is about a trip
// already handled, not a new quote request -- and BookRides sends these from the
// SAME address as quote requests. We detect them by SUBJECT, which is reliable;
// the BODY is NOT, because BookRides QUOTE-REQUEST emails share footer text with
// invoices ("Grand Total", "Please rate us on Google"), which previously caused
// real quote requests to be mis-filed as not_quote.
const POST_BOOKING_SUBJECT = /\b(invoice|receipt|statement)\b|services completed|(transportation|reservation|booking|trip) confirmation|payment (received|confirmation|request)/i;

// A quote request is NEVER a post-booking notice, whatever its body says.
const QUOTE_REQUEST_SUBJECT = /quote request|requested? a quote|request(?:ing)? a quote|quote for a trip|new (reservation|quote)/i;

/** Is this a post-booking notice (invoice / receipt / confirmation) rather than a new request? */
export function isPostBookingEmail(subject?: string | null, body?: string | null): boolean {
  const s = subject || '';
  if (QUOTE_REQUEST_SUBJECT.test(s)) return false; // an explicit quote request is a request
  // Subject-only invoice/receipt/statement check. ("invoice"/"receipt"/"statement"
  // can appear in a quote-request body too, so we deliberately do not scan the body.)
  return POST_BOOKING_SUBJECT.test(s);
}

/** True when the email is automated/non-customer noise rather than a quote request. */
export function isNonQuoteEmail(from?: string | null, subject?: string | null, body?: string | null): boolean {
  const f = (from || '').toLowerCase();
  const s = (subject || '').toLowerCase();
  if (NOISE_DOMAINS.test(f) || NOISE_SENDER.test(f)) return true;
  if (NOISE_SUBJECT.test(s)) return true;
  if (isPostBookingEmail(subject, body)) return true; // invoices/receipts/confirmations (incl. from BookRides)
  // A short body that is clearly a system notice (no trip language at all).
  const b = (body || '').slice(0, 400).toLowerCase();
  if (/this email (is|was) (generated|sent automatically)|do not reply to this/.test(b) &&
      !/pickup|drop ?off|quote|trip|passenger|reservation|airport|vehicle/.test(b)) return true;
  return false;
}

export interface MissingField { key: string; label: string }

/** What a request still needs before we can produce a proper quote. */
export function missingForQuote(trip?: Partial<BookRidesTrip> | null): MissingField[] {
  const t = trip || {};
  const out: MissingField[] = [];
  if (!t.pickup_address) out.push({ key: 'pickup', label: 'Pickup address' });
  if (!t.dropoff_address) out.push({ key: 'dropoff', label: 'Dropoff address' });
  if (!t.date_of_service) out.push({ key: 'date', label: 'Date of service' });
  if (t.passengers == null) out.push({ key: 'passengers', label: 'Number of passengers' });
  return out;
}
