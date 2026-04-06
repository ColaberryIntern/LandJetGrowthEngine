import { Op } from 'sequelize';
import {
  UncategorizedRequirement,
  UncategorizedRequirementCreationAttributes,
  RequirementStatus,
  REQUIREMENT_STATUSES,
  REQUIREMENT_PRIORITIES,
} from '../models/UncategorizedRequirement';
import { ValidationError, NotFoundError } from '../middleware/errors';
import { logger } from '../config/logger';

export interface RequirementFilters {
  status?: string;
  priority?: string;
  search?: string;
  assigned_capability?: string;
  limit?: number;
  offset?: number;
}

export async function createRequirement(
  input: Omit<UncategorizedRequirementCreationAttributes, 'status' | 'priority'> & {
    priority?: string;
  },
) {
  if (!input.title || !input.title.trim()) {
    throw new ValidationError('title is required');
  }

  const requirement = await UncategorizedRequirement.create({
    title: input.title.trim(),
    description: input.description || null,
    source: input.source || null,
    priority: (input.priority as any) || 'medium',
    status: 'unreviewed',
    tags: input.tags || null,
    notes: input.notes || null,
    metadata: input.metadata || null,
  });

  logger.info('Requirement created', { id: requirement.id, title: requirement.title });
  return requirement;
}

export async function getRequirementById(id: string) {
  const requirement = await UncategorizedRequirement.findByPk(id);
  if (!requirement) throw new NotFoundError('Requirement not found');
  return requirement;
}

export async function listRequirements(filters: RequirementFilters) {
  const where: Record<string, unknown> = {};

  if (filters.status) where.status = filters.status;
  if (filters.priority) where.priority = filters.priority;
  if (filters.assigned_capability) where.assigned_capability = filters.assigned_capability;

  if (filters.search) {
    where[Op.or as any] = [
      { title: { [Op.iLike]: `%${filters.search}%` } },
      { description: { [Op.iLike]: `%${filters.search}%` } },
    ];
  }

  return UncategorizedRequirement.findAndCountAll({
    where,
    order: [
      ['priority', 'ASC'], // critical first
      ['created_at', 'DESC'],
    ],
    limit: filters.limit || 25,
    offset: filters.offset || 0,
  });
}

export async function updateRequirement(
  id: string,
  updates: Partial<UncategorizedRequirementCreationAttributes>,
) {
  const requirement = await UncategorizedRequirement.findByPk(id);
  if (!requirement) throw new NotFoundError('Requirement not found');

  await requirement.update(updates);
  return requirement;
}

export async function categorizeRequirement(
  id: string,
  capability: string,
  userId: string,
) {
  if (!capability || !capability.trim()) {
    throw new ValidationError('capability is required');
  }

  const requirement = await UncategorizedRequirement.findByPk(id);
  if (!requirement) throw new NotFoundError('Requirement not found');

  await requirement.update({
    assigned_capability: capability.trim(),
    status: 'categorized',
    reviewed_by: userId,
    reviewed_at: new Date(),
  });

  logger.info('Requirement categorized', { id, capability, userId });
  return requirement;
}

export async function bulkUpdateStatus(
  ids: string[],
  newStatus: string,
  userId: string,
) {
  if (!ids.length) throw new ValidationError('ids array is required');
  if (!REQUIREMENT_STATUSES.includes(newStatus as RequirementStatus)) {
    throw new ValidationError(`Invalid status: ${newStatus}. Valid: ${REQUIREMENT_STATUSES.join(', ')}`);
  }

  const [updated] = await UncategorizedRequirement.update(
    {
      status: newStatus as RequirementStatus,
      reviewed_by: userId,
      reviewed_at: new Date(),
    },
    { where: { id: { [Op.in]: ids } } },
  );

  logger.info('Bulk status update', { count: updated, newStatus, userId });
  return { updated };
}

export async function getRequirementStats() {
  const total = await UncategorizedRequirement.count();

  const byStatusRaw = await UncategorizedRequirement.findAll({
    attributes: ['status', [UncategorizedRequirement.sequelize!.fn('COUNT', '*'), 'count']],
    group: ['status'],
    raw: true,
  }) as any[];

  const byPriorityRaw = await UncategorizedRequirement.findAll({
    attributes: ['priority', [UncategorizedRequirement.sequelize!.fn('COUNT', '*'), 'count']],
    group: ['priority'],
    raw: true,
  }) as any[];

  const byStatus: Record<string, number> = {};
  for (const r of byStatusRaw) byStatus[r.status] = parseInt(r.count, 10);

  const byPriority: Record<string, number> = {};
  for (const r of byPriorityRaw) byPriority[r.priority] = parseInt(r.count, 10);

  return { total, byStatus, byPriority };
}
