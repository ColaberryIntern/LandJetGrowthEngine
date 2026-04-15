import { Op } from 'sequelize';
import { CampaignInsight } from '../models/CampaignInsight';
import { ValidationError } from '../middleware/errors';
import { logger } from '../config/logger';

/**
 * Calculate insight confidence per Blueprint Section 13.
 * confidence = min(total_sends / 50, 1.0)
 */
export function calculateConfidence(totalSends: number): number {
  if (typeof totalSends !== 'number' || totalSends < 0) return 0;
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
  try {
    const where: any = {};
    if (params.min_confidence != null) {
      if (params.min_confidence < 0 || params.min_confidence > 1) {
        throw new ValidationError('min_confidence must be between 0 and 1');
      }
      where.confidence = { [Op.gte]: params.min_confidence };
    }

    const limit = Math.min(Math.max(params.limit || 5, 1), 50);

    const insights = await CampaignInsight.findAll({
      where,
      order: [['confidence', 'DESC'], ['times_applied', 'DESC']],
      limit,
    });

    // Increment times_applied
    for (const insight of insights) {
      try {
        await insight.update({
          times_applied: insight.times_applied + 1,
          last_applied_at: new Date(),
        });
      } catch (updateError) {
        logger.error('Failed to update insight times_applied', { insightId: insight.id, error: (updateError as Error).message });
      }
    }

    return insights.map((i) => i.insight);
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    logger.error('Failed to get insights for prompt', { params, error: (error as Error).message });
    throw error;
  }
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
  if (!params.insight?.trim()) throw new ValidationError('insight text is required');
  if (!params.insight_type?.trim()) throw new ValidationError('insight_type is required');
  if (!params.category?.trim()) throw new ValidationError('category is required');
  if (typeof params.confidence !== 'number' || params.confidence < 0 || params.confidence > 1) {
    throw new ValidationError('confidence must be a number between 0 and 1');
  }

  try {
    await CampaignInsight.create({
      campaign_id: params.campaign_id || null,
      insight_type: params.insight_type as any,
      category: params.category,
      insight: params.insight.trim(),
      evidence: params.evidence || null,
      confidence: params.confidence,
      applicable_to: null,
      times_applied: 0,
      last_applied_at: null,
    });
    logger.info('Campaign insight created', { type: params.insight_type, category: params.category, confidence: params.confidence });
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    logger.error('Failed to create campaign insight', { type: params.insight_type, error: (error as Error).message });
    throw error;
  }
}
