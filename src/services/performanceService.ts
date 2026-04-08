import { Op } from 'sequelize';
import { PerformanceMetric, METRIC_CATEGORIES } from '../models/PerformanceMetric';
import { ValidationError, NotFoundError } from '../middleware/errors';
import { logger } from '../config/logger';

export async function recordMetric(input: {
  category: string; metric_name: string; value: number; unit: string;
  threshold_warning?: number; threshold_critical?: number; context?: object;
}) {
  if (!input.metric_name?.trim()) throw new ValidationError('metric_name is required');
  if (!METRIC_CATEGORIES.includes(input.category as any)) {
    throw new ValidationError(`Invalid category. Valid: ${METRIC_CATEGORIES.join(', ')}`);
  }

  let status: 'normal' | 'warning' | 'critical' = 'normal';
  if (input.threshold_critical && input.value >= input.threshold_critical) status = 'critical';
  else if (input.threshold_warning && input.value >= input.threshold_warning) status = 'warning';

  return PerformanceMetric.create({
    category: input.category as any, metric_name: input.metric_name.trim(),
    value: input.value, unit: input.unit, status,
    threshold_warning: input.threshold_warning || null,
    threshold_critical: input.threshold_critical || null,
    context: input.context || null, recorded_at: new Date(),
  });
}

export async function listMetrics(filters: {
  category?: string; status?: string; metric_name?: string;
  from?: string; limit?: number; offset?: number;
}) {
  const where: Record<string, unknown> = {};
  if (filters.category) where.category = filters.category;
  if (filters.status) where.status = filters.status;
  if (filters.metric_name) where.metric_name = filters.metric_name;
  if (filters.from) where.recorded_at = { [Op.gte]: new Date(filters.from) };

  return PerformanceMetric.findAndCountAll({
    where, order: [['recorded_at', 'DESC']],
    limit: filters.limit || 50, offset: filters.offset || 0,
  });
}

export async function getPerformanceStats() {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const [total, warnings, critical, recentMetrics] = await Promise.all([
    PerformanceMetric.count(),
    PerformanceMetric.count({ where: { status: 'warning', recorded_at: { [Op.gte]: hourAgo } } }),
    PerformanceMetric.count({ where: { status: 'critical', recorded_at: { [Op.gte]: hourAgo } } }),
    PerformanceMetric.findAll({
      attributes: ['category', 'metric_name',
        [PerformanceMetric.sequelize!.fn('AVG', PerformanceMetric.sequelize!.col('value')), 'avg_value'],
        [PerformanceMetric.sequelize!.fn('MAX', PerformanceMetric.sequelize!.col('value')), 'max_value'],
      ],
      where: { recorded_at: { [Op.gte]: hourAgo } },
      group: ['category', 'metric_name'],
      raw: true,
    }),
  ]);

  const byCategory: Record<string, { avg: number; max: number }> = {};
  for (const r of recentMetrics as any[]) {
    byCategory[`${r.category}:${r.metric_name}`] = {
      avg: Math.round(parseFloat(r.avg_value) * 100) / 100,
      max: Math.round(parseFloat(r.max_value) * 100) / 100,
    };
  }

  return { total, warnings_last_hour: warnings, critical_last_hour: critical, recent_averages: byCategory };
}
