import { Op } from 'sequelize';
import { CampaignError, ERROR_SEVERITIES } from '../models/CampaignError';
import { ValidationError, NotFoundError } from '../middleware/errors';
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
  if (filters.severity) {
    if (!ERROR_SEVERITIES.includes(filters.severity as any)) {
      throw new ValidationError(`Invalid severity filter: ${filters.severity}. Valid: ${ERROR_SEVERITIES.join(', ')}`);
    }
    where.severity = filters.severity;
  }
  if (filters.component) where.component = filters.component;
  if (filters.resolved === 'true') where.resolved = true;
  if (filters.resolved === 'false') where.resolved = false;

  const limit = Math.min(Math.max(filters.limit || 25, 1), 100);
  const offset = Math.max(filters.offset || 0, 0);

  try {
    return await CampaignError.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });
  } catch (error) {
    logger.error('Failed to list errors', { filters, error: (error as Error).message });
    throw error;
  }
}

export async function getErrorById(id: string) {
  if (!id) throw new ValidationError('Error ID is required');

  const error = await CampaignError.findByPk(id);
  if (!error) throw new NotFoundError('Error record not found');
  return error;
}

export async function resolveError(id: string, userId: string) {
  if (!id) throw new ValidationError('Error ID is required');
  if (!userId) throw new ValidationError('User ID is required');

  const error = await CampaignError.findByPk(id);
  if (!error) throw new NotFoundError('Error record not found');

  if (error.resolved) {
    logger.info('Error already resolved', { errorId: id });
    return error;
  }

  try {
    await error.update({
      resolved: true,
      resolved_at: new Date(),
      resolved_by: userId,
    });

    logger.info('Error resolved', { errorId: id, by: userId, severity: error.severity, component: error.component });
    return error;
  } catch (err) {
    logger.error('Failed to resolve error', { errorId: id, error: (err as Error).message });
    throw err;
  }
}

export async function getErrorStats() {
  try {
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
  } catch (error) {
    logger.error('Failed to get error stats', { error: (error as Error).message });
    throw error;
  }
}
