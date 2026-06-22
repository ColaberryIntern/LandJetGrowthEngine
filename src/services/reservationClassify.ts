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

const NOISE_SUBJECT = /(added to (their|your) stor|has responded to your request|you now have access|out of office|automatic reply|undeliverable|delivery (status notification|has failed|failure)|read:|payment received|^invoice\b|^receipt\b|statement is ready|newsletter|webinar|unsubscribe|verify your|reset your password|security alert|meeting (invitation|accepted|declined|canceled)|^(accepted|declined|canceled|tentative):|your .* (subscription|account|order)|sign in|new (login|sign-in)|cart #)/i;

/** True when the email is automated/non-customer noise rather than a quote request. */
export function isNonQuoteEmail(from?: string | null, subject?: string | null, body?: string | null): boolean {
  const f = (from || '').toLowerCase();
  const s = (subject || '').toLowerCase();
  if (NOISE_DOMAINS.test(f) || NOISE_SENDER.test(f)) return true;
  if (NOISE_SUBJECT.test(s)) return true;
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
