import { Op } from 'sequelize';
import { EtlPipeline, ETL_SOURCES, ETL_STATUSES } from '../models/EtlPipeline';
import { ValidationError, NotFoundError } from '../middleware/errors';
import { logger } from '../config/logger';

export async function createPipeline(input: {
  name: string; source: string; config?: object;
}) {
  if (!input.name?.trim()) throw new ValidationError('name is required');
  if (!input.source?.trim()) throw new ValidationError('source is required');
  if (!ETL_SOURCES.includes(input.source as any)) {
    throw new ValidationError(`Invalid source: ${input.source}. Valid: ${ETL_SOURCES.join(', ')}`);
  }

  try {
    const pipeline = await EtlPipeline.create({
      name: input.name.trim(), source: input.source as any, status: 'pending',
      started_at: new Date(), config: input.config || null,
    });
    logger.info('ETL pipeline created', { id: pipeline.id, name: pipeline.name, source: pipeline.source });
    return pipeline;
  } catch (error) {
    logger.error('Failed to create ETL pipeline', { name: input.name, source: input.source, error: (error as Error).message });
    throw error;
  }
}

export async function updatePipelineStatus(id: string, status: string, data?: {
  records_extracted?: number; records_transformed?: number; records_loaded?: number;
  error_message?: string;
}) {
  if (!id) throw new ValidationError('Pipeline ID is required');
  if (!status) throw new ValidationError('Status is required');
  if (!ETL_STATUSES.includes(status as any)) {
    throw new ValidationError(`Invalid status: ${status}. Valid: ${ETL_STATUSES.join(', ')}`);
  }

  // Validate numeric fields
  if (data?.records_extracted != null && (typeof data.records_extracted !== 'number' || data.records_extracted < 0)) {
    throw new ValidationError('records_extracted must be a non-negative number');
  }
  if (data?.records_transformed != null && (typeof data.records_transformed !== 'number' || data.records_transformed < 0)) {
    throw new ValidationError('records_transformed must be a non-negative number');
  }
  if (data?.records_loaded != null && (typeof data.records_loaded !== 'number' || data.records_loaded < 0)) {
    throw new ValidationError('records_loaded must be a non-negative number');
  }

  const p = await EtlPipeline.findByPk(id);
  if (!p) throw new NotFoundError('Pipeline not found');

  const updates: any = { status, ...data };
  if (status === 'completed' || status === 'failed') {
    updates.completed_at = new Date();
    if (p.started_at) updates.duration_ms = Date.now() - p.started_at.getTime();
  }

  try {
    await p.update(updates);
    logger.info('ETL pipeline status updated', { id, status, records_loaded: data?.records_loaded });
    return p;
  } catch (error) {
    logger.error('Failed to update ETL pipeline', { id, status, error: (error as Error).message });
    throw error;
  }
}

export async function listPipelines(filters: { source?: string; status?: string; limit?: number; offset?: number }) {
  const where: Record<string, unknown> = {};
  if (filters.source) {
    if (!ETL_SOURCES.includes(filters.source as any)) {
      throw new ValidationError(`Invalid source filter: ${filters.source}`);
    }
    where.source = filters.source;
  }
  if (filters.status) {
    if (!ETL_STATUSES.includes(filters.status as any)) {
      throw new ValidationError(`Invalid status filter: ${filters.status}`);
    }
    where.status = filters.status;
  }

  const limit = Math.min(Math.max(filters.limit || 25, 1), 100);
  const offset = Math.max(filters.offset || 0, 0);

  return EtlPipeline.findAndCountAll({
    where, order: [['created_at', 'DESC']], limit, offset,
  });
}

export async function getPipelineStats() {
  try {
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
  } catch (error) {
    logger.error('Failed to get pipeline stats', { error: (error as Error).message });
    throw error;
  }
}
