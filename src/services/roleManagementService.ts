import { Op } from 'sequelize';
import { ROLES, getRolePermissions, RoleDefinition } from '../config/roles';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { logger } from '../config/logger';

/**
 * Req 17-20: List all defined roles with their permissions.
 */
export function listRoles(): RoleDefinition[] {
  return Object.values(ROLES);
}

/**
 * Req 19: Get permissions for a specific role.
 */
export function getRoleDetail(roleName: string) {
  const role = ROLES[roleName];
  if (!role) return null;
  return role;
}

/**
 * Req 22: Get user count per role.
 */
export async function getRoleAssignmentStats() {
  const roles = Object.keys(ROLES);
  const counts: Record<string, number> = {};

  for (const role of roles) {
    counts[role] = await User.count({ where: { role } });
  }

  return { roles: counts, total_users: Object.values(counts).reduce((s, n) => s + n, 0) };
}

/**
 * Req 12: Audit user roles and permissions — find mismatches or anomalies.
 */
export async function auditPermissions() {
  const users = await User.findAll({
    attributes: ['id', 'email', 'role', 'status', 'last_login_at', 'created_at'],
    raw: true,
  }) as any[];

  const issues: { user_id: string; email: string; issue: string; severity: 'low' | 'medium' | 'high' }[] = [];

  for (const user of users) {
    // Check for unknown roles
    if (!ROLES[user.role]) {
      issues.push({ user_id: user.id, email: user.email, issue: `Unknown role: ${user.role}`, severity: 'high' });
      continue;
    }

    // Check for admin accounts that haven't logged in recently
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

    // Check for suspended users still with admin role
    if (user.status !== 'active' && user.role === 'admin') {
      issues.push({ user_id: user.id, email: user.email, issue: 'Inactive admin account — consider role downgrade', severity: 'high' });
    }
  }

  // Count recent role changes for context
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
}
