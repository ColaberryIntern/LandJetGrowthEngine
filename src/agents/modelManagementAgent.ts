import { Op } from 'sequelize';
import { generateMessage } from '../services/aiMessageService';
import { registerAgent, getAgent } from '../intelligence/agents/agentRegistry';
import { ScheduledEmail } from '../models/ScheduledEmail';
import { CampaignInsight } from '../models/CampaignInsight';
import { AiAgent } from '../models/AiAgent';
import { logger } from '../config/logger';

export interface ModelPerformanceInput {
  modelName: string;
  totalCalls: number;
  totalTokens: number;
  avgTokensPerCall: number;
  fallbackCount: number;
  successRate: number;
  insightConfidenceAvg: number;
}

export interface ModelAnalysis {
  model: string;
  health: 'healthy' | 'degraded' | 'critical';
  token_efficiency: 'good' | 'high' | 'excessive';
  recommendations: string[];
  priority_score: number;
}

/**
 * Rule-based fallback for model health analysis.
 */
function analyzeWithRules(input: ModelPerformanceInput): ModelAnalysis {
  const recommendations: string[] = [];
  let health: ModelAnalysis['health'] = 'healthy';
  let tokenEfficiency: ModelAnalysis['token_efficiency'] = 'good';
  let priority = 0;

  // Token efficiency
  if (input.avgTokensPerCall > 1500) {
    tokenEfficiency = 'excessive';
    recommendations.push('Average tokens per call exceeds 1500 — consider tightening prompts');
    priority += 30;
  } else if (input.avgTokensPerCall > 800) {
    tokenEfficiency = 'high';
    recommendations.push('Token usage is above average — review prompt length');
    priority += 15;
  }

  // Success rate
  if (input.successRate < 0.8) {
    health = 'critical';
    recommendations.push(`Success rate is ${Math.round(input.successRate * 100)}% — investigate API errors or prompt failures`);
    priority += 40;
  } else if (input.successRate < 0.95) {
    health = 'degraded';
    recommendations.push(`Success rate is ${Math.round(input.successRate * 100)}% — monitor for recurring failures`);
    priority += 20;
  }

  // Fallback usage
  if (input.fallbackCount > 0 && input.totalCalls > 0) {
    const fallbackRate = input.fallbackCount / input.totalCalls;
    if (fallbackRate > 0.2) {
      recommendations.push(`${Math.round(fallbackRate * 100)}% of calls used fallback — check API key and connectivity`);
      priority += 25;
    }
  }

  // Insight confidence
  if (input.insightConfidenceAvg < 0.3 && input.insightConfidenceAvg > 0) {
    recommendations.push('Low average insight confidence — more data needed or model prompts need refinement');
    priority += 15;
  }

  if (recommendations.length === 0) {
    recommendations.push('All metrics within normal range');
  }

  return {
    model: input.modelName,
    health,
    token_efficiency: tokenEfficiency,
    recommendations,
    priority_score: Math.min(priority, 100),
  };
}

/**
 * Analyze performance for a specific AI model.
 */
export async function analyzeModelPerformance(input: ModelPerformanceInput): Promise<ModelAnalysis> {
  const agent = await getAgent('model_management');
  if (agent && !agent.enabled) {
    return analyzeWithRules(input);
  }

  try {
    const result = await generateMessage({
      channel: 'email',
      ai_instructions: `Analyze this AI model's performance and return ONLY valid JSON:
{
  "model": "${input.modelName}",
  "health": "healthy" | "degraded" | "critical",
  "token_efficiency": "good" | "high" | "excessive",
  "recommendations": ["recommendation 1", "recommendation 2"],
  "priority_score": 0-100
}

Model Performance Data:
- Model: ${input.modelName}
- Total calls: ${input.totalCalls}
- Total tokens: ${input.totalTokens}
- Avg tokens/call: ${input.avgTokensPerCall}
- Fallback count: ${input.fallbackCount}
- Success rate: ${Math.round(input.successRate * 100)}%
- Avg insight confidence: ${Math.round(input.insightConfidenceAvg * 100)}%

Evaluate: Is this model performing well? Any cost concerns? Should we switch models or adjust prompts?`,
      lead: { name: 'model_analyzer' },
    });

    return JSON.parse(result.body) as ModelAnalysis;
  } catch (error) {
    logger.warn('Model analysis AI call failed, using rules', { model: input.modelName, error: (error as Error).message });
    return analyzeWithRules(input);
  }
}

