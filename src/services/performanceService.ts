import { Op } from 'sequelize';
import { PerformanceMetric, METRIC_CATEGORIES } from '../models/PerformanceMetric';
import { ValidationError } from '../middleware/errors';
import { logger } from '../config/logger';

const VALID_STATUSES = ['normal', 'warning', 'critical'] as const;

export async function recordMetric(input: {
  category: string; metric_name: string; value: number; unit: string;
  threshold_warning?: number; threshold_critical?: number; context?: object;
}) {
  if (!input.metric_name?.trim()) throw new ValidationError('metric_name is required');
  if (!input.unit?.trim()) throw new ValidationError('unit is required');
  if (typeof input.value !== 'number') throw new ValidationError('value must be a number');
  if (!METRIC_CATEGORIES.includes(input.category as any)) {
    throw new ValidationError(`Invalid category: ${input.category}. Valid: ${METRIC_CATEGORIES.join(', ')}`);
  }

  let status: 'normal' | 'warning' | 'critical' = 'normal';
  if (input.threshold_critical != null && input.value >= input.threshold_critical) status = 'critical';
  else if (input.threshold_warning != null && input.value >= input.threshold_warning) status = 'warning';

  try {
    const metric = await PerformanceMetric.create({
      category: input.category as any, metric_name: input.metric_name.trim(),
      value: input.value, unit: input.unit.trim(), status,
      threshold_warning: input.threshold_warning ?? null,
      threshold_critical: input.threshold_critical ?? null,
      context: input.context || null, recorded_at: new Date(),
    });
    if (status !== 'normal') {
      logger.warn('Performance metric threshold breached', { category: input.category, metric: input.metric_name, value: input.value, status });
    }
    return metric;
  } catch (error) {
    logger.error('Failed to record performance metric', { category: input.category, metric: input.metric_name, error: (error as Error).message });
    throw error;
  }
}

export async function listMetrics(filters: {
  category?: string; status?: string; metric_name?: string;
  from?: string; limit?: number; offset?: number;
}) {
  const where: Record<string, unknown> = {};

  if (filters.category) {
    if (!METRIC_CATEGORIES.includes(filters.category as any)) {
      throw new ValidationError(`Invalid category filter: ${filters.category}`);
    }
    where.category = filters.category;
  }
  if (filters.status) {
    if (!VALID_STATUSES.includes(filters.status as any)) {
      throw new ValidationError(`Invalid status filter: ${filters.status}. Valid: ${VALID_STATUSES.join(', ')}`);
    }
    where.status = filters.status;
  }
  if (filters.metric_name) where.metric_name = filters.metric_name;
  if (filters.from) where.recorded_at = { [Op.gte]: new Date(filters.from) };

  const limit = Math.min(Math.max(filters.limit || 50, 1), 100);
  const offset = Math.max(filters.offset || 0, 0);

  try {
    return await PerformanceMetric.findAndCountAll({
      where, order: [['recorded_at', 'DESC']], limit, offset,
    });
  } catch (error) {
    logger.error('Failed to list performance metrics', { filters, error: (error as Error).message });
    throw error;
  }
}

export async function getPerformanceStats() {
  try {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const [total, warning, critical, recentMetrics] = await Promise.all([
      PerformanceMetric.count(),
      PerformanceMetric.count({ where: { status: 'warning', recorded_at: { [Op.gte]: hourAgo } } }),
      PerformanceMetric.count({ where: { status: 'critical', recorded_at: { [Op.gte]: hourAgo } } }),
      PerformanceMetric.findAll({
        attributes: [
          'category', 'metric_name',
          [PerformanceMetric.sequelize!.fn('AVG', PerformanceMetric.sequelize!.col('value')), 'avg_value'],
          [PerformanceMetric.sequelize!.fn('MAX', PerformanceMetric.sequelize!.col('value')), 'max_value'],
          [PerformanceMetric.sequelize!.fn('COUNT', '*'), 'count'],
        ],
        where: { recorded_at: { [Op.gte]: hourAgo } },
        group: ['category', 'metric_name'],
        raw: true,
      }),
    ]);

    // Return as array with unit info to match frontend PerformanceStats interface
    const recent_averages = (recentMetrics as any[]).map(r => ({
      category: r.category,
      metric_name: r.metric_name,
      avg_value: Math.round(parseFloat(r.avg_value) * 100) / 100,
      max_value: Math.round(parseFloat(r.max_value) * 100) / 100,
      unit: '', // unit varies per metric; consumers should use metric_name for context
      count: parseInt(r.count, 10),
    }));

    return { total, warning, critical, recent_averages };
  } catch (error) {
    logger.error('Failed to get performance stats', { error: (error as Error).message });
    throw error;
  }
}
