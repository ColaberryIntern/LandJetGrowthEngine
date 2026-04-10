import { Op } from 'sequelize';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { ValidationError, NotFoundError } from '../middleware/errors';
import { logger } from '../config/logger';

export interface UserFilters {
  role?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listUsers(filters: UserFilters) {
  const where: Record<string, unknown> = {};

  if (filters.role) where.role = filters.role;
  if (filters.status) where.status = filters.status;

  if (filters.search) {
    where[Op.or as any] = [
      { email: { [Op.iLike]: `%${filters.search}%` } },
      { first_name: { [Op.iLike]: `%${filters.search}%` } },
      { last_name: { [Op.iLike]: `%${filters.search}%` } },
    ];
  }

  return User.findAndCountAll({
    where,
    attributes: ['id', 'email', 'first_name', 'last_name', 'role', 'status', 'last_login_at', 'created_at'],
    order: [['created_at', 'DESC']],
    limit: filters.limit || 25,
    offset: filters.offset || 0,
  });
}

export async function getUserDetail(id: string) {
  const user = await User.findByPk(id, {
    attributes: ['id', 'email', 'first_name', 'last_name', 'role', 'status', 'last_login_at', 'created_at', 'updated_at'],
  });
  if (!user) throw new NotFoundError('User not found');

  // Get recent activity
  const recentActivity = await AuditLog.findAll({
    where: { user_id: id },
    order: [['created_at', 'DESC']],
    limit: 10,
  });

  return { user, recentActivity };
}

export async function updateUserRole(id: string, newRole: string, adminId: string) {
  const validRoles = ['admin', 'manager', 'user', 'viewer'];
  if (!validRoles.includes(newRole)) {
    throw new ValidationError(`Invalid role: ${newRole}. Valid: ${validRoles.join(', ')}`);
  }

  const user = await User.findByPk(id);
  if (!user) throw new NotFoundError('User not found');

  if (user.id === adminId) {
    throw new ValidationError('Cannot change your own role');
  }

  const oldRole = user.role;
  await user.update({ role: newRole as any });

  logger.info('User role updated', { userId: id, oldRole, newRole, by: adminId });
  return user;
}

export async function updateUserStatus(id: string, newStatus: string, adminId: string) {
  const validStatuses = ['active', 'inactive', 'suspended'];
  if (!validStatuses.includes(newStatus)) {
    throw new ValidationError(`Invalid status: ${newStatus}. Valid: ${validStatuses.join(', ')}`);
  }

  const user = await User.findByPk(id);
  if (!user) throw new NotFoundError('User not found');

  if (user.id === adminId && newStatus !== 'active') {
    throw new ValidationError('Cannot deactivate your own account');
  }

  await user.update({ status: newStatus as any });

  logger.info('User status updated', { userId: id, newStatus, by: adminId });
  return user;
}

export async function getUserStats() {
  const [total, active, inactive, suspended, admins, managers] = await Promise.all([
    User.count(),
    User.count({ where: { status: 'active' } }),
    User.count({ where: { status: 'inactive' } }),
    User.count({ where: { status: 'suspended' } }),
    User.count({ where: { role: 'admin' } }),
    User.count({ where: { role: 'manager' } }),
  ]);

  return { total, active, inactive, suspended, admins, managers, users: total - admins - managers };
}
