import { AuditLog } from '../models/AuditLog';
import { getContext } from '../middleware/requestContext';
import { logger } from '../config/logger';

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
  if (!input.action || !input.action.trim()) {
    logger.error('Invalid audit log action: action is required');
    return;
  }
  if (!input.entityType || !input.entityType.trim()) {
    logger.error('Invalid audit log entityType: entityType is required');
    return;
  }

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
    logger.error('Failed to create audit log', { action: input.action, entityType: input.entityType, error: (error as Error).message });
  }
}

/**
 * Convenience for service-layer actions (audit gap G5): auto-fills userId +
 * traceId from the request context and never throws. Use for consequential AI
 * actions that previously left no audit trail (sends, routing, progression).
 */
export async function auditAction(
  action: string,
  entityType: string,
  entityId: string | number | null,
  fields: { oldValue?: object | null; newValue?: object | null; metadata?: object } = {},
): Promise<void> {
  try {
    const ctx = getContext();
    await createAuditLog({
      userId: ctx.userId || null,
      action,
      entityType,
      entityId: entityId != null ? String(entityId) : null,
      oldValue: fields.oldValue || null,
      newValue: fields.newValue || null,
      metadata: { ...(fields.metadata || {}), traceId: ctx.traceId || null },
    });
  } catch { /* fail-soft */ }
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

  const limit = Math.min(Math.max(filters.limit || 50, 1), 100);
  const offset = Math.max(filters.offset || 0, 0);

  return AuditLog.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit,
    offset,
  });
}
