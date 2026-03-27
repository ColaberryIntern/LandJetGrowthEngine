import { logger } from '../config/logger';

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
  const profile = RAMP_PROFILES[campaignType] || RAMP_PROFILES.default;
  const healthScore = rampState.phase_health_score;

  // Check minimum time at phase (12 hours)
  const phaseStarted = new Date(rampState.phase_started_at);
  const hoursAtPhase = (Date.now() - phaseStarted.getTime()) / (60 * 60 * 1000);

  if (hoursAtPhase < 12) {
    return { decision: 'hold', reason: `Only ${Math.round(hoursAtPhase)}h at current phase (min 12h)` };
  }

  if (healthScore < profile.hold_threshold) {
    return { decision: 'pause', reason: `Health score ${healthScore} below hold threshold ${profile.hold_threshold}` };
  }

  if (healthScore >= profile.advance_threshold) {
    // Check if at last phase
    if (rampState.current_phase >= profile.phases.length - 1) {
      return { decision: 'advance', reason: 'Advancing to final unlimited phase' };
    }
    return { decision: 'advance', reason: `Health score ${healthScore} meets advance threshold ${profile.advance_threshold}` };
  }

  return { decision: 'hold', reason: `Health score ${healthScore} between hold (${profile.hold_threshold}) and advance (${profile.advance_threshold})` };
}

export function getPhaseLeadCount(rampState: RampState, campaignType: string): number {
  const profile = RAMP_PROFILES[campaignType] || RAMP_PROFILES.default;
  const phase = rampState.current_phase;
  if (phase >= profile.phases.length) return -1;
  return profile.phases[phase];
}
