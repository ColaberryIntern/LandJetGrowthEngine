import bcrypt from 'bcrypt';
import crypto from 'crypto';
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

export interface CreateUserInput {
  email: string;
  first_name: string;
  last_name: string;
  role: 'admin' | 'manager' | 'user';
  // 2026-06-14 territory model refactor: per-user state list lives in
  // default_filters.states (JSONB). Empty / missing = sees all.
  // Replaces the 3-value territory_default enum.
  states?: string[];
  default_filters?: Record<string, unknown>;
}

const ROLES: Array<'admin' | 'manager' | 'user'> = ['admin', 'manager', 'user'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STATE_RE = /^[A-Z]{2}$/;
const USER_LIST_ATTRS = ['id', 'email', 'first_name', 'last_name', 'role', 'status', 'default_filters', 'last_login_at', 'created_at'];

/**
 * Normalize + validate an array of US state codes. Accepts inputs like
 * ["tx", " IA "] and returns ["TX", "IA"]. Throws on non-2-letter codes.
 * Empty array passes through (sees all).
 */
export function normalizeStates(input: unknown, fieldLabel = 'states'): string[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) {
    throw new ValidationError(`${fieldLabel} must be an array of 2-letter state codes`);
  }
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') {
      throw new ValidationError(`${fieldLabel}[] entries must be strings`);
    }
    const code = raw.trim().toUpperCase();
    if (!STATE_RE.test(code)) {
      throw new ValidationError(`Invalid state code "${raw}" in ${fieldLabel}; expected 2-letter uppercase (e.g., TX, IA)`);
    }
    if (!out.includes(code)) out.push(code);
  }
  return out;
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
    attributes: USER_LIST_ATTRS,
    order: [['created_at', 'DESC']],
    limit: filters.limit || 25,
    offset: filters.offset || 0,
  });
}

export async function getUserDetail(id: string) {
  const user = await User.findByPk(id, {
    attributes: [...USER_LIST_ATTRS, 'updated_at'],
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

/**
 * Update the state list a user defaults to filtering by. Empty array = sees all.
 * Replaces the deprecated updateUserTerritory enum-based version (2026-06-14 refactor).
 */
export async function updateUserStates(id: string, statesInput: unknown, adminId: string) {
  const states = normalizeStates(statesInput, 'states');
  const user = await User.findByPk(id);
  if (!user) throw new NotFoundError('User not found');

  const current = (user.default_filters || {}) as Record<string, unknown>;
  const next = { ...current, states };
  await user.update({ default_filters: next });
  logger.info('User default_filters.states updated', { userId: id, states, by: adminId });
  return user;
}

export async function createUser(input: CreateUserInput, adminId: string): Promise<{ user: User; tempPassword: string }> {
  const normalizedEmail = (input.email ?? '').trim().toLowerCase();
  if (!normalizedEmail || !EMAIL_RE.test(normalizedEmail)) {
    throw new ValidationError('Invalid email');
  }
  if (!input.first_name || !input.last_name) {
    throw new ValidationError('first_name and last_name are required');
  }
  if (!ROLES.includes(input.role)) {
    throw new ValidationError(`Invalid role: ${input.role}. Valid: ${ROLES.join(', ')}`);
  }
  const states = normalizeStates(input.states, 'states');

  const existing = await User.findOne({ where: { email: normalizedEmail } });
  if (existing) {
    throw new ValidationError(`User with email ${normalizedEmail} already exists`);
  }

  // Generate a temp password the caller can hand off out-of-band.
  // 16 url-safe chars from 12 random bytes.
  const tempPassword = crypto.randomBytes(12).toString('base64url');
  const password_hash = await bcrypt.hash(tempPassword, 10);

  const baseFilters = (input.default_filters && typeof input.default_filters === 'object') ? { ...input.default_filters } : {};
  const default_filters = { ...baseFilters, states };

  const user = await User.create({
    email: normalizedEmail,
    password_hash,
    first_name: input.first_name.trim(),
    last_name: input.last_name.trim(),
    role: input.role,
    status: 'active',
    default_filters,
  });

  logger.info('User created', { userId: user.id, email: normalizedEmail, role: input.role, states, by: adminId });
  return { user, tempPassword };
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
