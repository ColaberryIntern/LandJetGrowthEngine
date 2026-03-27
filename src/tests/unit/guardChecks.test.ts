import { isInSendWindow, isTestSafe, interleaveActions, calculatePacingLimit } from '../../services/guardChecks';

describe('Guard Checks', () => {
  describe('isInSendWindow', () => {
    it('should allow sends during business hours on weekdays', () => {
      // Wednesday 2pm UTC = 9am CT
      const wed2pmUtc = new Date('2026-04-01T14:00:00Z'); // Wed
      const result = isInSendWindow('email', wed2pmUtc);
      expect(result.allowed).toBe(true);
    });

    it('should block sends on weekends', () => {
      // Saturday 2pm UTC
      const sat = new Date('2026-04-04T14:00:00Z'); // Saturday
      const result = isInSendWindow('email', sat);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('business days');
    });

    it('should block sends before 8am CT', () => {
      // Wednesday 11am UTC = 6am CT
      const early = new Date('2026-04-01T11:00:00Z');
      const result = isInSendWindow('email', early);
      expect(result.allowed).toBe(false);
    });

    it('should block voice calls before 9am CT', () => {
      // Wednesday 1pm UTC = 8am CT (within email window but before voice window)
      const earlyVoice = new Date('2026-04-01T13:00:00Z');
      const result = isInSendWindow('voice', earlyVoice);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Voice calls');
    });
  });

  describe('isTestSafe', () => {
    it('should allow non-test actions', () => {
      const result = isTestSafe({ is_test_action: false, channel: 'email', to_email: 'anyone@corp.com' } as any);
      expect(result.allowed).toBe(true);
    });

    it('should block test actions targeting non-test domains', () => {
      const result = isTestSafe({ is_test_action: true, channel: 'email', to_email: 'ceo@bigcorp.com' } as any);
      expect(result.allowed).toBe(false);
    });

    it('should allow test actions targeting test domains', () => {
      process.env.CAMPAIGN_TEST_EMAIL_DOMAIN = 'test.landjet.com';
      const result = isTestSafe({ is_test_action: true, channel: 'email', to_email: 'test@test.landjet.com' } as any);
      expect(result.allowed).toBe(true);
    });
  });

  describe('interleaveActions', () => {
    it('should interleave actions from different campaigns', () => {
      const actions = [
        { id: 'a1', campaign_id: 'A' },
        { id: 'a2', campaign_id: 'A' },
        { id: 'a3', campaign_id: 'A' },
        { id: 'b1', campaign_id: 'B' },
        { id: 'b2', campaign_id: 'B' },
        { id: 'b3', campaign_id: 'B' },
      ];

      const result = interleaveActions(actions);
      expect(result.map(a => a.id)).toEqual(['a1', 'b1', 'a2', 'b2', 'a3', 'b3']);
    });

    it('should handle uneven campaign sizes', () => {
      const actions = [
        { id: 'a1', campaign_id: 'A' },
        { id: 'a2', campaign_id: 'A' },
        { id: 'b1', campaign_id: 'B' },
      ];

      const result = interleaveActions(actions);
      expect(result).toHaveLength(3);
      // Should be A, B, A
      expect(result[0].id).toBe('a1');
      expect(result[1].id).toBe('b1');
      expect(result[2].id).toBe('a2');
    });

    it('should handle single campaign', () => {
      const actions = [{ id: '1', campaign_id: 'X' }, { id: '2', campaign_id: 'X' }];
      const result = interleaveActions(actions);
      expect(result).toHaveLength(2);
    });

    it('should handle empty array', () => {
      expect(interleaveActions([])).toEqual([]);
    });

    it('should handle three campaigns', () => {
      const actions = [
        { id: 'a1', campaign_id: 'A' },
        { id: 'b1', campaign_id: 'B' },
        { id: 'c1', campaign_id: 'C' },
      ];
      const result = interleaveActions(actions);
      expect(result).toHaveLength(3);
    });
  });

  describe('calculatePacingLimit', () => {
    it('should calculate limit based on remaining capacity', () => {
      // 120 pending, 6 hours remaining, 12 cycles/hour
      const limit = calculatePacingLimit(120, 6, 12);
      // 120 / 6 = 20 per hour, 20 / 12 = 1.67, ceil = 2
      expect(limit).toBe(2);
    });

    it('should return at least 1', () => {
      const limit = calculatePacingLimit(1, 8, 12);
      expect(limit).toBeGreaterThanOrEqual(1);
    });

    it('should return 0 if no hours remaining', () => {
      const limit = calculatePacingLimit(100, 0, 12);
      expect(limit).toBe(0);
    });

    it('should handle high volume correctly', () => {
      // 500 pending, 2 hours, 12 cycles/hour
      const limit = calculatePacingLimit(500, 2, 12);
      // 500 / 2 = 250 per hour, 250 / 12 = 20.83, ceil = 21
      expect(limit).toBe(21);
    });
  });
});
