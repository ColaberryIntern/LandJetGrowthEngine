import { logger } from '../config/logger';
import { ValidationError } from '../middleware/errors';

export interface RampState {
  current_phase: number;
  phase_sizes: number[];
  leads_enrolled_per_phase: Record<string, number>;
  phase_started_at: string;
  phase_health_score: number;
  status: 'ramping' | 'holding' | 'paused' | 'complete';
  evaluation_history: { phase: number; health_score: number; decision: string; at: string }[];
}

export const RAMP_PROFILES: Record<string, { phases: number[]; advance_threshold: number; hold_threshold: number }> = {
  cold_outbound: { phases: [20, 80, 200, -1], advance_threshold: 70, hold_threshold: 50 },
  alumni: { phases: [15, 30, 75, 150, -1], advance_threshold: 65, hold_threshold: 50 },
  default: { phases: [20, 50, 150, -1], advance_threshold: 70, hold_threshold: 50 },
};

/**
 * Evaluate ramp phase advancement per Blueprint Section 11.
 */
export function evaluateRampPhase(
  rampState: RampState,
  campaignType: string,
): { decision: 'advance' | 'hold' | 'pause'; reason: string } {
  if (!rampState) throw new ValidationError('rampState is required');
  if (typeof rampState.phase_health_score !== 'number') throw new ValidationError('phase_health_score must be a number');
  if (!rampState.phase_started_at) throw new ValidationError('phase_started_at is required');

  const profile = RAMP_PROFILES[campaignType] || RAMP_PROFILES.default;
  const healthScore = rampState.phase_health_score;

  // Check minimum time at phase (12 hours)
  const phaseStarted = new Date(rampState.phase_started_at);
  if (isNaN(phaseStarted.getTime())) throw new ValidationError('phase_started_at must be a valid date');

  const hoursAtPhase = (Date.now() - phaseStarted.getTime()) / (60 * 60 * 1000);

  let result: { decision: 'advance' | 'hold' | 'pause'; reason: string };

  if (hoursAtPhase < 12) {
    result = { decision: 'hold', reason: `Only ${Math.round(hoursAtPhase)}h at current phase (min 12h)` };
  } else if (healthScore < profile.hold_threshold) {
    result = { decision: 'pause', reason: `Health score ${healthScore} below hold threshold ${profile.hold_threshold}` };
  } else if (healthScore >= profile.advance_threshold) {
    if (rampState.current_phase >= profile.phases.length - 1) {
      result = { decision: 'advance', reason: 'Advancing to final unlimited phase' };
    } else {
      result = { decision: 'advance', reason: `Health score ${healthScore} meets advance threshold ${profile.advance_threshold}` };
    }
  } else {
    result = { decision: 'hold', reason: `Health score ${healthScore} between hold (${profile.hold_threshold}) and advance (${profile.advance_threshold})` };
  }

  logger.info('Ramp phase evaluated', {
    phase: rampState.current_phase,
    healthScore,
    decision: result.decision,
    campaignType,
  });

  return result;
}

export function getPhaseLeadCount(rampState: RampState, campaignType: string): number {
  if (!rampState) return 0;
  const profile = RAMP_PROFILES[campaignType] || RAMP_PROFILES.default;
  const phase = rampState.current_phase;
  if (phase < 0 || phase >= profile.phases.length) return -1;
  return profile.phases[phase];
}
