// The deny filter is the guard that keeps vendor/newsletter/internal traffic
// from being counted as outreach replies (the 2026-06-20 over-count lesson).
import { isDenied } from '../../services/replyIngestionService';

describe('replyIngestion deny filter', () => {
  it('denies internal LandJet / Colaberry addresses', () => {
    expect(isDenied('rlandry@landjet.com', 'Re: anything')).toBe(true);
    expect(isDenied('perry@landjettexas.com', 'Re: anything')).toBe(true);
    expect(isDenied('ali@colaberry.com', 'Re: anything')).toBe(true);
  });

  it('denies the marketing vendor (TAG Agency)', () => {
    expect(isDenied('mikev@tagteamagency.com', 'RE: SEO Audit')).toBe(true);
    expect(isDenied('audraf@tagteamagency.com', 'RE: Paid search campaign')).toBe(true);
  });

  it('denies newsletter subjects even from an external lead', () => {
    expect(isDenied('katejoe11@gmail.com', 'Re: FW: LandJetter News')).toBe(true);
  });

  it('allows genuine external prospect replies', () => {
    expect(isDenied('sahir@spikecapital.io', 'Re: Ryan <> Spike Capital')).toBe(false);
    expect(isDenied('lauren.utz@ubs.com', 'RE: UBS - Upcoming Meeting')).toBe(false);
    expect(isDenied('mnelson@infusionequitygroup.com', 'Re: LandJet')).toBe(false);
  });

  it('is case-insensitive on the subject marker', () => {
    expect(isDenied('someone@example.com', 'RE: LANDJETTER NEWS issue 4')).toBe(true);
  });
});
