import {
  validateAiQuoteBody,
  renderTemplateQuoteBody,
  dollarVariants,
  extractCityFromAddress,
} from '../../services/quoteResponseGuard';
import { QuoteOutput } from '../../services/landjetPricing';

function quoteFixture(grandTotal = 1247.50): QuoteOutput {
  return {
    market: 'dallas' as any,
    customer_category: 'standard' as any,
    service_type: 'one_way' as any,
    pricing_mode: 'distance',
    lines: [
      { label: 'Base fare (Wylie to Texarkana)', amount: 950.00 },
      { label: 'Iowa sales tax', amount: 0.00 },
      { label: 'Gratuity (20%)', amount: 190.00 },
      { label: 'Credit card fee (3%)', amount: 107.50 },
    ],
    subtotal: 950.00,
    secondary_total: 950.00,
    third_total: 1140.00,
    grand_total: grandTotal,
    warnings: [],
    approvals_needed: [],
    requires_human_review: false,
    human_review_reasons: [],
  };
}

const ctx = {
  customer_name: 'Ali Muwwakkil',
  pickup_address: '1801 Doves Landing Ln, Wylie, TX 75098, USA',
  dropoff_address: 'Country Inn & Suites, 1918 University Ave, Texarkana, TX 75503',
  date_of_service: '05/22/2026',
};

describe('dollarVariants', () => {
  it('produces $1,247.50 and $1247.50 and 1,247.50 variants', () => {
    const vs = dollarVariants(1247.50);
    expect(vs).toContain('$1,247.50');
    expect(vs).toContain('$1247.50');
    expect(vs).toContain('1,247.50');
  });

  it('drops the trailing .00 variant for whole-dollar values', () => {
    const vs = dollarVariants(950);
    expect(vs).toContain('$950');
  });
});

describe('extractCityFromAddress', () => {
  it('pulls Wylie out of a TX address with ZIP+USA', () => {
    expect(extractCityFromAddress('1801 Doves Landing Ln, Wylie, TX 75098, USA')).toBe('Wylie');
  });

  it('pulls Des Moines out of an IA address', () => {
    expect(extractCityFromAddress('3000 E Grand Ave, Des Moines, IA 50317')).toBe('Des Moines');
  });

  it('returns null when no comma+state pattern is present', () => {
    expect(extractCityFromAddress('just a single line')).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(extractCityFromAddress(undefined)).toBeNull();
  });
});

describe('validateAiQuoteBody', () => {
  it('accepts a body that contains grand total + customer name + both cities', () => {
    const body = `Hi Ali, your trip from Wylie to Texarkana on 5/22 is $1,247.50. Reply to confirm.`;
    const r = validateAiQuoteBody(body, quoteFixture(), ctx);
    expect(r.ok).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it('rejects when the AI rounds the grand total', () => {
    const body = `Hi Ali, your trip from Wylie to Texarkana is $1,250.`;
    const r = validateAiQuoteBody(body, quoteFixture(1247.50), ctx);
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toMatch(/grand_total/);
  });

  it('rejects when the customer first name is missing', () => {
    const body = `Hello, your trip from Wylie to Texarkana is $1,247.50. Reply to confirm.`;
    const r = validateAiQuoteBody(body, quoteFixture(), ctx);
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/first name "ali"/i);
  });

  it('rejects when the pickup city is missing', () => {
    const body = `Hi Ali, your trip to Texarkana is $1,247.50.`;
    const r = validateAiQuoteBody(body, quoteFixture(), ctx);
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/pickup city "Wylie"/);
  });

  it('rejects when the dropoff city is missing', () => {
    const body = `Hi Ali, your trip from Wylie is $1,247.50.`;
    const r = validateAiQuoteBody(body, quoteFixture(), ctx);
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/dropoff city "Texarkana"/);
  });

  it('rejects an invented "complimentary" perk', () => {
    const body = `Hi Ali, your trip from Wylie to Texarkana is $1,247.50. Complimentary water on board.`;
    const r = validateAiQuoteBody(body, quoteFixture(), ctx);
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/forbidden invented/);
  });

  it('rejects an invented discount', () => {
    const body = `Hi Ali, your trip from Wylie to Texarkana is $1,247.50. 10% off on return.`;
    const r = validateAiQuoteBody(body, quoteFixture(), ctx);
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/forbidden invented/);
  });

  it('rejects an invented refund guarantee', () => {
    const body = `Hi Ali, your trip from Wylie to Texarkana is $1,247.50. Fully refundable up to 24h.`;
    const r = validateAiQuoteBody(body, quoteFixture(), ctx);
    expect(r.ok).toBe(false);
  });

  it('passes when grand total has no trailing decimal (whole dollar amount)', () => {
    const body = `Hi Ali, your trip from Wylie to Texarkana is $950.`;
    const r = validateAiQuoteBody(body, quoteFixture(950), ctx);
    expect(r.ok).toBe(true);
  });
});

describe('renderTemplateQuoteBody', () => {
  it('includes the exact grand total + every line item', () => {
    const out = renderTemplateQuoteBody(quoteFixture(), ctx);
    expect(out.body).toContain('$1247.50');
    expect(out.body).toContain('Base fare (Wylie to Texarkana): $950.00');
    expect(out.body).toContain('Gratuity (20%): $190.00');
    expect(out.body).toContain('Credit card fee (3%): $107.50');
  });

  it('opens with the customer first name', () => {
    const out = renderTemplateQuoteBody(quoteFixture(), ctx);
    expect(out.body.split('\n')[0]).toBe('Hi Ali,');
  });

  it('does not include forbidden invented phrases', () => {
    const out = renderTemplateQuoteBody(quoteFixture(), ctx);
    expect(out.body).not.toMatch(/complimentary|discount|guarantee|refund/i);
  });

  it('falls back to "there" when no customer name is provided', () => {
    const out = renderTemplateQuoteBody(quoteFixture(), { customer_name: '' });
    expect(out.body.startsWith('Hi there,')).toBe(true);
  });

  it('surfaces warnings and approvals in dedicated sections', () => {
    const q = quoteFixture();
    q.warnings = ['Distance lookup pending'];
    q.approvals_needed = ['Toll surcharge to be confirmed'];
    const out = renderTemplateQuoteBody(q, ctx);
    expect(out.body).toContain('Distance lookup pending');
    expect(out.body).toContain('Toll surcharge to be confirmed');
  });
});
