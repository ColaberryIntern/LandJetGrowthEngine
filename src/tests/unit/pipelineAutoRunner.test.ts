// Tests the deterministic helpers in the auto-runner. The runIngest /
// runScheduler / runPulse closures are integration-tested implicitly by
// the loop behavior; here we cover the math + env-flag checks.

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { isAutorunEnabled, jitter, msUntilNextPulse, isWeekendInChicago } from '../../services/pipelineAutoRunner';

describe('isAutorunEnabled', () => {
  const saved = process.env.PIPELINE_AUTORUN;
  afterEach(() => { process.env.PIPELINE_AUTORUN = saved; });

  it('returns true when env var is exactly "true"', () => {
    process.env.PIPELINE_AUTORUN = 'true';
    expect(isAutorunEnabled()).toBe(true);
  });

  it('returns false when env var is anything other than "true"', () => {
    process.env.PIPELINE_AUTORUN = '1';
    expect(isAutorunEnabled()).toBe(false);
    process.env.PIPELINE_AUTORUN = 'TRUE';
    expect(isAutorunEnabled()).toBe(false);
    process.env.PIPELINE_AUTORUN = 'false';
    expect(isAutorunEnabled()).toBe(false);
    delete process.env.PIPELINE_AUTORUN;
    expect(isAutorunEnabled()).toBe(false);
  });
});

describe('jitter', () => {
  it('produces values in [0, maxMs)', () => {
    for (let i = 0; i < 50; i++) {
      const v = jitter(30000);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(30000);
    }
  });

  it('returns 0 for max 0', () => {
    expect(jitter(0)).toBe(0);
  });
});

describe('msUntilNextPulse', () => {
  // 7am America/Chicago. CDT = UTC-5, CST = UTC-6. June is CDT.
  // 7am CDT == 12:00 UTC. So at 12:00 UTC on a June day, msUntilNextPulse
  // should be 0 or ~24h. At 13:00 UTC it should be ~23h.

  it('returns 24h when called right at 7am Chicago', () => {
    // 2026-06-09 12:00:00 UTC == 07:00 CDT
    const at7am = new Date('2026-06-09T12:00:00Z');
    const delta = msUntilNextPulse(at7am);
    // delta should be 24h (since today's 7am has just passed -- we use <= 0)
    expect(delta).toBe(24 * 60 * 60 * 1000);
  });

  it('returns 23h when called at 8am Chicago', () => {
    const at8am = new Date('2026-06-09T13:00:00Z');
    const delta = msUntilNextPulse(at8am);
    expect(delta).toBe(23 * 60 * 60 * 1000);
  });

  it('returns 1h when called at 6am Chicago', () => {
    const at6am = new Date('2026-06-09T11:00:00Z');
    const delta = msUntilNextPulse(at6am);
    expect(delta).toBe(60 * 60 * 1000);
  });

  it('always returns a positive value', () => {
    for (let h = 0; h < 24; h++) {
      const t = new Date(`2026-06-09T${String(h).padStart(2, '0')}:00:00Z`);
      const delta = msUntilNextPulse(t);
      expect(delta).toBeGreaterThan(0);
      expect(delta).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    }
  });
});

describe('isWeekendInChicago', () => {
  it('returns true for a Saturday afternoon UTC', () => {
    // 2026-06-13 is a Saturday
    expect(isWeekendInChicago(new Date('2026-06-13T18:00:00Z'))).toBe(true);
  });

  it('returns true for a Sunday', () => {
    // 2026-06-14 is a Sunday
    expect(isWeekendInChicago(new Date('2026-06-14T15:00:00Z'))).toBe(true);
  });

  it('returns false for a Tuesday', () => {
    // 2026-06-09 is a Tuesday
    expect(isWeekendInChicago(new Date('2026-06-09T15:00:00Z'))).toBe(false);
  });

  it('handles weekday/weekend boundary across TZ correctly', () => {
    // 2026-06-15 00:30 UTC is Sunday night UTC, but Sunday evening Chicago (still weekend)
    expect(isWeekendInChicago(new Date('2026-06-15T00:30:00Z'))).toBe(true);
    // 2026-06-15 05:30 UTC is Monday 00:30 Chicago -- weekday
    expect(isWeekendInChicago(new Date('2026-06-15T05:30:00Z'))).toBe(false);
  });
});
