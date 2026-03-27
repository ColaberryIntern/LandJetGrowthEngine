import { validateSequenceSteps } from '../../services/sequenceService';
import { SequenceStep } from '../../models/FollowUpSequence';

function makeStep(overrides: Partial<SequenceStep> = {}): SequenceStep {
  return {
    delay_days: 0,
    channel: 'email',
    subject: 'Test',
    body_template: 'body',
    ai_instructions: 'Generate a test message',
    ai_tone: 'professional',
    max_attempts: 1,
    ...overrides,
  };
}

describe('Sequence Step Validation', () => {
  it('should accept a valid single-step sequence', () => {
    const result = validateSequenceSteps([makeStep()]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept a valid multi-step sequence', () => {
    const steps = [
      makeStep({ delay_days: 0 }),
      makeStep({ delay_days: 2 }),
      makeStep({ delay_days: 5, channel: 'voice' }),
      makeStep({ delay_days: 8 }),
    ];
    const result = validateSequenceSteps(steps);
    expect(result.valid).toBe(true);
  });

  it('should reject empty sequence', () => {
    const result = validateSequenceSteps([]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('at least 1 step');
  });

  it('should reject more than 12 steps', () => {
    const steps = Array.from({ length: 13 }, (_, i) => makeStep({ delay_days: i * 3 }));
    const result = validateSequenceSteps(steps);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('12 steps'))).toBe(true);
  });

  it('should reject duration exceeding 45 days', () => {
    const steps = [makeStep({ delay_days: 0 }), makeStep({ delay_days: 46 })];
    const result = validateSequenceSteps(steps);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('45 days'))).toBe(true);
  });

  it('should reject gaps less than 2 days between email steps', () => {
    const steps = [
      makeStep({ delay_days: 0, channel: 'email' }),
      makeStep({ delay_days: 1, channel: 'email' }),
    ];
    const result = validateSequenceSteps(steps);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Insufficient gap'))).toBe(true);
  });

  it('should accept exactly 2-day gap between email steps', () => {
    const steps = [
      makeStep({ delay_days: 0, channel: 'email' }),
      makeStep({ delay_days: 2, channel: 'email' }),
    ];
    const result = validateSequenceSteps(steps);
    expect(result.valid).toBe(true);
  });

  it('should reject gaps less than 3 days for voice steps', () => {
    const steps = [
      makeStep({ delay_days: 0, channel: 'email' }),
      makeStep({ delay_days: 2, channel: 'voice' }),
    ];
    const result = validateSequenceSteps(steps);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Insufficient gap'))).toBe(true);
  });

  it('should accept 3-day gap for voice steps', () => {
    const steps = [
      makeStep({ delay_days: 0, channel: 'email' }),
      makeStep({ delay_days: 3, channel: 'voice' }),
    ];
    const result = validateSequenceSteps(steps);
    expect(result.valid).toBe(true);
  });

  it('should reject duplicate channels on same day', () => {
    const steps = [
      makeStep({ delay_days: 0, channel: 'email' }),
      makeStep({ delay_days: 0, channel: 'email' }),
    ];
    const result = validateSequenceSteps(steps);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Duplicate channel'))).toBe(true);
  });

  it('should allow email + SMS on same day', () => {
    const steps = [
      makeStep({ delay_days: 0, channel: 'email' }),
      makeStep({ delay_days: 0, channel: 'sms' }),
    ];
    const result = validateSequenceSteps(steps);
    expect(result.valid).toBe(true);
  });

  it('should reject voice sharing a day with another channel', () => {
    const steps = [
      makeStep({ delay_days: 0, channel: 'email' }),
      makeStep({ delay_days: 0, channel: 'voice' }),
    ];
    const result = validateSequenceSteps(steps);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Voice cannot share'))).toBe(true);
  });

  it('should reject step with no ai_instructions and no body_template', () => {
    const steps = [makeStep({ ai_instructions: '', body_template: '' })];
    const result = validateSequenceSteps(steps);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('ai_instructions or body_template'))).toBe(true);
  });

  it('should reject negative delay_days', () => {
    const steps = [makeStep({ delay_days: -1 })];
    const result = validateSequenceSteps(steps);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('negative'))).toBe(true);
  });

  it('should validate all pre-built templates pass validation', () => {
    const { COLD_OUTBOUND_TEMPLATE, STRATEGY_CALL_READINESS_TEMPLATE, PAYMENT_READINESS_TEMPLATE } =
      require('../../services/campaignBuilderService');

    expect(validateSequenceSteps(COLD_OUTBOUND_TEMPLATE.steps).valid).toBe(true);
    expect(validateSequenceSteps(STRATEGY_CALL_READINESS_TEMPLATE.steps).valid).toBe(true);
    expect(validateSequenceSteps(PAYMENT_READINESS_TEMPLATE.steps).valid).toBe(true);
  });
});
