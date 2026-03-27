import { hasPermission, getRolePermissions, ROLES } from '../../config/roles';

describe('RBAC - Role Permissions', () => {
  it('should grant admin wildcard access to any permission', () => {
    expect(hasPermission('admin', 'leads:read')).toBe(true);
    expect(hasPermission('admin', 'campaigns:write')).toBe(true);
    expect(hasPermission('admin', 'anything:whatsoever')).toBe(true);
  });

  it('should grant manager specific permissions', () => {
    expect(hasPermission('manager', 'leads:read')).toBe(true);
    expect(hasPermission('manager', 'leads:write')).toBe(true);
    expect(hasPermission('manager', 'campaigns:approve')).toBe(true);
  });

  it('should deny manager admin-level permissions', () => {
    expect(hasPermission('manager', 'users:manage')).toBe(false);
    expect(hasPermission('manager', 'system:admin')).toBe(false);
  });

  it('should grant user read-only permissions', () => {
    expect(hasPermission('user', 'leads:read')).toBe(true);
    expect(hasPermission('user', 'campaigns:read')).toBe(true);
    expect(hasPermission('user', 'analytics:read')).toBe(true);
  });

  it('should deny user write permissions', () => {
    expect(hasPermission('user', 'leads:write')).toBe(false);
    expect(hasPermission('user', 'campaigns:write')).toBe(false);
    expect(hasPermission('user', 'campaigns:approve')).toBe(false);
  });

  it('should return false for unknown roles', () => {
    expect(hasPermission('unknown_role', 'leads:read')).toBe(false);
  });

  it('should return correct permissions for each role', () => {
    expect(getRolePermissions('admin')).toContain('*');
    expect(getRolePermissions('manager').length).toBeGreaterThan(0);
    expect(getRolePermissions('user').length).toBeGreaterThan(0);
    expect(getRolePermissions('nonexistent')).toEqual([]);
  });

  it('should have three defined roles', () => {
    expect(Object.keys(ROLES)).toEqual(['admin', 'manager', 'user']);
  });
});
