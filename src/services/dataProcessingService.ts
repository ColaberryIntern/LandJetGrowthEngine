import { Op } from 'sequelize';
import { EtlPipeline, ETL_SOURCES } from '../models/EtlPipeline';
import { ValidationError, NotFoundError } from '../middleware/errors';
import { logger } from '../config/logger';

export async function createPipeline(input: {
  name: string; source: string; config?: object;
}) {
  if (!input.name?.trim()) throw new ValidationError('name is required');
  if (!ETL_SOURCES.includes(input.source as any)) {
    throw new ValidationError(`Invalid source. Valid: ${ETL_SOURCES.join(', ')}`);
  }
  return EtlPipeline.create({
    name: input.name.trim(), source: input.source as any, status: 'pending',
    started_at: new Date(), config: input.config || null,
  });
}

export async function updatePipelineStatus(id: string, status: string, data?: {
  records_extracted?: number; records_transformed?: number; records_loaded?: number;
  error_message?: string;
}) {
  const p = await EtlPipeline.findByPk(id);
  if (!p) throw new NotFoundError('Pipeline not found');

  const updates: any = { status, ...data };
  if (status === 'completed' || status === 'failed') {
    updates.completed_at = new Date();
    if (p.started_at) updates.duration_ms = Date.now() - p.started_at.getTime();
  }

  await p.update(updates);
  logger.info('ETL pipeline updated', { id, status });
  return p;
}

export async function listPipelines(filters: { source?: string; status?: string; limit?: number; offset?: number }) {
  const where: Record<string, unknown> = {};
  if (filters.source) where.source = filters.source;
  if (filters.status) where.status = filters.status;
  return EtlPipeline.findAndCountAll({
    where, order: [['created_at', 'DESC']], limit: filters.limit || 25, offset: filters.offset || 0,
  });
}

export async function getPipelineStats() {
  const [total, completed, failed, running, totalRecords] = await Promise.all([
    EtlPipeline.count(),
    EtlPipeline.count({ where: { status: 'completed' } }),
    EtlPipeline.count({ where: { status: 'failed' } }),
    EtlPipeline.count({ where: { status: { [Op.in]: ['extracting', 'transforming', 'loading'] } } }),
    EtlPipeline.sum('records_loaded'),
  ]);

  const avgDuration = await EtlPipeline.findOne({
    attributes: [[EtlPipeline.sequelize!.fn('AVG', EtlPipeline.sequelize!.col('duration_ms')), 'avg']],
    where: { status: 'completed', duration_ms: { [Op.ne]: null } }, raw: true,
  });

  return {
    total, completed, failed, running,
    total_records_loaded: totalRecords || 0,
    avg_duration_ms: Math.round(((avgDuration as any)?.avg || 0)),
    success_rate: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}
