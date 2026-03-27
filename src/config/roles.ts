export interface RoleDefinition {
  name: string;
  permissions: string[];
}

export const ROLES: Record<string, RoleDefinition> = {
  admin: {
    name: 'admin',
    permissions: ['*'],
  },
  manager: {
    name: 'manager',
    permissions: [
      'leads:read',
      'leads:write',
      'campaigns:read',
      'campaigns:write',
      'campaigns:approve',
      'analytics:read',
      'notifications:read',
      'notifications:write',
    ],
  },
  user: {
    name: 'user',
    permissions: ['leads:read', 'campaigns:read', 'analytics:read', 'notifications:read'],
  },
};

export function hasPermission(role: string, requiredPermission: string): boolean {
  const roleConfig = ROLES[role];
  if (!roleConfig) return false;
  if (roleConfig.permissions.includes('*')) return true;
  return roleConfig.permissions.includes(requiredPermission);
}

export function getRolePermissions(role: string): string[] {
  return ROLES[role]?.permissions || [];
}
