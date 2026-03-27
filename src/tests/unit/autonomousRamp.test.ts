import { evaluateRampPhase, RampState, RAMP_PROFILES } from '../../services/autonomousRampService';
import { calculateConfidence } from '../../services/campaignKnowledgeService';

function makeRampState(overrides: Partial<RampState> = {}): RampState {
  return {
    current_phase: 0,
    phase_sizes: [20, 80, 200, -1],
    leads_enrolled_per_phase: { '0': 20 },
    phase_started_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 24h ago
    phase_health_score: 85,
    status: 'ramping',
    evaluation_history: [],
    ...overrides,
  };
}

describe('Autonomous Ramp Service', () => {
  it('should advance when health meets threshold and 12h elapsed', () => {
    const result = evaluateRampPhase(makeRampState({ phase_health_score: 75 }), 'cold_outbound');
    expect(result.decision).toBe('advance');
  });

  it('should hold when under 12 hours at phase', () => {
    const result = evaluateRampPhase(
      makeRampState({ phase_started_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString() }),
      'cold_outbound',
    );
    expect(result.decision).toBe('hold');
    expect(result.reason).toContain('min 12h');
  });

  it('should hold when health between hold and advance thresholds', () => {
    const result = evaluateRampPhase(makeRampState({ phase_health_score: 60 }), 'cold_outbound');
    expect(result.decision).toBe('hold');
  });

  it('should pause when health below hold threshold', () => {
    const result = evaluateRampPhase(makeRampState({ phase_health_score: 40 }), 'cold_outbound');
    expect(result.decision).toBe('pause');
  });

  it('should use alumni profile for alumni campaigns', () => {
    const result = evaluateRampPhase(makeRampState({ phase_health_score: 67 }), 'alumni');
    // Alumni advance threshold is 65, so this should advance
    expect(result.decision).toBe('advance');
  });

  it('should use default profile for unknown campaign types', () => {
    const result = evaluateRampPhase(makeRampState({ phase_health_score: 75 }), 'unknown_type');
    expect(result.decision).toBe('advance');
  });

  it('should have correct ramp profiles', () => {
    expect(RAMP_PROFILES.cold_outbound.phases).toEqual([20, 80, 200, -1]);
    expect(RAMP_PROFILES.alumni.phases).toEqual([15, 30, 75, 150, -1]);
  });
});

describe('Campaign Knowledge - Confidence', () => {
  it('should return 0.1 for 5 sends', () => {
    expect(calculateConfidence(5)).toBe(0.1);
  });

  it('should return 0.5 for 25 sends', () => {
    expect(calculateConfidence(25)).toBe(0.5);
  });

  it('should return 1.0 for 50+ sends', () => {
    expect(calculateConfidence(50)).toBe(1.0);
    expect(calculateConfidence(100)).toBe(1.0);
  });

  it('should return 0 for 0 sends', () => {
    expect(calculateConfidence(0)).toBe(0);
  });
});
