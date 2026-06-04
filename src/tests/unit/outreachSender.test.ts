// Regression tests for the sender resolution + ALLOWED_SENDERS guard.
// Driven by BC 9950199280 / Ryan WhatsApp 2026-06-01: some sends were
// going from ryan@landjet.com because the name-based router defaulted
// Manufacturing/Insurance/Healthcare/etc. campaigns to SENDER_MAP.customer
// (then ryan@). Per-campaign sender_email now wins, defaults are aligned
// to rlandry@, and the guard prevents drift.

import {
  resolveSender,
  getSenderForCampaign,
  ALLOWED_SENDERS,
  sendOutreachEmail,
} from '../../services/outreachEmailService';

describe('Outreach sender resolution + guard', () => {
  describe('resolveSender precedence', () => {
    it('explicit input.from beats campaign settings and SENDER_MAP', () => {
      expect(resolveSender({
        inputFrom: 'rlandry@landjet.com',
        campaignSenderEmail: 'rmlandry29@gmail.com',
        campaignName: 'Investor Outreach',
      })).toBe('rlandry@landjet.com');
    });

    it('campaign sender_email beats SENDER_MAP when input.from is missing', () => {
      expect(resolveSender({
        campaignSenderEmail: 'rlandry@landjet.com',
        campaignName: 'Cold Outreach - Manufacturing',
      })).toBe('rlandry@landjet.com');
    });

    it('falls back to SENDER_MAP only when both input.from and campaign settings are empty', () => {
      // Default SENDER_MAP.general is now rlandry@landjet.com (was ryan.landry@ pre-fix)
      expect(resolveSender({ campaignName: 'General Outreach' })).toBe('rlandry@landjet.com');
    });

    it('trims trailing whitespace on campaign sender_email (the 8 production rows had this)', () => {
      expect(resolveSender({
        campaignSenderEmail: 'rlandry@landjet.com ',
        campaignName: 'Banking & Finance Outreach',
      })).toBe('rlandry@landjet.com');
    });

    it('trims trailing whitespace on input.from', () => {
      expect(resolveSender({
        inputFrom: '  rlandry@landjet.com  ',
        campaignName: 'Investor Outreach',
      })).toBe('rlandry@landjet.com');
    });

    it('empty/whitespace-only campaign sender_email falls through to fallback', () => {
      expect(resolveSender({
        campaignSenderEmail: '   ',
        campaignName: 'Cold Outreach - Insurance',
      })).toBe('rlandry@landjet.com');
    });

    it('null campaign sender_email falls through to fallback', () => {
      expect(resolveSender({
        campaignSenderEmail: null,
        campaignName: 'Cold Outreach - Healthcare',
      })).toBe('rlandry@landjet.com');
    });
  });

  describe('getSenderForCampaign defaults after BC 9950199280', () => {
    // The original Ryan-WhatsApp bug: every Manufacturing/Insurance/Healthcare/
    // Banking/etc campaign returned SENDER_MAP.customer = ryan@ -- now ryan@
    // is gone from the map; all 3 entries default to rlandry@.

    it.each([
      ['Investor Outreach'],
      ['Cold Outreach - Manufacturing'],
      ['Cold Outreach - Insurance'],
      ['Cold Outreach - Healthcare'],
      ['Cold Outreach - Banking & Finance'],
      ['Cold Outreach - Legal'],
      ['Cold Outreach - Sports & Events'],
      ['Cold Outreach - Technology & Staffing'],
      ['Cold Outreach - Construction & Engineering'],
      ['General Outreach'],
      ['Cold Outreach - Business Services'],
      ['Cold Outreach - Education'],
    ])('campaign "%s" routes to rlandry@landjet.com', (campaignName) => {
      expect(getSenderForCampaign(campaignName)).toBe('rlandry@landjet.com');
    });
  });

  describe('ALLOWED_SENDERS guard', () => {
    it('rlandry@landjet.com is allowed', () => {
      expect(ALLOWED_SENDERS.has('rlandry@landjet.com')).toBe(true);
    });

    it('rmlandry29@gmail.com (test redirect) is allowed', () => {
      expect(ALLOWED_SENDERS.has('rmlandry29@gmail.com')).toBe(true);
    });

    it('ryan@landjet.com (the Ryan-WhatsApp surprise) is NOT allowed', () => {
      expect(ALLOWED_SENDERS.has('ryan@landjet.com')).toBe(false);
    });

    it('ryan.landry@landjet.com (legacy general fallback) is NOT allowed', () => {
      expect(ALLOWED_SENDERS.has('ryan.landry@landjet.com')).toBe(false);
    });

    it('sendOutreachEmail rejects a disallowed sender BEFORE calling Graph', async () => {
      const result = await sendOutreachEmail({
        to: 'leadtest@example.com',
        subject: 'should not send',
        body: 'should not send',
        from: 'ryan@landjet.com',  // not allowed
      });
      expect(result.success).toBe(false);
      expect(result.from).toBe('ryan@landjet.com');
      expect(result.error).toMatch(/ALLOWED_SENDERS/i);
    });

    it('sendOutreachEmail rejects a typo sender (whitespace-trim does not save it)', async () => {
      const result = await sendOutreachEmail({
        to: 'leadtest@example.com',
        subject: 'typo',
        body: 'typo',
        from: 'rlandry@landjet.co',  // missing m
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/ALLOWED_SENDERS/i);
    });
  });
});
