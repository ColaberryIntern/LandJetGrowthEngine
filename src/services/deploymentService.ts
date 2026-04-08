import { Op } from 'sequelize';
import { Deployment, DEPLOY_ENVIRONMENTS, DEPLOY_STATUSES } from '../models/Deployment';
import { ValidationError, NotFoundError } from '../middleware/errors';
import { logger } from '../config/logger';

export async function createDeployment(input: {
  version: string; environment: string; description?: string;
  changes?: string[]; deployed_by?: string;
}) {
  if (!input.version?.trim()) throw new ValidationError('version is required');
  if (!DEPLOY_ENVIRONMENTS.includes(input.environment as any)) {
    throw new ValidationError(`Invalid environment. Valid: ${DEPLOY_ENVIRONMENTS.join(', ')}`);
  }

  const deploy = await Deployment.create({
    version: input.version.trim(), environment: input.environment as any,
    status: 'planned', description: input.description || null,
    changes: input.changes || null, deployed_by: input.deployed_by || null,
    started_at: null, metadata: null,
  });
  logger.info('Deployment created', { id: deploy.id, version: input.version, env: input.environment });
  return deploy;
}

export async function getDeploymentById(id: string) {
  const d = await Deployment.findByPk(id);
  if (!d) throw new NotFoundError('Deployment not found');
  return d;
}

export async function listDeployments(filters: { environment?: string; status?: string; limit?: number; offset?: number }) {
  const where: Record<string, unknown> = {};
  if (filters.environment) where.environment = filters.environment;
  if (filters.status) where.status = filters.status;

  return Deployment.findAndCountAll({
    where, order: [['created_at', 'DESC']],
    limit: filters.limit || 25, offset: filters.offset || 0,
  });
}

export async function updateDeploymentStatus(id: string, newStatus: string, extra?: { rollback_reason?: string }) {
  const d = await Deployment.findByPk(id);
  if (!d) throw new NotFoundError('Deployment not found');
  if (!DEPLOY_STATUSES.includes(newStatus as any)) {
    throw new ValidationError(`Invalid status. Valid: ${DEPLOY_STATUSES.join(', ')}`);
  }

  const data: any = { status: newStatus };
  if (newStatus === 'in_progress') data.started_at = new Date();
  if (newStatus === 'deployed' || newStatus === 'failed' || newStatus === 'rolled_back') data.completed_at = new Date();
  if (newStatus === 'rolled_back' && extra?.rollback_reason) data.rollback_reason = extra.rollback_reason;

  await d.update(data);
  logger.info('Deployment status updated', { id, status: newStatus });
  return d;
}

export async function getDeploymentStats() {
  const [total, deployed, failed, rolledBack] = await Promise.all([
    Deployment.count(),
    Deployment.count({ where: { status: 'deployed' } }),
    Deployment.count({ where: { status: 'failed' } }),
    Deployment.count({ where: { status: 'rolled_back' } }),
  ]);
  return { total, deployed, failed, rolled_back: rolledBack, success_rate: total > 0 ? Math.round((deployed / total) * 100) : 0 };
}
