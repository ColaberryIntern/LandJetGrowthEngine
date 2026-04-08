import { Op } from 'sequelize';
import { CampaignError } from '../models/CampaignError';
import { logger } from '../config/logger';

export interface ErrorFilters {
  campaign_id?: string;
  severity?: string;
  component?: string;
  resolved?: string;
  limit?: number;
  offset?: number;
}

export async function listErrors(filters: ErrorFilters) {
  const where: Record<string, unknown> = {};

  if (filters.campaign_id) where.campaign_id = filters.campaign_id;
  if (filters.severity) where.severity = filters.severity;
  if (filters.component) where.component = filters.component;
  if (filters.resolved === 'true') where.resolved = true;
  if (filters.resolved === 'false') where.resolved = false;

  return CampaignError.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit: filters.limit || 25,
    offset: filters.offset || 0,
  });
}

export async function getErrorById(id: string) {
  const error = await CampaignError.findByPk(id);
  if (!error) throw new Error('Error record not found');
  return error;
}

export async function resolveError(id: string, userId: string) {
  const error = await CampaignError.findByPk(id);
  if (!error) throw new Error('Error record not found');

  await error.update({
    resolved: true,
    resolved_at: new Date(),
    resolved_by: userId,
  });

  logger.info('Error resolved', { errorId: id, by: userId });
  return error;
}

export async function getErrorStats() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [total, unresolved, todayCount, bySeverity, byComponent] = await Promise.all([
    CampaignError.count(),
    CampaignError.count({ where: { resolved: false } }),
    CampaignError.count({ where: { created_at: { [Op.gte]: todayStart } } }),
    CampaignError.findAll({
      attributes: ['severity', [CampaignError.sequelize!.fn('COUNT', '*'), 'count']],
      where: { resolved: false },
      group: ['severity'],
      raw: true,
    }),
    CampaignError.findAll({
      attributes: ['component', [CampaignError.sequelize!.fn('COUNT', '*'), 'count']],
      where: { resolved: false },
      group: ['component'],
      raw: true,
    }),
  ]);

  const severityCounts: Record<string, number> = {};
  for (const r of bySeverity as any[]) severityCounts[r.severity] = parseInt(r.count, 10);

  const componentCounts: Record<string, number> = {};
  for (const r of byComponent as any[]) componentCounts[r.component] = parseInt(r.count, 10);

  return { total, unresolved, today: todayCount, bySeverity: severityCounts, byComponent: componentCounts };
}
