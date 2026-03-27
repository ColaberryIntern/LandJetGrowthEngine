import { calculateLeadScore, getLeadTemperature, ScoreBreakdown } from '../../services/leadScoringService';

describe('Lead Scoring Service', () => {
  describe('calculateLeadScore', () => {
    it('should score 0 for minimal lead with free email', () => {
      const score = calculateLeadScore({
        email: 'user@gmail.com',
      });
      expect(score.total).toBe(0);
      expect(score.corporateEmail).toBe(0);
    });

    it('should give +20 for corporate email', () => {
      const score = calculateLeadScore({
        email: 'ceo@techcorp.com',
      });
      expect(score.corporateEmail).toBe(20);
      expect(score.total).toBe(20);
    });

    it('should give +20 for executive title (CEO)', () => {
      const score = calculateLeadScore({
        email: 'user@gmail.com',
        title: 'CEO',
      });
      expect(score.executiveTitle).toBe(20);
    });

    it('should give +20 for VP title', () => {
      const score = calculateLeadScore({
        email: 'user@gmail.com',
        title: 'VP of Engineering',
      });
      expect(score.executiveTitle).toBe(20);
    });

    it('should give +20 for Director title', () => {
      const score = calculateLeadScore({
        email: 'user@gmail.com',
        title: 'Director of Sales',
      });
      expect(score.executiveTitle).toBe(20);
    });

    it('should NOT give +20 for non-executive title', () => {
      const score = calculateLeadScore({
        email: 'user@gmail.com',
        title: 'Software Engineer',
      });
      expect(score.executiveTitle).toBe(0);
    });

    it('should give +30 for phone provided', () => {
      const score = calculateLeadScore({
        email: 'user@gmail.com',
        phone: '+15551234567',
      });
      expect(score.phoneProvided).toBe(30);
    });

    it('should NOT give +30 for empty phone', () => {
      const score = calculateLeadScore({
        email: 'user@gmail.com',
        phone: '  ',
      });
      expect(score.phoneProvided).toBe(0);
    });

    it('should give +15 for evaluating lifecycle stage', () => {
      const score = calculateLeadScore({
        email: 'user@gmail.com',
        lifecycle_stage: 'evaluating',
      });
      expect(score.evaluatingWithin90Days).toBe(15);
    });

    it('should give +10 for company size 51+', () => {
      const score = calculateLeadScore({
        email: 'user@gmail.com',
        company_size: 51,
      });
      expect(score.companySizeOver50).toBe(10);
    });

    it('should NOT give +10 for company size under 51', () => {
      const score = calculateLeadScore({
        email: 'user@gmail.com',
        company_size: 50,
      });
      expect(score.companySizeOver50).toBe(0);
    });

    it('should give +10 for utm_source containing pricing', () => {
      const score = calculateLeadScore({
        email: 'user@gmail.com',
        utm_source: 'pricing-page',
      });
      expect(score.utmPricing).toBe(10);
    });

    it('should calculate max score of 105', () => {
      const score = calculateLeadScore({
        email: 'ceo@bigcorp.com',
        title: 'CEO',
        phone: '+15551234567',
        lifecycle_stage: 'evaluating',
        company_size: 500,
        utm_source: 'pricing',
      });
      expect(score.total).toBe(105);
      expect(score.corporateEmail).toBe(20);
      expect(score.executiveTitle).toBe(20);
      expect(score.phoneProvided).toBe(30);
      expect(score.evaluatingWithin90Days).toBe(15);
      expect(score.companySizeOver50).toBe(10);
      expect(score.utmPricing).toBe(10);
    });

    it('should cap at 105 even if individual scores exceed', () => {
      const score = calculateLeadScore({
        email: 'ceo@bigcorp.com',
        title: 'CEO',
        phone: '+15551234567',
        lifecycle_stage: 'evaluating',
        company_size: 500,
        utm_source: 'pricing',
      });
      expect(score.total).toBeLessThanOrEqual(105);
    });
  });

  describe('getLeadTemperature', () => {
    it('should return cold for score < 40', () => {
      expect(getLeadTemperature(0)).toBe('cold');
      expect(getLeadTemperature(20)).toBe('cold');
      expect(getLeadTemperature(39)).toBe('cold');
    });

    it('should return warm for score 40-69', () => {
      expect(getLeadTemperature(40)).toBe('warm');
      expect(getLeadTemperature(55)).toBe('warm');
      expect(getLeadTemperature(69)).toBe('warm');
    });

    it('should return hot for score >= 70', () => {
      expect(getLeadTemperature(70)).toBe('hot');
      expect(getLeadTemperature(100)).toBe('hot');
      expect(getLeadTemperature(105)).toBe('hot');
    });
  });
});
