import { Op } from 'sequelize';
import { AcquisitionStrategy, CHANNEL_TYPES, STRATEGY_STATUSES } from '../models/AcquisitionStrategy';
import { ValidationError, NotFoundError } from '../middleware/errors';
import { logger } from '../config/logger';

export interface StrategyFilters {
  status?: string;
  channel?: string;
  limit?: number;
  offset?: number;
}

export async function createStrategy(input: {
  name: string; description?: string; channel: string;
  target_audience?: string; goals?: string; budget?: number;
  owner_id?: string; start_date?: string; end_date?: string;
}) {
  if (!input.name?.trim()) throw new ValidationError('name is required');
  if (!CHANNEL_TYPES.includes(input.channel as any)) {
    throw new ValidationError(`Invalid channel. Valid: ${CHANNEL_TYPES.join(', ')}`);
  }

  const strategy = await AcquisitionStrategy.create({
    name: input.name.trim(),
    description: input.description || null,
    channel: input.channel as any,
    status: 'draft',
    target_audience: input.target_audience || null,
    goals: input.goals || null,
    budget: input.budget || null,
    owner_id: input.owner_id || null,
    start_date: input.start_date ? new Date(input.start_date) : null,
    end_date: input.end_date ? new Date(input.end_date) : null,
    metrics: null,
  });

  logger.info('Acquisition strategy created', { id: strategy.id, channel: input.channel });
  return strategy;
}

export async function getStrategyById(id: string) {
  const s = await AcquisitionStrategy.findByPk(id);
  if (!s) throw new NotFoundError('Strategy not found');
  return s;
}

export async function listStrategies(filters: StrategyFilters) {
  const where: Record<string, unknown> = {};
  if (filters.status) where.status = filters.status;
  if (filters.channel) where.channel = filters.channel;

  return AcquisitionStrategy.findAndCountAll({
    where, order: [['created_at', 'DESC']],
    limit: filters.limit || 25, offset: filters.offset || 0,
  });
}

export async function updateStrategy(id: string, updates: Partial<{
  name: string; description: string; status: string; channel: string;
  target_audience: string; goals: string; budget: number;
  leads_generated: number; conversions: number; metrics: object;
}>) {
  const s = await AcquisitionStrategy.findByPk(id);
  if (!s) throw new NotFoundError('Strategy not found');

  // Auto-calculate conversion rate
  const data: any = { ...updates };
  const leads = updates.leads_generated ?? s.leads_generated;
  const convs = updates.conversions ?? s.conversions;
  if (leads > 0) data.conversion_rate = Math.round((convs / leads) * 10000) / 100;

  await s.update(data);
  return s;
}

export async function getStrategyStats() {
  const [total, active, totalLeads, totalConversions] = await Promise.all([
    AcquisitionStrategy.count(),
    AcquisitionStrategy.count({ where: { status: 'active' } }),
    AcquisitionStrategy.sum('leads_generated'),
    AcquisitionStrategy.sum('conversions'),
  ]);

  return {
    total, active,
    total_leads: totalLeads || 0,
    total_conversions: totalConversions || 0,
    avg_conversion_rate: totalLeads > 0 ? Math.round(((totalConversions || 0) / totalLeads) * 10000) / 100 : 0,
  };
}
