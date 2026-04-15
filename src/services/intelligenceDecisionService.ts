import { Op } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';
import { IntelligenceDecision, RECOMMENDED_ACTIONS, EXECUTION_STATUSES, RISK_TIERS } from '../models/IntelligenceDecision';
import { ValidationError, NotFoundError } from '../middleware/errors';
import { logger } from '../config/logger';

export interface DecisionFilters {
  execution_status?: string;
  risk_tier?: string;
  recommended_action?: string;
  limit?: number;
  offset?: number;
}

export async function createDecision(input: {
  problem_detected: string;
  analysis_summary: string;
  recommended_action: string;
  action_details?: object;
  risk_score: number;
  confidence_score: number;
  risk_tier: string;
  reasoning?: string;
  before_state?: object;
}): Promise<IntelligenceDecision> {
  if (!input.problem_detected?.trim()) throw new ValidationError('problem_detected is required');
  if (!input.analysis_summary?.trim()) throw new ValidationError('analysis_summary is required');
  if (!RECOMMENDED_ACTIONS.includes(input.recommended_action as any)) {
    throw new ValidationError(`Invalid recommended_action. Valid: ${RECOMMENDED_ACTIONS.join(', ')}`);
  }
  if (!RISK_TIERS.includes(input.risk_tier as any)) {
    throw new ValidationError(`Invalid risk_tier. Valid: ${RISK_TIERS.join(', ')}`);
  }
  if (input.risk_score < 0 || input.risk_score > 100) {
    throw new ValidationError('risk_score must be between 0 and 100');
  }
  if (input.confidence_score < 0 || input.confidence_score > 100) {
    throw new ValidationError('confidence_score must be between 0 and 100');
  }

  const decision = await IntelligenceDecision.create({
    decision_id: uuidv4(),
    trace_id: uuidv4(),
    problem_detected: input.problem_detected.trim(),
    analysis_summary: input.analysis_summary.trim(),
    recommended_action: input.recommended_action as any,
    action_details: input.action_details || null,
    risk_score: input.risk_score,
    confidence_score: input.confidence_score,
    risk_tier: input.risk_tier as any,
    execution_status: 'proposed',
    reasoning: input.reasoning?.trim() || null,
    before_state: input.before_state || null,
    observation_count: 1,
  });

  logger.info('Intelligence decision created', { decisionId: decision.decision_id, action: decision.recommended_action });
  return decision;
}

export async function getDecisionById(id: string): Promise<IntelligenceDecision> {
  const decision = await IntelligenceDecision.findByPk(id);
  if (!decision) throw new NotFoundError('Decision not found');
  return decision;
}

export async function listDecisions(filters: DecisionFilters) {
  const where: Record<string, unknown> = {};
  if (filters.execution_status) where.execution_status = filters.execution_status;
  if (filters.risk_tier) where.risk_tier = filters.risk_tier;
  if (filters.recommended_action) where.recommended_action = filters.recommended_action;

  return IntelligenceDecision.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit: filters.limit || 25,
    offset: filters.offset || 0,
  });
}

export async function updateDecisionStatus(
  id: string,
  status: string,
  data?: { executed_by?: string; after_state?: object; reasoning?: string },
): Promise<IntelligenceDecision> {
  const decision = await IntelligenceDecision.findByPk(id);
  if (!decision) throw new NotFoundError('Decision not found');

  if (!EXECUTION_STATUSES.includes(status as any)) {
    throw new ValidationError(`Invalid status. Valid: ${EXECUTION_STATUSES.join(', ')}`);
  }

  const updates: any = { execution_status: status };
  if (status === 'executed' || status === 'failed' || status === 'rolled_back') {
    updates.executed_at = new Date();
  }
  if (data?.executed_by) updates.executed_by = data.executed_by;
  if (data?.after_state) updates.after_state = data.after_state;
  if (data?.reasoning) updates.reasoning = data.reasoning;

  await decision.update(updates);
  logger.info('Decision status updated', { decisionId: id, status });
  return decision;
}

export async function getDecisionStats() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [total, proposed, approved, executed, rejected, failed] = await Promise.all([
    IntelligenceDecision.count(),
    IntelligenceDecision.count({ where: { execution_status: 'proposed' } }),
    IntelligenceDecision.count({ where: { execution_status: 'approved' } }),
    IntelligenceDecision.count({ where: { execution_status: 'executed' } }),
    IntelligenceDecision.count({ where: { execution_status: 'rejected' } }),
    IntelligenceDecision.count({ where: { execution_status: 'failed' } }),
  ]);

  const byRiskTier = await IntelligenceDecision.findAll({
    attributes: ['risk_tier', [IntelligenceDecision.sequelize!.fn('COUNT', '*'), 'count']],
    group: ['risk_tier'],
    raw: true,
  }) as any[];

  const riskTierCounts: Record<string, number> = {};
  for (const r of byRiskTier) riskTierCounts[r.risk_tier] = parseInt(r.count, 10);

  const avgConfidence = await IntelligenceDecision.findOne({
    attributes: [[IntelligenceDecision.sequelize!.fn('AVG', IntelligenceDecision.sequelize!.col('confidence_score')), 'avg']],
    raw: true,
  }) as any;

  return {
    total,
    proposed,
    approved,
    executed,
    rejected,
    failed,
    by_risk_tier: riskTierCounts,
    avg_confidence: Math.round(avgConfidence?.avg || 0),
  };
}
