import { Op } from 'sequelize';
import { SecurityIncident, INCIDENT_STATUSES, INCIDENT_TYPES } from '../models/SecurityIncident';
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
  if (!INCIDENT_TYPES.includes(input.incident_type as any)) {
    throw new ValidationError(`Invalid incident_type. Valid: ${INCIDENT_TYPES.join(', ')}`);
  }

  const incident = await SecurityIncident.create({
    title: input.title.trim(),
    description: input.description || null,
    incident_type: input.incident_type as any,
    severity: (input.severity as any) || 'medium',
    status: 'open',
    reported_by: input.reported_by || null,
    metadata: input.metadata || null,
  });

  logger.info('Security incident created', { id: incident.id, type: input.incident_type, severity: incident.severity });
  return incident;
}

export async function getIncidentById(id: string) {
  const incident = await SecurityIncident.findByPk(id);
  if (!incident) throw new NotFoundError('Incident not found');
  return incident;
}

export async function listIncidents(filters: IncidentFilters) {
  const where: Record<string, unknown> = {};
  if (filters.status) where.status = filters.status;
  if (filters.severity) where.severity = filters.severity;
  if (filters.incident_type) where.incident_type = filters.incident_type;

  return SecurityIncident.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit: filters.limit || 25,
    offset: filters.offset || 0,
  });
}

export async function updateIncident(id: string, updates: {
  status?: string;
  severity?: string;
  assigned_to?: string;
  resolution?: string;
}) {
  const incident = await SecurityIncident.findByPk(id);
  if (!incident) throw new NotFoundError('Incident not found');

  const data: any = { ...updates };
  if (updates.status === 'resolved' || updates.status === 'closed') {
    data.resolved_at = new Date();
  }

  await incident.update(data);
  logger.info('Incident updated', { id, updates: Object.keys(updates) });
  return incident;
}

export async function getIncidentStats() {
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
}
