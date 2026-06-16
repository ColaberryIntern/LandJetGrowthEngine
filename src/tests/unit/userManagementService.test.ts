jest.mock('../../models/User', () => ({
  User: {
    findOne: jest.fn(),
    findByPk: jest.fn(),
    findAndCountAll: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
  },
  initUserModel: jest.fn(),
}));
jest.mock('../../models/AuditLog', () => ({ AuditLog: { findAll: jest.fn() }, initAuditLogModel: jest.fn() }));
jest.mock('../../config/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('bcrypt', () => ({ hash: jest.fn().mockResolvedValue('hashed-password-stub') }));

import { createUser, updateUserStates, updateUserRole, updateUserStatus, normalizeStates } from '../../services/userManagementService';
import { User } from '../../models/User';
import { ValidationError, NotFoundError, AuthorizationError } from '../../middleware/errors';

const mockFindOne = User.findOne as jest.Mock;
const mockFindByPk = User.findByPk as jest.Mock;
const mockCreate = User.create as jest.Mock;

const admin = { userId: 'admin-uuid-1', role: 'admin' };
const accountMgr = { userId: 'amgr-uuid-1', role: 'account_manager' };

const baseInput = {
  email: 'newperson@landjet.com',
  first_name: 'New',
  last_name: 'Person',
  role: 'manager' as const,
};

describe('normalizeStates', () => {
  it('uppercases and trims state codes', () => {
    expect(normalizeStates(['tx', ' ia '])).toEqual(['TX', 'IA']);
  });

  it('deduplicates', () => {
    expect(normalizeStates(['TX', 'tx', 'TX'])).toEqual(['TX']);
  });

  it('returns empty array for null/undefined', () => {
    expect(normalizeStates(undefined)).toEqual([]);
    expect(normalizeStates(null)).toEqual([]);
  });

  it('rejects non-array input', () => {
    expect(() => normalizeStates('TX' as any)).toThrow(ValidationError);
    expect(() => normalizeStates(42 as any)).toThrow(ValidationError);
  });

  it('rejects entries that are not 2-letter codes', () => {
    expect(() => normalizeStates(['TX', 'TEXAS'])).toThrow(/Invalid state code/);
    expect(() => normalizeStates(['T'])).toThrow(ValidationError);
    expect(() => normalizeStates(['123'])).toThrow(ValidationError);
  });
});

describe('userManagementService.createUser', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a user with states=["TX"] when input is valid and email is unique', async () => {
    mockFindOne.mockResolvedValue(null);
    mockCreate.mockImplementation(async (attrs) => ({ id: 'new-uuid', ...attrs }));

    const result = await createUser({ ...baseInput, states: ['TX'] }, admin);

    expect(result.user.email).toBe('newperson@landjet.com');
    expect((result.user as any).default_filters).toEqual({ states: ['TX'] });
    expect(result.user.role).toBe('manager');
    expect(typeof result.tempPassword).toBe('string');
    expect(result.tempPassword.length).toBeGreaterThan(8);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      email: 'newperson@landjet.com',
      password_hash: 'hashed-password-stub',
      status: 'active',
      default_filters: { states: ['TX'] },
    }));
  });

  it('defaults states to [] (sees all) when omitted', async () => {
    mockFindOne.mockResolvedValue(null);
    mockCreate.mockImplementation(async (attrs) => ({ id: 'u', ...attrs }));

    const result = await createUser(baseInput, admin);
    expect((result.user as any).default_filters).toEqual({ states: [] });
  });

  it('accepts multiple states (Percy + Iowa example)', async () => {
    mockFindOne.mockResolvedValue(null);
    mockCreate.mockImplementation(async (attrs) => ({ id: 'u', ...attrs }));

    const result = await createUser({ ...baseInput, states: ['TX', 'IA'] }, admin);
    expect((result.user as any).default_filters.states).toEqual(['TX', 'IA']);
  });

  it('normalizes email to lowercase + trim', async () => {
    mockFindOne.mockResolvedValue(null);
    mockCreate.mockImplementation(async (attrs) => ({ id: 'u', ...attrs }));

    await createUser({ ...baseInput, email: '  MiXeD@LandJet.COM  ' }, admin);

    expect(mockFindOne).toHaveBeenCalledWith({ where: { email: 'mixed@landjet.com' } });
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ email: 'mixed@landjet.com' }));
  });

  it('rejects when email format is invalid', async () => {
    await expect(createUser({ ...baseInput, email: 'not-an-email' }, admin))
      .rejects.toThrow(ValidationError);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects when email is missing', async () => {
    await expect(createUser({ ...baseInput, email: '' }, admin))
      .rejects.toThrow(ValidationError);
  });

  it('rejects when first_name or last_name is missing', async () => {
    await expect(createUser({ ...baseInput, first_name: '' }, admin))
      .rejects.toThrow(ValidationError);
    await expect(createUser({ ...baseInput, last_name: '' }, admin))
      .rejects.toThrow(ValidationError);
  });

  it('rejects when role is not in the allowed list', async () => {
    await expect(createUser({ ...baseInput, role: 'superuser' as any }, admin))
      .rejects.toThrow(ValidationError);
  });

  it('rejects when states contains an invalid code', async () => {
    await expect(createUser({ ...baseInput, states: ['TX', 'TEXAS'] }, admin))
      .rejects.toThrow(/Invalid state code/);
  });

  it('rejects when email already exists (idempotency guard)', async () => {
    mockFindOne.mockResolvedValue({ id: 'existing', email: 'newperson@landjet.com' });
    await expect(createUser(baseInput, admin))
      .rejects.toThrow(/already exists/);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('userManagementService.createUser caller-role enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindOne.mockResolvedValue(null);
    mockCreate.mockImplementation(async (attrs) => ({ id: 'u', ...attrs }));
  });

  it('admin can create another admin', async () => {
    const result = await createUser({ ...baseInput, role: 'admin' }, admin);
    expect(result.user.role).toBe('admin');
  });

  it('admin can create an account_manager', async () => {
    const result = await createUser({ ...baseInput, role: 'account_manager' }, admin);
    expect(result.user.role).toBe('account_manager');
  });

  it('account_manager can create a manager', async () => {
    const result = await createUser({ ...baseInput, role: 'manager' }, accountMgr);
    expect(result.user.role).toBe('manager');
  });

  it('account_manager can create a user', async () => {
    const result = await createUser({ ...baseInput, role: 'user' }, accountMgr);
    expect(result.user.role).toBe('user');
  });

  it('account_manager CANNOT create an admin', async () => {
    await expect(createUser({ ...baseInput, role: 'admin' }, accountMgr))
      .rejects.toThrow(AuthorizationError);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('account_manager CANNOT create another account_manager', async () => {
    await expect(createUser({ ...baseInput, role: 'account_manager' }, accountMgr))
      .rejects.toThrow(AuthorizationError);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('userManagementService.updateUserStates', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes states to default_filters preserving other keys', async () => {
    const updateSpy = jest.fn();
    mockFindByPk.mockResolvedValue({ id: 'u', role: 'manager', default_filters: { other: 'keep me' }, update: updateSpy });

    await updateUserStates('u', ['TX', 'IA'], admin);

    expect(updateSpy).toHaveBeenCalledWith({ default_filters: { other: 'keep me', states: ['TX', 'IA'] } });
  });

  it('normalizes input (uppercases, trims, dedupes)', async () => {
    const updateSpy = jest.fn();
    mockFindByPk.mockResolvedValue({ id: 'u', role: 'manager', default_filters: {}, update: updateSpy });

    await updateUserStates('u', ['tx', 'TX', ' ia '], admin);

    expect(updateSpy).toHaveBeenCalledWith({ default_filters: { states: ['TX', 'IA'] } });
  });

  it('accepts empty array (sees all)', async () => {
    const updateSpy = jest.fn();
    mockFindByPk.mockResolvedValue({ id: 'u', role: 'manager', default_filters: { states: ['TX'] }, update: updateSpy });

    await updateUserStates('u', [], admin);

    expect(updateSpy).toHaveBeenCalledWith({ default_filters: { states: [] } });
  });

  it('rejects an invalid state code', async () => {
    await expect(updateUserStates('u', ['Mars'], admin)).rejects.toThrow(ValidationError);
  });

  it('throws NotFoundError when user does not exist', async () => {
    mockFindByPk.mockResolvedValue(null);
    await expect(updateUserStates('missing', ['TX'], admin)).rejects.toThrow(NotFoundError);
  });

  it('account_manager CANNOT change states on an admin', async () => {
    mockFindByPk.mockResolvedValue({ id: 'admin-target', role: 'admin', default_filters: {}, update: jest.fn() });
    await expect(updateUserStates('admin-target', ['TX'], accountMgr)).rejects.toThrow(AuthorizationError);
  });

  it('account_manager CANNOT change states on another account_manager', async () => {
    mockFindByPk.mockResolvedValue({ id: 'amgr-target', role: 'account_manager', default_filters: {}, update: jest.fn() });
    await expect(updateUserStates('amgr-target', ['TX'], accountMgr)).rejects.toThrow(AuthorizationError);
  });

  it('account_manager CAN change states on a manager', async () => {
    const updateSpy = jest.fn();
    mockFindByPk.mockResolvedValue({ id: 'm', role: 'manager', default_filters: {}, update: updateSpy });
    await updateUserStates('m', ['TX'], accountMgr);
    expect(updateSpy).toHaveBeenCalled();
  });
});

describe('userManagementService.updateUserRole caller-role enforcement', () => {
  beforeEach(() => jest.clearAllMocks());

  it('admin can promote a manager to admin', async () => {
    const updateSpy = jest.fn();
    mockFindByPk.mockResolvedValue({ id: 'm', role: 'manager', update: updateSpy });
    await updateUserRole('m', 'admin', admin);
    expect(updateSpy).toHaveBeenCalledWith({ role: 'admin' });
  });

  it('account_manager can promote a user to manager', async () => {
    const updateSpy = jest.fn();
    mockFindByPk.mockResolvedValue({ id: 'u', role: 'user', update: updateSpy });
    await updateUserRole('u', 'manager', accountMgr);
    expect(updateSpy).toHaveBeenCalledWith({ role: 'manager' });
  });

  it('account_manager CANNOT promote anyone to admin', async () => {
    mockFindByPk.mockResolvedValue({ id: 'm', role: 'manager', update: jest.fn() });
    await expect(updateUserRole('m', 'admin', accountMgr)).rejects.toThrow(AuthorizationError);
  });

  it('account_manager CANNOT promote anyone to account_manager', async () => {
    mockFindByPk.mockResolvedValue({ id: 'm', role: 'manager', update: jest.fn() });
    await expect(updateUserRole('m', 'account_manager', accountMgr)).rejects.toThrow(AuthorizationError);
  });

  it('account_manager CANNOT change role on an admin', async () => {
    mockFindByPk.mockResolvedValue({ id: 'admin-target', role: 'admin', update: jest.fn() });
    await expect(updateUserRole('admin-target', 'manager', accountMgr)).rejects.toThrow(AuthorizationError);
  });

  it('account_manager CANNOT change role on another account_manager', async () => {
    mockFindByPk.mockResolvedValue({ id: 'amgr-target', role: 'account_manager', update: jest.fn() });
    await expect(updateUserRole('amgr-target', 'user', accountMgr)).rejects.toThrow(AuthorizationError);
  });

  it('caller cannot change their own role', async () => {
    mockFindByPk.mockResolvedValue({ id: admin.userId, role: 'admin', update: jest.fn() });
    await expect(updateUserRole(admin.userId, 'manager', admin)).rejects.toThrow(ValidationError);
  });
});

describe('userManagementService.updateUserStatus caller-role enforcement', () => {
  beforeEach(() => jest.clearAllMocks());

  it('admin can suspend a manager', async () => {
    const updateSpy = jest.fn();
    mockFindByPk.mockResolvedValue({ id: 'm', role: 'manager', update: updateSpy });
    await updateUserStatus('m', 'suspended', admin);
    expect(updateSpy).toHaveBeenCalledWith({ status: 'suspended' });
  });

  it('account_manager can suspend a user', async () => {
    const updateSpy = jest.fn();
    mockFindByPk.mockResolvedValue({ id: 'u', role: 'user', update: updateSpy });
    await updateUserStatus('u', 'suspended', accountMgr);
    expect(updateSpy).toHaveBeenCalledWith({ status: 'suspended' });
  });

  it('account_manager CANNOT suspend an admin', async () => {
    mockFindByPk.mockResolvedValue({ id: 'admin-target', role: 'admin', update: jest.fn() });
    await expect(updateUserStatus('admin-target', 'suspended', accountMgr)).rejects.toThrow(AuthorizationError);
  });

  it('caller cannot suspend their own account', async () => {
    mockFindByPk.mockResolvedValue({ id: admin.userId, role: 'admin', update: jest.fn() });
    await expect(updateUserStatus(admin.userId, 'suspended', admin)).rejects.toThrow(ValidationError);
  });
});
