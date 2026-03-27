describe('Lead Progression Logic', () => {
  const OUTREACH_STEPS = ['1st_outreach', '2nd_outreach', 'last_email'] as const;
  const DEFAULT_FOLLOW_UP_DAYS = 4;

  it('should advance from step 0 to step 1 as 2nd_outreach', () => {
    const newStep = 0 + 1;
    const outreachStep = newStep < OUTREACH_STEPS.length ? OUTREACH_STEPS[newStep] : 'last_email';
    expect(outreachStep).toBe('2nd_outreach');
  });

  it('should advance from step 1 to step 2 as last_email', () => {
    const newStep = 1 + 1;
    const outreachStep = newStep < OUTREACH_STEPS.length ? OUTREACH_STEPS[newStep] : 'last_email';
    expect(outreachStep).toBe('last_email');
  });

  it('should mark completed when past total steps', () => {
    const totalSteps = 3;
    const completedStep = 2;
    const newStep = completedStep + 1;
    expect(newStep >= totalSteps).toBe(true);
  });

  it('should default to 4 days follow-up when step has no delay', () => {
    const stepDelayDays: number | null = null;
    const delayDays = stepDelayDays || DEFAULT_FOLLOW_UP_DAYS;
    expect(delayDays).toBe(4);
  });

  it('should use step delay_days when provided', () => {
    const stepDelayDays: number | null = 7;
    const delayDays = stepDelayDays || DEFAULT_FOLLOW_UP_DAYS;
    expect(delayDays).toBe(7);
  });

  it('should calculate correct next action date', () => {
    const now = new Date('2026-04-01T10:00:00Z');
    const delayDays = 4;
    const nextAction = new Date(now.getTime() + delayDays * 24 * 60 * 60 * 1000);
    expect(nextAction.toISOString()).toBe('2026-04-05T10:00:00.000Z');
  });

  it('should map outreach steps correctly for 3-step sequence', () => {
    expect(OUTREACH_STEPS[0]).toBe('1st_outreach');
    expect(OUTREACH_STEPS[1]).toBe('2nd_outreach');
    expect(OUTREACH_STEPS[2]).toBe('last_email');
  });
});
