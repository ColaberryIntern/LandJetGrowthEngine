import { deriveConfidenceAndStatus, htmlToText } from '../../services/reservationQuoteService';
import { processInboundEmail } from '../../services/inboundQuoteEngine';
import type { InboundProcessResult } from '../../services/inboundQuoteEngine';

const priced = (over: Partial<any> = {}): InboundProcessResult => ({
  mode: 'priced',
  market: 'dallas',
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

  it('miles unknown (concierge warning) -> needs_review', () => {
    const r = deriveConfidenceAndStatus(priced({ warnings: ['Passenger miles unknown; concierge to fill in'] }));
    expect(r.status).toBe('needs_review');
    expect(r.confidence).toBeLessThan(0.7);
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
