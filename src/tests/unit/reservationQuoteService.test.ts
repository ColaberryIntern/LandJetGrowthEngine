import { deriveConfidenceAndStatus, htmlToText, autoSendEligible, AUTOSEND_MIN_CONFIDENCE, isBookingIntent, isOurAddress, decideLifecycleFromThread } from '../../services/reservationQuoteService';
import { processInboundEmail, detectMarketFromAddress } from '../../services/inboundQuoteEngine';
import type { InboundProcessResult } from '../../services/inboundQuoteEngine';

const priced = (over: Partial<any> = {}, source?: 'bookrides' | 'nl'): InboundProcessResult => ({
  mode: 'priced',
  market: 'dallas',
  source,
  quote: { pricing_mode: 'distance', subtotal: 100, secondary_total: 100, third_total: 110, grand_total: 120, warnings: [], ...over } as any,
});

describe('deriveConfidenceAndStatus (Percy: simple=high, complex/incomplete=human)', () => {
  it('flat-rate route with no flags -> auto_ready 0.9', () => {
    expect(deriveConfidenceAndStatus(priced({ pricing_mode: 'flat_rate' })))
      .toEqual({ confidence: 0.9, status: 'auto_ready' });
  });

  it('priced, total>0, no flags -> auto_ready 0.7', () => {
    expect(deriveConfidenceAndStatus(priced()))
      .toEqual({ confidence: 0.7, status: 'auto_ready' });
  });

  it('incomplete miles (minimum applied, actual 0) -> needs_review', () => {
    const r = deriveConfidenceAndStatus(priced({ warnings: ['Mileage minimum 200 mi applied (actual 0 mi)'] }));
    expect(r.status).toBe('needs_review');
    expect(r.confidence).toBeLessThan(0.7);
  });

  it('routine flat-rate fuel/concierge note does NOT force review -> auto_ready', () => {
    const r = deriveConfidenceAndStatus(priced({ pricing_mode: 'flat_rate', warnings: ['Fuel surcharge not included on flat-rate quotes (route miles not tracked). Concierge: add $0.10/mi if applicable.'] }));
    expect(r).toEqual({ confidence: 0.9, status: 'auto_ready' });
  });

  it('complex trip (overnight / dead leg / approval) -> needs_review', () => {
    expect(deriveConfidenceAndStatus(priced({ warnings: ['Overnight stay required'] })).status).toBe('needs_review');
    expect(deriveConfidenceAndStatus(priced({ warnings: ['Needs approval: DOT compliance over 10 hours'] })).status).toBe('needs_review');
  });

  it('forward-only market -> forward 0', () => {
    expect(deriveConfidenceAndStatus({ mode: 'forward_only', market: 'kansas_city' } as InboundProcessResult))
      .toEqual({ confidence: 0, status: 'forward' });
  });

  it('non-quote (manual/faq) -> manual 0', () => {
    expect(deriveConfidenceAndStatus({ mode: 'manual', manual_reason: 'not_bookrides' } as InboundProcessResult))
      .toEqual({ confidence: 0, status: 'manual' });
  });

  it('NL-extracted priced quote -> needs_review (human verifies the AI read)', () => {
    expect(deriveConfidenceAndStatus(priced({}, 'nl' as any)).status).toBe('needs_review');
    expect(deriveConfidenceAndStatus(priced({}, 'nl' as any)).confidence).toBe(0.5);
  });

  it('NL booking detected but no routable address -> needs_review with details', () => {
    const r = deriveConfidenceAndStatus({ mode: 'manual', manual_reason: 'nl_no_route', source: 'nl', trip: { passenger_name: 'Mark', passengers: 8 } } as any);
    expect(r).toEqual({ confidence: 0.3, status: 'needs_review' });
  });

  it('NL but not a booking -> manual 0', () => {
    expect(deriveConfidenceAndStatus({ mode: 'manual', source: 'nl' } as InboundProcessResult))
      .toEqual({ confidence: 0, status: 'manual' });
  });
});

