import { CampaignMetrics, getCampaignMetrics } from './campaignAnalyticsService';

export interface HealthScoreResult {
  score: number;
  status: 'healthy' | 'degraded' | 'critical';
  penalties: { reason: string; points: number }[];
}

/**
 * Compute campaign health score per Blueprint Section 12.
 * Start at 100, apply penalties, clamp 0-100.
 */
export function computeHealthScore(
  metrics: CampaignMetrics,
  errorCount: number = 0,
  aiGenerationSuccessRate: number = 100,
): HealthScoreResult {
  let score = 100;
  const penalties: { reason: string; points: number }[] = [];

  if (metrics.open_rate < 15 && metrics.sent > 0) {
    penalties.push({ reason: 'Open rate below 15%', points: 20 });
    score -= 20;
  }

  if (metrics.reply_rate < 2 && metrics.sent > 0) {
    penalties.push({ reason: 'Reply rate below 2%', points: 20 });
    score -= 20;
  }

  if (metrics.bounce_rate > 10) {
    penalties.push({ reason: 'Bounce rate above 10%', points: 30 });
    score -= 30;
  }

  if (errorCount > 0) {
    const errorPenalty = Math.min(errorCount * 10, 30);
    penalties.push({ reason: `${errorCount} errors (-10 each, max -30)`, points: errorPenalty });
    score -= errorPenalty;
  }

  if (aiGenerationSuccessRate < 80) {
    penalties.push({ reason: 'AI generation success below 80%', points: 15 });
    score -= 15;
  }

  score = Math.max(0, Math.min(100, score));

  let status: 'healthy' | 'degraded' | 'critical';
  if (score >= 80) status = 'healthy';
  else if (score >= 60) status = 'degraded';
  else status = 'critical';

  return { score, status, penalties };
}
