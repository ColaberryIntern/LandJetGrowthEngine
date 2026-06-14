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
  state?: string;
  city?: string;
  // Per-user territory scope: list of 2-letter state codes. Empty or missing
  // = sees all states. Replaces the 3-value territory enum (2026-06-14 refactor)
  // so we can scale to N owners (Percy TX, Iowa owner, future owners by location)
  // without a schema change per state.
  states?: string[];
  search?: string;
  min_score?: number;
  max_score?: number;
  limit?: number;
  offset?: number;
}

const STATE_FULL_NAMES: Record<string, string> = {
  TX: 'texas', IA: 'iowa', OK: 'oklahoma', LA: 'louisiana', AR: 'arkansas',
  KS: 'kansas', NE: 'nebraska', MO: 'missouri', IL: 'illinois', WI: 'wisconsin',
  MN: 'minnesota', SD: 'south dakota', ND: 'north dakota', NM: 'new mexico',
};

/**
 * Build a Postgres iRegexp pattern that matches a state stored either as a
 * 2-letter code (TX) or as a full name (Texas), case-insensitively. Apollo
 * returns either format depending on the endpoint, and we store as-is.
 */
export function buildStatesPattern(states: string[]): string {
  const tokens: string[] = [];
  for (const code of states) {
    const upper = code.toUpperCase();
    tokens.push(upper);
    const full = STATE_FULL_NAMES[upper];
    if (full) tokens.push(full);
  }
  return `^(${tokens.join('|')})$`;
}

/** Type guard for incoming query-string states[] parameter. */
export function parseStatesParam(v: unknown): string[] | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (Array.isArray(v)) return v.filter((s): s is string => typeof s === 'string');
  if (typeof v === 'string') return v.split(',').map(s => s.trim()).filter(Boolean);
  return undefined;
}

const VALID_LEAD_SOURCES = ['upload', 'manual', 'import', 'api', 'referral', 'website', 'campaign', 'enrichment'];

export async function createLead(
  input: Omit<LeadCreationAttributes, 'lead_score' | 'temperature'>,
) {
  if (!input.email || !input.first_name || !input.last_name) {
    throw new ValidationError('email, first_name, and last_name are required');
  }

  if (input.lead_source && !VALID_LEAD_SOURCES.includes(input.lead_source)) {
    throw new ValidationError(`Invalid lead source: ${input.lead_source}. Valid: ${VALID_LEAD_SOURCES.join(', ')}`);
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
  if (filters.state) where.state = { [Op.iLike]: filters.state };
  if (filters.city) where.city = { [Op.iLike]: filters.city };

  // Per-user state scope (replaces the old territory enum). Empty array = no
  // scope applied (sees all). Non-empty = match any of the listed states.
  // Overrides explicit `state` filter when both are set because the user
  // default is more specific.
  if (filters.states && filters.states.length > 0) {
    where.state = { [Op.iRegexp]: buildStatesPattern(filters.states) };
  }

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

  // Allow forward progression only (no skipping more than 1 step).
  // Exception: 'replied' may be skipped (not every meeting comes through a
  // tracked inbound reply -- e.g., a prospect calls or books on the website).
  // So `contacted -> meeting_scheduled` is allowed even though replied is in between.
  const skippingOnlyReplied = current === 'contacted' && next === 'meeting_scheduled';
  if (nextOrder > currentOrder + 1 && !skippingOnlyReplied) {
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
