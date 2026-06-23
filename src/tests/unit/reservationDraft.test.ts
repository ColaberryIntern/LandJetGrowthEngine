import { scoreDraft } from '../../services/reservationDraftService';
import { topReplyPortion } from '../../services/reservationLearningService';

const rq = (over: any = {}): any => ({
  id: 1,
  subject: 'Quote Request',
  result: {
    trip: { passenger_name: 'Greg Bush', pickup_address: 'OHare Airport, Chicago, IL', dropoff_address: '853 Canal Shore SW, LeClaire, IA' },
    quote: { grand_total: 927, service_type: 'one_way' },
  },
  ...over,
});

describe('scoreDraft (self-evaluating rubric)', () => {
  it('a clean, on-voice, priced reply that names the route scores high', () => {
    const text = 'Hi Greg,\n\nThanks for reaching out. For your trip from OHare Airport to LeClaire, your estimated quote is $927.00. Reply to confirm and we will get you booked.\n\nBest,\nLandJet Reservations';
    const r = scoreDraft({ subject: 'Re: Quote Request', text }, rq(), true);
    expect(r.breakdown.has_greeting).toBe(true);
    expect(r.breakdown.has_signoff).toBe(true);
    expect(r.breakdown.no_emdash).toBe(true);
    expect(r.breakdown.includes_price).toBe(true);
    expect(r.breakdown.addresses_route).toBe(true);
    expect(r.breakdown.tone_matched).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(0.85);
  });

  it('flags an em dash and a missing price', () => {
    const text = 'Hi Greg, here is some info — we will follow up later. Best, LandJet';
    const r = scoreDraft({ subject: 'Re: Quote Request', text }, rq(), false);
    expect(r.breakdown.no_emdash).toBe(false);
    expect(r.breakdown.includes_price).toBe(false);
    expect(r.breakdown.tone_matched).toBe(false); // not primed by a learned profile
    expect(r.score).toBeLessThan(0.7);
  });

  it('on a follow-up, NOT re-quoting is rewarded and a stray price is penalized', () => {
    const good = scoreDraft({ subject: 'Re', text: 'Hi Greg,\n\nThe driver will reach you 24 hours prior with details. Let us know if you need anything else.\n\nBest,\nLandJet' }, rq(), true, 'follow_up');
    expect(good.breakdown.no_new_quote).toBe(true);
    expect('includes_price' in good.breakdown).toBe(false);
    const bad = scoreDraft({ subject: 'Re', text: 'Hi Greg,\n\nGood news, the new total is $727.39. Please confirm.\n\nBest,\nLandJet' }, rq(), true, 'follow_up');
    expect(bad.breakdown.no_new_quote).toBe(false);
  });

  it('excludes price/route checks when the request has neither (fair denominator)', () => {
    const r = scoreDraft(
      { subject: 'Re', text: 'Hello there,\n\nThank you for your note. We will be in touch shortly with details.\n\nThanks,\nLandJet' },
      rq({ result: { trip: {}, quote: {} } }),
      true,
    );
    expect('includes_price' in r.breakdown).toBe(false);
    expect('addresses_route' in r.breakdown).toBe(false);
  });
});

describe('topReplyPortion (drop quoted history)', () => {
  it('cuts at an "On ... wrote:" quote header', () => {
    const out = topReplyPortion('Sounds great, see you then.\n\nOn Mon, Jun 1, 2026 at 9:00 AM Customer wrote:\n> original message');
    expect(out).toBe('Sounds great, see you then.');
  });
  it('cuts at a "From:" Outlook quote block', () => {
    const out = topReplyPortion('Here is your quote of $500.\nFrom: someone@x.com\nSent: Monday');
    expect(out).toBe('Here is your quote of $500.');
  });
  it('returns the whole body when there is no quoted history', () => {
    expect(topReplyPortion('Just a plain reply.')).toBe('Just a plain reply.');
  });
});
