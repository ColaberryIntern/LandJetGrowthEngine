import { Op } from 'sequelize';
import { Lead, LeadCreationAttributes, PIPELINE_ORDER, PipelineStage } from '../models/Lead';
import { calculateLeadScore, getLeadTemperature } from './leadScoringService';
import { ValidationError, NotFoundError } from '../middleware/errors';

export interface LeadFilters {
  status?: string;
  pipeline_stage?: string;
  temperature?: string;
  industry?: string;
  lead_source_type?: string;
  search?: string;
  min_score?: number;
  max_score?: number;
  limit?: number;
  offset?: number;
}

export async function createLead(
  input: Omit<LeadCreationAttributes, 'lead_score' | 'temperature'>,
) {
  if (!input.email || !input.first_name || !input.last_name) {
    throw new ValidationError('email, first_name, and last_name are required');
  }

  const scoreBreakdown = calculateLeadScore(input);
  const temperature = getLeadTemperature(scoreBreakdown.total);

  const lead = await Lead.create({
    ...input,
    lead_score: scoreBreakdown.total,
    temperature,
  });

  return { lead, scoreBreakdown };
}

export async function getLeadById(id: number) {
  const lead = await Lead.findByPk(id);
  if (!lead) throw new NotFoundError('Lead not found');
  return lead;
}

export async function updateLead(id: number, updates: Partial<LeadCreationAttributes>) {
  const lead = await Lead.findByPk(id);
  if (!lead) throw new NotFoundError('Lead not found');

  // Validate pipeline stage transition if changing
  if (updates.pipeline_stage && updates.pipeline_stage !== lead.pipeline_stage) {
    validatePipelineTransition(lead.pipeline_stage, updates.pipeline_stage);
  }

  // Re-score if scoring-relevant fields changed
  const scoringFields = ['email', 'title', 'phone', 'company_size', 'utm_source', 'lifecycle_stage'];
  const needsRescore = scoringFields.some((f) => f in updates);

  if (needsRescore) {
    const merged = { ...lead.toJSON(), ...updates };
    const scoreBreakdown = calculateLeadScore(merged);
    updates.lead_score = scoreBreakdown.total;
    (updates as any).temperature = getLeadTemperature(scoreBreakdown.total);
  }

  await lead.update(updates);
  return lead;
}

export async function listLeads(filters: LeadFilters) {
  const where: Record<string, unknown> = {};

  if (filters.status) where.status = filters.status;
  if (filters.pipeline_stage) where.pipeline_stage = filters.pipeline_stage;
  if (filters.temperature) where.temperature = filters.temperature;
  if (filters.industry) where.industry = filters.industry;
  if (filters.lead_source_type) where.lead_source_type = filters.lead_source_type;

  if (filters.min_score !== undefined || filters.max_score !== undefined) {
    where.lead_score = {};
    if (filters.min_score !== undefined) (where.lead_score as any)[Op.gte] = filters.min_score;
    if (filters.max_score !== undefined) (where.lead_score as any)[Op.lte] = filters.max_score;
  }

  if (filters.search) {
    where[Op.or as any] = [
      { first_name: { [Op.iLike]: `%${filters.search}%` } },
      { last_name: { [Op.iLike]: `%${filters.search}%` } },
      { email: { [Op.iLike]: `%${filters.search}%` } },
      { company: { [Op.iLike]: `%${filters.search}%` } },
    ];
  }

  return Lead.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit: filters.limit || 25,
    offset: filters.offset || 0,
  });
}

export function validatePipelineTransition(current: PipelineStage, next: PipelineStage) {
  // Allow 'lost' from any stage
  if (next === 'lost') return;

  const currentOrder = PIPELINE_ORDER[current];
  const nextOrder = PIPELINE_ORDER[next];

  if (nextOrder === undefined) {
    throw new ValidationError(`Invalid pipeline stage: ${next}`);
  }

  // Allow forward progression only (no skipping more than 1 step)
  if (nextOrder > currentOrder + 1) {
    throw new ValidationError(
      `Cannot skip from '${current}' to '${next}'. Next valid stage is '${
        Object.entries(PIPELINE_ORDER).find(([, v]) => v === currentOrder + 1)?.[0]
      }'`,
    );
  }

  // No backward movement
  if (nextOrder < currentOrder) {
    throw new ValidationError(`Cannot move backward from '${current}' to '${next}'`);
  }
}
