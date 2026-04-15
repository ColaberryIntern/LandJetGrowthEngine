import { Op } from 'sequelize';
import { SecurityIncident, INCIDENT_STATUSES, INCIDENT_TYPES, INCIDENT_SEVERITIES } from '../models/SecurityIncident';
import { ValidationError, NotFoundError } from '../middleware/errors';
import { logger } from '../config/logger';

export interface IncidentFilters {
  status?: string;
  severity?: string;
  incident_type?: string;
  limit?: number;
  offset?: number;
}

export async function createIncident(input: {
  title: string;
  description?: string;
  incident_type: string;
  severity?: string;
  reported_by?: string;
  metadata?: object;
}) {
  if (!input.title?.trim()) throw new ValidationError('title is required');
  if (!input.incident_type?.trim()) throw new ValidationError('incident_type is required');
  if (!INCIDENT_TYPES.includes(input.incident_type as any)) {
    throw new ValidationError(`Invalid incident_type: ${input.incident_type}. Valid: ${INCIDENT_TYPES.join(', ')}`);
  }
  if (input.severity && !INCIDENT_SEVERITIES.includes(input.severity as any)) {
    throw new ValidationError(`Invalid severity: ${input.severity}. Valid: ${INCIDENT_SEVERITIES.join(', ')}`);
  }

  try {
    const incident = await SecurityIncident.create({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      incident_type: input.incident_type as any,
      severity: (input.severity as any) || 'medium',
      status: 'open',
      reported_by: input.reported_by || null,
      metadata: input.metadata || null,
    });

    logger.info('Security incident created', { id: incident.id, type: input.incident_type, severity: incident.severity });
    return incident;
  } catch (error) {
    logger.error('Failed to create security incident', { title: input.title, error: (error as Error).message });
    throw error;
  }
}

export async function getIncidentById(id: string) {
  if (!id) throw new ValidationError('Incident ID is required');

  const incident = await SecurityIncident.findByPk(id);
  if (!incident) throw new NotFoundError('Incident not found');
  return incident;
}

export async function listIncidents(filters: IncidentFilters) {
  const where: Record<string, unknown> = {};

  if (filters.status) {
    if (!INCIDENT_STATUSES.includes(filters.status as any)) {
      throw new ValidationError(`Invalid status filter: ${filters.status}. Valid: ${INCIDENT_STATUSES.join(', ')}`);
    }
    where.status = filters.status;
  }
  if (filters.severity) {
    if (!INCIDENT_SEVERITIES.includes(filters.severity as any)) {
      throw new ValidationError(`Invalid severity filter: ${filters.severity}. Valid: ${INCIDENT_SEVERITIES.join(', ')}`);
    }
    where.severity = filters.severity;
  }
  if (filters.incident_type) {
    if (!INCIDENT_TYPES.includes(filters.incident_type as any)) {
      throw new ValidationError(`Invalid incident_type filter: ${filters.incident_type}. Valid: ${INCIDENT_TYPES.join(', ')}`);
    }
    where.incident_type = filters.incident_type;
  }

  const limit = Math.min(Math.max(filters.limit || 25, 1), 100);
  const offset = Math.max(filters.offset || 0, 0);

  try {
    return await SecurityIncident.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });
  } catch (error) {
    logger.error('Failed to list incidents', { filters, error: (error as Error).message });
    throw error;
  }
}

export async function updateIncident(id: string, updates: {
  status?: string;
  severity?: string;
  assigned_to?: string;
  resolution?: string;
}) {
  if (!id) throw new ValidationError('Incident ID is required');
  if (updates.status && !INCIDENT_STATUSES.includes(updates.status as any)) {
    throw new ValidationError(`Invalid status: ${updates.status}. Valid: ${INCIDENT_STATUSES.join(', ')}`);
  }
  if (updates.severity && !INCIDENT_SEVERITIES.includes(updates.severity as any)) {
    throw new ValidationError(`Invalid severity: ${updates.severity}. Valid: ${INCIDENT_SEVERITIES.join(', ')}`);
  }

  const incident = await SecurityIncident.findByPk(id);
  if (!incident) throw new NotFoundError('Incident not found');

  const data: any = { ...updates };
  if (updates.status === 'resolved' || updates.status === 'closed') {
    data.resolved_at = new Date();
  }

  try {
    await incident.update(data);
    logger.info('Incident updated', { id, updates: Object.keys(updates), status: updates.status });
    return incident;
  } catch (error) {
    logger.error('Failed to update incident', { id, error: (error as Error).message });
    throw error;
  }
}

export async function getIncidentStats() {
  try {
    const [total, open, critical, bySeverity, byType] = await Promise.all([
      SecurityIncident.count(),
      SecurityIncident.count({ where: { status: { [Op.in]: ['open', 'investigating'] } } }),
      SecurityIncident.count({ where: { severity: 'critical', status: { [Op.ne]: 'closed' } } }),
      SecurityIncident.findAll({
        attributes: ['severity', [SecurityIncident.sequelize!.fn('COUNT', '*'), 'count']],
        group: ['severity'], raw: true,
      }),
      SecurityIncident.findAll({
        attributes: ['incident_type', [SecurityIncident.sequelize!.fn('COUNT', '*'), 'count']],
        group: ['incident_type'], raw: true,
      }),
    ]);

    const severityCounts: Record<string, number> = {};
    for (const r of bySeverity as any[]) severityCounts[r.severity] = parseInt(r.count, 10);
    const typeCounts: Record<string, number> = {};
    for (const r of byType as any[]) typeCounts[r.incident_type] = parseInt(r.count, 10);

    return { total, open, critical, bySeverity: severityCounts, byType: typeCounts };
  } catch (error) {
    logger.error('Failed to get incident stats', { error: (error as Error).message });
    throw error;
  }
}
