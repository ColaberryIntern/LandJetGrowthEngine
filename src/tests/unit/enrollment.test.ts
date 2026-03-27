import {
  calculateStandardScheduleTime,
  calculateCountdownScheduleTime,
} from '../../services/enrollmentService';
import { SequenceStep } from '../../models/FollowUpSequence';

function makeStep(overrides: Partial<SequenceStep> = {}): SequenceStep {
  return {
    delay_days: 0,
    channel: 'email',
    subject: 'Test',
    body_template: 'body',
    ai_instructions: 'Generate a message',
    ai_tone: 'professional',
    max_attempts: 1,
    ...overrides,
  };
}

describe('Enrollment Timing', () => {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const ONE_HOUR_MS = 60 * 60 * 1000;

  describe('calculateStandardScheduleTime', () => {
    it('should schedule step at day 0 within 1 hour of enrollment', () => {
      const enrollment = new Date('2026-04-01T10:00:00Z');
      const result = calculateStandardScheduleTime(enrollment, makeStep({ delay_days: 0 }));

      const diff = result.getTime() - enrollment.getTime();
      expect(diff).toBeGreaterThanOrEqual(0);
      expect(diff).toBeLessThan(ONE_HOUR_MS);
    });

    it('should schedule step at day 2 approximately 2 days after enrollment', () => {
      const enrollment = new Date('2026-04-01T10:00:00Z');
      const result = calculateStandardScheduleTime(enrollment, makeStep({ delay_days: 2 }));

      const diff = result.getTime() - enrollment.getTime();
      expect(diff).toBeGreaterThanOrEqual(2 * ONE_DAY_MS);
      expect(diff).toBeLessThan(2 * ONE_DAY_MS + ONE_HOUR_MS);
    });

    it('should schedule step at day 21 approximately 21 days after enrollment', () => {
      const enrollment = new Date('2026-04-01T10:00:00Z');
      const result = calculateStandardScheduleTime(enrollment, makeStep({ delay_days: 21 }));

      const diff = result.getTime() - enrollment.getTime();
      expect(diff).toBeGreaterThanOrEqual(21 * ONE_DAY_MS);
      expect(diff).toBeLessThan(21 * ONE_DAY_MS + ONE_HOUR_MS);
    });

    it('should add random jitter (different results for same input)', () => {
      const enrollment = new Date('2026-04-01T10:00:00Z');
      const results = new Set<number>();

      // Run multiple times - with randomness, should get different values
      for (let i = 0; i < 20; i++) {
        results.add(calculateStandardScheduleTime(enrollment, makeStep({ delay_days: 5 })).getTime());
      }

      // With 20 random jitters, should almost certainly get at least 2 different values
      expect(results.size).toBeGreaterThan(1);
    });
  });

  describe('calculateCountdownScheduleTime', () => {
    it('should schedule based on minutes_before_call', () => {
      const eventDate = new Date('2026-04-15T17:00:00Z');
      const result = calculateCountdownScheduleTime(
        eventDate,
        makeStep({ minutes_before_call: 15 }),
      );

      const expected = new Date('2026-04-15T16:45:00Z');
      expect(result.getTime()).toBe(expected.getTime());
    });

    it('should schedule 6 hours before call', () => {
      const eventDate = new Date('2026-04-15T17:00:00Z');
      const result = calculateCountdownScheduleTime(
        eventDate,
        makeStep({ minutes_before_call: 360 }),
      );

      const expected = new Date('2026-04-15T11:00:00Z');
      expect(result.getTime()).toBe(expected.getTime());
    });

    it('should schedule based on days_before_cohort_start', () => {
      const eventDate = new Date('2026-04-15T09:00:00Z');
      const result = calculateCountdownScheduleTime(
        eventDate,
        makeStep({ days_before_cohort_start: 3 }),
      );

      const expected = new Date('2026-04-12T09:00:00Z');
      expect(result.getTime()).toBe(expected.getTime());
    });

    it('should prefer minutes_before_call over days_before_cohort_start', () => {
      const eventDate = new Date('2026-04-15T17:00:00Z');
      const result = calculateCountdownScheduleTime(
        eventDate,
        makeStep({ minutes_before_call: 30, days_before_cohort_start: 7 }),
      );

      // Should use minutes_before_call, not days
      const expected = new Date('2026-04-15T16:30:00Z');
      expect(result.getTime()).toBe(expected.getTime());
    });
  });

  describe('past countdown step detection', () => {
    it('should identify steps scheduled in the past', () => {
      const now = new Date();
      const eventDate = new Date(now.getTime() + ONE_DAY_MS); // tomorrow
      const step = makeStep({ days_before_cohort_start: 3 }); // 3 days before = 2 days ago

      const scheduledFor = calculateCountdownScheduleTime(eventDate, step);
      expect(scheduledFor.getTime()).toBeLessThan(now.getTime());
    });

    it('should identify steps scheduled in the future', () => {
      const now = new Date();
      const eventDate = new Date(now.getTime() + 7 * ONE_DAY_MS); // 7 days from now
      const step = makeStep({ minutes_before_call: 15 }); // 15 min before event

      const scheduledFor = calculateCountdownScheduleTime(eventDate, step);
      expect(scheduledFor.getTime()).toBeGreaterThan(now.getTime());
    });
  });
});
