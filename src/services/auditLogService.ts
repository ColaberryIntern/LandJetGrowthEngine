import { AuditLog } from '../models/AuditLog';

export interface AuditLogInput {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: object | null;
  newValue?: object | null;
  ipAddress?: string | null;
  metadata?: object | null;
}

export async function createAuditLog(input: AuditLogInput): Promise<void> {
  try {
    await AuditLog.create({
      user_id: input.userId || null,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId || null,
      old_value: input.oldValue || null,
      new_value: input.newValue || null,
      ip_address: input.ipAddress || null,
      metadata: input.metadata || null,
    });
  } catch (error) {
    // Audit logging should never crash the main flow
    console.error('Failed to create audit log:', error);
  }
}

export async function getAuditLogs(filters: {
  userId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  limit?: number;
  offset?: number;
}) {
  const where: Record<string, unknown> = {};
  if (filters.userId) where.user_id = filters.userId;
  if (filters.entityType) where.entity_type = filters.entityType;
  if (filters.entityId) where.entity_id = filters.entityId;
  if (filters.action) where.action = filters.action;

  return AuditLog.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit: filters.limit || 50,
    offset: filters.offset || 0,
  });
}
