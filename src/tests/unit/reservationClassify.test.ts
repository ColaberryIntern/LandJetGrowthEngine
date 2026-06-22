import { isNonQuoteEmail, missingForQuote } from '../../services/reservationClassify';

describe('isNonQuoteEmail (keep inbox noise out of Needs reply)', () => {
  it('flags social / system notifications and receipts', () => {
    expect(isNonQuoteEmail('stories-recap@mail.instagram.com', 'liz_kirchgatter and 3 others recently added to their stories', '')).toBe(true);
    expect(isNonQuoteEmail('no-reply@sharepointonline.com', "Administrator has responded to your request for 'Concierge'", 'You now have access to Concierge.')).toBe(true);
    expect(isNonQuoteEmail('mailer-daemon@landjet.com', 'Undeliverable: Re: trip', '')).toBe(true);
    expect(isNonQuoteEmail('billing@intuit.com', 'Payment received: Invoice #1603', '')).toBe(true);
  });

  it('does NOT flag real quote sources or customers', () => {
    // BookRides is a quote source -- must never be treated as noise.
    expect(isNonQuoteEmail('no-reply@bookridesonline.com', 'stacey Spillum requested a quote for a trip', 'Pickup 123 Main St')).toBe(false);
    expect(isNonQuoteEmail('cparkin@vonmaur.com', 'Re: LandJet 6/24 & 7/7', 'We need a ride to the airport')).toBe(false);
    expect(isNonQuoteEmail('greg@gmail.com', 'Quote please', 'I need a quote from OHare to LeClaire')).toBe(false);
  });
});

describe('missingForQuote (what a request still needs)', () => {
  it('lists the gaps for an incomplete request', () => {
    const m = missingForQuote({ pickup_address: '123 Main St, Davenport, IA' } as any);
    const keys = m.map((x) => x.key);
    expect(keys).toContain('dropoff');
    expect(keys).toContain('date');
    expect(keys).toContain('passengers');
    expect(keys).not.toContain('pickup');
  });
  it('returns nothing when the request is complete', () => {
    expect(missingForQuote({ pickup_address: 'A', dropoff_address: 'B', date_of_service: '07/17/2026', passengers: 3 } as any)).toEqual([]);
  });
});