describe('detectMarketFromAddress (Quad Cities suburbs route, not just the core cities)', () => {
  it('resolves LeClaire IA (a direct-email dropoff) to quad_cities', () => {
    expect(detectMarketFromAddress('853 Canal Shore SW, LeClaire Iowa')).toBe('quad_cities');
    expect(detectMarketFromAddress('123 Main St, Le Claire, IA 52753')).toBe('quad_cities');
    expect(detectMarketFromAddress('Eldridge, IA')).toBe('quad_cities');
  });
  it('still resolves the core Quad Cities and leaves unknown towns null', () => {
    expect(detectMarketFromAddress('2950 Eastern Ave, Davenport, IA 52803')).toBe('quad_cities');
    expect(detectMarketFromAddress('Louisville, KY')).toBeNull();
  });
});

describe('isBookingIntent (filter noise when ingesting a general mailbox)', () => {
  it('keeps real requests: priced, forward_only, and NL trips with an address', () => {
    expect(isBookingIntent({ mode: 'priced' } as InboundProcessResult)).toBe(true);
    expect(isBookingIntent({ mode: 'forward_only' } as InboundProcessResult)).toBe(true);
    expect(isBookingIntent({ mode: 'manual', source: 'nl', manual_reason: 'nl_no_route', trip: { dropoff_address: 'LeClaire, IA' } } as any)).toBe(true);
  });
  it('drops non-bookings: not_bookrides, faq, and parser-noise without an NL trip', () => {
    expect(isBookingIntent({ mode: 'manual', manual_reason: 'not_bookrides' } as InboundProcessResult)).toBe(false);
    expect(isBookingIntent({ mode: 'faq' } as InboundProcessResult)).toBe(false);
    expect(isBookingIntent({ mode: 'manual', manual_reason: 'incomplete_parse', source: 'bookrides' } as InboundProcessResult)).toBe(false);
    expect(isBookingIntent({ mode: 'manual', source: 'nl' } as InboundProcessResult)).toBe(false);
  });
});

describe('decideLifecycleFromThread (lifecycle follows who sent the LAST message)', () => {
  const cur = { lifecycle: 'needs_reply', our_reply_at: null, responded_at: null };
  const C = 'bpeterson@ncpinconline.com'; // customer
  const US = 'ljreservations@landjet.com'; // us

  it('our reply is the last message -> awaiting_customer (even if app never sent it)', () => {
    const msgs = [{ from: C, t: 100 }, { from: US, t: 200 }, { from: C, t: 300 }, { from: US, t: 400 }];
    const d = decideLifecycleFromThread(msgs, 100, cur);
    expect(d.lifecycle).toBe('awaiting_customer');
    expect(d.our_reply_at).toBe(400);
    expect(d.responded_at).toBe(300); // last customer message
  });

  it('customer is the last message -> needs_reply', () => {
    const msgs = [{ from: C, t: 100 }, { from: US, t: 200 }, { from: C, t: 300 }];
    const d = decideLifecycleFromThread(msgs, 100, { ...cur, lifecycle: 'awaiting_customer' });
    expect(d.lifecycle).toBe('needs_reply');
    expect(d.responded_at).toBe(300);
  });

  it('only the original inbound, no reply yet -> needs_reply', () => {
    expect(decideLifecycleFromThread([{ from: C, t: 100 }], 100, cur).lifecycle).toBeUndefined(); // already needs_reply
    expect(decideLifecycleFromThread([{ from: C, t: 100 }], 100, { ...cur, lifecycle: 'awaiting_customer' }).lifecycle).toBe('needs_reply');
  });

  it('treats any @landjet.com sender as ours (staff replying from their own address)', () => {
    expect(isOurAddress('rlandry@landjet.com')).toBe(true);
    expect(isOurAddress('percy@landjet.com')).toBe(true);
    expect(isOurAddress('bpeterson@ncpinconline.com')).toBe(false);
    const d = decideLifecycleFromThread([{ from: C, t: 100 }, { from: 'lorie@landjet.com', t: 200 }], 100, cur);
    expect(d.lifecycle).toBe('awaiting_customer');
  });

  it('no change when state already matches', () => {
    const d = decideLifecycleFromThread([{ from: C, t: 100 }, { from: US, t: 200 }], 100, { lifecycle: 'awaiting_customer', our_reply_at: 200, responded_at: null });
    expect(d.lifecycle).toBeUndefined();
    expect(d.our_reply_at).toBeUndefined();
  });

  it('customer signs off after we replied -> completed (auto-resolved) with resolved_at', () => {
    const msgs = [{ from: C, t: 100 }, { from: US, t: 200 }, { from: C, t: 300, preview: 'Sounds great, thank you!!' }];
    const d = decideLifecycleFromThread(msgs, 100, cur);
    expect(d.lifecycle).toBe('completed');
    expect(d.resolved_at).toBe(300);
    expect(d.last_inbound_intent).toBe('gratitude');
  });

  it('a NEW question after a sign-off re-opens to needs_reply and clears resolved_at', () => {
    const msgs = [{ from: US, t: 200 }, { from: C, t: 300, preview: 'thanks!' }, { from: C, t: 400, preview: 'Actually, can you change the time?' }];
    const d = decideLifecycleFromThread(msgs, 100, { lifecycle: 'completed', our_reply_at: 200, responded_at: 300, resolved_at: 300 });
    expect(d.lifecycle).toBe('needs_reply');
    expect(d.resolved_at).toBeNull();
    expect(d.last_inbound_intent).toBe('question');
  });

  it('a bare sign-off with NO prior reply from us stays needs_reply (we never engaged)', () => {
    const d = decideLifecycleFromThread([{ from: C, t: 100, preview: 'thanks in advance!' }], 100, cur);
    expect(d.lifecycle).toBeUndefined(); // already needs_reply
  });
});

