import { Op } from 'sequelize';
import { AuditLog } from '../models/AuditLog';
import { logger } from '../config/logger';

export interface AuditFilters {
  user_id?: string;
  action?: string;
  entity_type?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export async function listAuditLogs(filters: AuditFilters) {
  const where: Record<string, unknown> = {};

  if (filters.user_id) where.user_id = filters.user_id;
  if (filters.action) where.action = { [Op.iLike]: `%${filters.action}%` };
  if (filters.entity_type) where.entity_type = filters.entity_type;

  if (filters.from || filters.to) {
    where.created_at = {};
    if (filters.from) (where.created_at as any)[Op.gte] = new Date(filters.from);
    if (filters.to) (where.created_at as any)[Op.lte] = new Date(filters.to);
  }

  return AuditLog.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit: filters.limit || 50,
    offset: filters.offset || 0,
  });
}

export async function getAuditLogById(id: string) {
  const log = await AuditLog.findByPk(id);
  if (!log) throw new Error('Audit log not found');
  return log;
}

export async function getAuditStats() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [total, today, entityTypes, recentActions] = await Promise.all([
    AuditLog.count(),
    AuditLog.count({ where: { created_at: { [Op.gte]: todayStart } } }),
    AuditLog.findAll({
      attributes: ['entity_type', [AuditLog.sequelize!.fn('COUNT', '*'), 'count']],
      group: ['entity_type'],
      raw: true,
    }),
    AuditLog.findAll({
      attributes: ['action', [AuditLog.sequelize!.fn('COUNT', '*'), 'count']],
      where: { created_at: { [Op.gte]: todayStart } },
      group: ['action'],
      order: [[AuditLog.sequelize!.fn('COUNT', '*'), 'DESC']],
      limit: 10,
      raw: true,
    }),
  ]);

  const byEntity: Record<string, number> = {};
  for (const r of entityTypes as any[]) byEntity[r.entity_type] = parseInt(r.count, 10);

  const topActions: Record<string, number> = {};
  for (const r of recentActions as any[]) topActions[r.action] = parseInt(r.count, 10);

  return { total, today, byEntity, topActions };
}
