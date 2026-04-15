import { Op } from 'sequelize';
import { ROLES, getRolePermissions, RoleDefinition } from '../config/roles';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { NotFoundError } from '../middleware/errors';
import { logger } from '../config/logger';

/**
 * List all defined roles with their permissions.
 */
export function listRoles(): RoleDefinition[] {
  return Object.values(ROLES);
}

/**
 * Get permissions for a specific role.
 */
export function getRoleDetail(roleName: string) {
  const role = ROLES[roleName];
  if (!role) throw new NotFoundError(`Role not found: ${roleName}`);
  return role;
}

/**
 * Get user count per role.
 */
export async function getRoleAssignmentStats() {
  try {
    const roles = Object.keys(ROLES);
    const counts: Record<string, number> = {};

    for (const role of roles) {
      counts[role] = await User.count({ where: { role } });
    }

    return { roles: counts, total_users: Object.values(counts).reduce((s, n) => s + n, 0) };
  } catch (error) {
    logger.error('Failed to get role assignment stats', { error: (error as Error).message });
    throw error;
  }
}

/**
 * Audit user roles and permissions -- find mismatches or anomalies.
 */
export async function auditPermissions() {
  try {
    const users = await User.findAll({
      attributes: ['id', 'email', 'role', 'status', 'last_login_at', 'created_at'],
      raw: true,
    }) as any[];

    const issues: { user_id: string; email: string; issue: string; severity: 'low' | 'medium' | 'high' }[] = [];

    for (const user of users) {
      if (!ROLES[user.role]) {
        issues.push({ user_id: user.id, email: user.email, issue: `Unknown role: ${user.role}`, severity: 'high' });
        continue;
      }

      if (user.role === 'admin') {
        if (!user.last_login_at) {
          issues.push({ user_id: user.id, email: user.email, issue: 'Admin account never logged in', severity: 'medium' });
        } else {
          const daysSince = (Date.now() - new Date(user.last_login_at).getTime()) / (86400 * 1000);
          if (daysSince > 30) {
            issues.push({ user_id: user.id, email: user.email, issue: `Admin inactive ${Math.round(daysSince)} days`, severity: 'high' });
          }
        }
      }

      if (user.status !== 'active' && user.role === 'admin') {
        issues.push({ user_id: user.id, email: user.email, issue: 'Inactive admin account -- consider role downgrade', severity: 'high' });
      }
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000);
    const recentRoleChanges = await AuditLog.count({
      where: { action: 'user.update_role', created_at: { [Op.gte]: sevenDaysAgo } },
    });

    logger.info('Permission audit completed', { issues: issues.length, recentRoleChanges });

    return {
      total_users: users.length,
      issues_found: issues.length,
      issues,
      recent_role_changes: recentRoleChanges,
      audit_timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('Permission audit failed', { error: (error as Error).message });
    throw error;
  }
}
