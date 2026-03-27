import { Op } from 'sequelize';
import { CampaignInsight } from '../models/CampaignInsight';

/**
 * Calculate insight confidence per Blueprint Section 13.
 * confidence = min(total_sends / 50, 1.0)
 */
export function calculateConfidence(totalSends: number): number {
  return Math.min(totalSends / 50, 1.0);
}

/**
 * Get applicable insights for AI prompt injection.
 */
export async function getInsightsForPrompt(params: {
  campaign_type?: string;
  channel?: string;
  min_confidence?: number;
  limit?: number;
}): Promise<string[]> {
  const where: any = {};
  if (params.min_confidence) {
    where.confidence = { [Op.gte]: params.min_confidence };
  }

  const insights = await CampaignInsight.findAll({
    where,
    order: [['confidence', 'DESC'], ['times_applied', 'DESC']],
    limit: params.limit || 5,
  });

  // Increment times_applied
  for (const insight of insights) {
    await insight.update({
      times_applied: insight.times_applied + 1,
      last_applied_at: new Date(),
    });
  }

  return insights.map((i) => i.insight);
}

/**
 * Create a campaign insight from harvested data.
 */
export async function createInsight(params: {
  campaign_id?: string;
  insight_type: string;
  category: string;
  insight: string;
  evidence?: object;
  confidence: number;
}): Promise<void> {
  await CampaignInsight.create({
    campaign_id: params.campaign_id || null,
    insight_type: params.insight_type as any,
    category: params.category,
    insight: params.insight,
    evidence: params.evidence || null,
    confidence: params.confidence,
    applicable_to: null,
    times_applied: 0,
    last_applied_at: null,
  });
}
