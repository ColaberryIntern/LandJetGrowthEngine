import { Op } from 'sequelize';
import { ApiIntegration, INTEGRATION_PROVIDERS } from '../models/ApiIntegration';
import { ValidationError, NotFoundError } from '../middleware/errors';
import { logger } from '../config/logger';

export async function createIntegration(input: {
  name: string; provider: string; base_url?: string; api_version?: string;
  auth_type?: string; rate_limit?: number; config?: object;
}) {
  if (!input.name?.trim()) throw new ValidationError('name is required');
  if (!INTEGRATION_PROVIDERS.includes(input.provider as any)) {
    throw new ValidationError(`Invalid provider. Valid: ${INTEGRATION_PROVIDERS.join(', ')}`);
  }
  return ApiIntegration.create({
    name: input.name.trim(), provider: input.provider as any, status: 'pending',
    base_url: input.base_url || null, api_version: input.api_version || null,
    auth_type: input.auth_type || null, rate_limit: input.rate_limit || null,
    config: input.config || null,
  });
}

export async function getIntegrationById(id: string) {
  const i = await ApiIntegration.findByPk(id);
  if (!i) throw new NotFoundError('Integration not found');
  return i;
}

export async function listIntegrations(filters: { provider?: string; status?: string; limit?: number; offset?: number }) {
  const where: Record<string, unknown> = {};
  if (filters.provider) where.provider = filters.provider;
  if (filters.status) where.status = filters.status;
  return ApiIntegration.findAndCountAll({
    where, order: [['name', 'ASC']], limit: filters.limit || 25, offset: filters.offset || 0,
  });
}

export async function updateIntegration(id: string, updates: Partial<{
  status: string; last_health_check: Date; last_error: string;
  total_calls: number; error_count: number; avg_latency_ms: number; config: object;
}>) {
  const i = await ApiIntegration.findByPk(id);
  if (!i) throw new NotFoundError('Integration not found');
  await i.update(updates as any);
  return i;
}

export async function getIntegrationStats() {
  const [total, active, degraded, offline] = await Promise.all([
    ApiIntegration.count(),
    ApiIntegration.count({ where: { status: 'active' } }),
    ApiIntegration.count({ where: { status: 'degraded' } }),
    ApiIntegration.count({ where: { status: 'offline' } }),
  ]);
  return { total, active, degraded, offline, health_rate: total > 0 ? Math.round((active / total) * 100) : 0 };
}