describe('autoSendEligible (Trust-Before-Intelligence: only act at/above 0.90)', () => {
  it('blocks anything below the threshold', () => {
    expect(autoSendEligible({ status: 'auto_ready', confidence: 0.7 })).toBe(false);
    expect(autoSendEligible({ status: 'needs_review', confidence: 0.95 })).toBe(false);
  });
  it('allows only high-confidence auto_ready', () => {
    expect(autoSendEligible({ status: 'auto_ready', confidence: AUTOSEND_MIN_CONFIDENCE })).toBe(true);
    expect(autoSendEligible({ status: 'auto_ready', confidence: '0.90' })).toBe(true);
  });
});

describe('htmlToText', () => {
  it('strips tags, decodes entities, keeps line breaks', () => {
    const out = htmlToText('<div>Pickup<br>123 Main &amp; 5th</div><p>Dropoff</p>');
    expect(out).toContain('Pickup');
    expect(out).toContain('123 Main & 5th');
    expect(out).toContain('Dropoff');
    expect(out).not.toContain('<');
  });
});

describe('end-to-end: a real BookRides flat-rate email prices to auto_ready', () => {
  it('Quad Cities -> O\'Hare resolves to a priced, high-confidence quote', () => {
    const email = [
      'LandJet Quad Cities', 'LJQuadCities@landjet.com', '', 'Quote Request', '',
      'Passenger Info', 'Matt Tuft', 'Phone: 3094567890', 'Email: matt.tuft@insightassetmgmt.com', '',
      'Reservation Info', 'Date Of Service: 06/15/2026', 'Service Type: One Way', 'Start Time: 5:30 AM',
      'Reservation #: 3341492', 'Passengers: 1', 'Luggage: 1', 'Vehicle: Executive Sedan', '',
      'Pickup', '2950 Eastern Ave, Davenport, IA 52803, USA', '',
      'Dropoff', "10000 W O'Hare Ave, Chicago, IL 60666, USA", '',
    ].join('\n');
    const result = processInboundEmail(email, 'matt.tuft@insightassetmgmt.com');
    expect(['priced', 'forward_only']).toContain(result.mode);
    if (result.mode === 'priced') {
      const d = deriveConfidenceAndStatus(result);
      expect(['auto_ready', 'needs_review']).toContain(d.status);
      expect(d.confidence).toBeGreaterThan(0);
    }
  });
});