/**
 * Run a full model management cycle — gather metrics and analyze all active models.
 */
export async function runModelManagementCycle(): Promise<{ modelsAnalyzed: number; recommendations: string[]; errors: number }> {
  const agent = await getAgent('model_management');
  if (agent && !agent.enabled) {
    logger.info('Model management agent disabled, skipping cycle');
    return { modelsAnalyzed: 0, recommendations: [], errors: 0 };
  }

  const allRecommendations: string[] = [];
  let modelsAnalyzed = 0;
  let errors = 0;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  try {
    // Gather token usage from scheduled_emails metadata
    const recentEmails = await ScheduledEmail.findAll({
      where: {
        ai_generated: true,
        created_at: { [Op.gte]: sevenDaysAgo },
      },
      attributes: ['metadata'],
      raw: true,
    }) as any[];

    // Aggregate by model
    const modelStats = new Map<string, { calls: number; tokens: number; fallbacks: number }>();

    for (const email of recentEmails) {
      const meta = email.metadata || {};
      const model = meta.ai_model || 'unknown';
      const tokens = meta.ai_tokens_used || 0;
      const isFallback = model === 'fallback';

      const stats = modelStats.get(model) || { calls: 0, tokens: 0, fallbacks: 0 };
      stats.calls++;
      stats.tokens += tokens;
      if (isFallback) stats.fallbacks++;
      modelStats.set(model, stats);
    }

    // Get insight confidence
    const insights = await CampaignInsight.findAll({
      where: { created_at: { [Op.gte]: sevenDaysAgo } },
      attributes: ['confidence'],
      raw: true,
    }) as any[];

    const avgConfidence = insights.length > 0
      ? insights.reduce((sum: number, i: any) => sum + (i.confidence || 0), 0) / insights.length
      : 0;

    // Analyze each model
    const totalCalls = recentEmails.length;
    const fallbackTotal = modelStats.get('fallback')?.calls || 0;

    for (const [modelName, stats] of modelStats) {
      if (modelName === 'fallback') continue; // Analyze real models only

      try {
        const analysis = await analyzeModelPerformance({
          modelName,
          totalCalls: stats.calls,
          totalTokens: stats.tokens,
          avgTokensPerCall: stats.calls > 0 ? Math.round(stats.tokens / stats.calls) : 0,
          fallbackCount: fallbackTotal,
          successRate: totalCalls > 0 ? (totalCalls - fallbackTotal) / totalCalls : 1,
          insightConfidenceAvg: avgConfidence,
        });

        modelsAnalyzed++;
        allRecommendations.push(...analysis.recommendations.map(r => `[${modelName}] ${r}`));

        logger.info('Model analyzed', { model: modelName, health: analysis.health, priority: analysis.priority_score });
      } catch (error) {
        errors++;
        logger.error('Model analysis failed', { model: modelName, error: (error as Error).message });
      }
    }

    // If no real models found, still report on fallback usage
    if (modelsAnalyzed === 0 && fallbackTotal > 0) {
      allRecommendations.push(`[system] All ${fallbackTotal} AI calls used fallback — no API key configured or API unreachable`);
    }

    if (modelsAnalyzed === 0 && totalCalls === 0) {
      allRecommendations.push('[system] No AI-generated emails in the last 7 days');
    }

  } catch (error) {
    errors++;
    logger.error('Model management cycle failed', { error: (error as Error).message });
  }

  logger.info('Model management cycle complete', { modelsAnalyzed, recommendations: allRecommendations.length, errors });
  return { modelsAnalyzed, recommendations: allRecommendations, errors };
}

/**
 * Register the model management agent.
 */
export async function registerModelManagementAgent(): Promise<AiAgent> {
  return registerAgent({
    name: 'model_management',
    type: 'model_lifecycle',
    department: 'intelligence',
    schedule: 'daily',
    config: { model: 'gpt-4o', max_tokens: 512 },
    enabled: true,
  });
}
