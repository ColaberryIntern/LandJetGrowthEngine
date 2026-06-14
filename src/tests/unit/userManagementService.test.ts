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

import { createUser, updateUserStates, normalizeStates } from '../../services/userManagementService';
import { User } from '../../models/User';
import { ValidationError, NotFoundError } from '../../middleware/errors';

const mockFindOne = User.findOne as jest.Mock;
const mockFindByPk = User.findByPk as jest.Mock;
const mockCreate = User.create as jest.Mock;

const adminId = 'admin-uuid-1';

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

    const result = await createUser({ ...baseInput, states: ['TX'] }, adminId);

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

    const result = await createUser(baseInput, adminId);
    expect((result.user as any).default_filters).toEqual({ states: [] });
  });

  it('accepts multiple states (Percy + Iowa example)', async () => {
    mockFindOne.mockResolvedValue(null);
    mockCreate.mockImplementation(async (attrs) => ({ id: 'u', ...attrs }));

    const result = await createUser({ ...baseInput, states: ['TX', 'IA'] }, adminId);
    expect((result.user as any).default_filters.states).toEqual(['TX', 'IA']);
  });

  it('normalizes email to lowercase + trim', async () => {
    mockFindOne.mockResolvedValue(null);
    mockCreate.mockImplementation(async (attrs) => ({ id: 'u', ...attrs }));

    await createUser({ ...baseInput, email: '  MiXeD@LandJet.COM  ' }, adminId);

    expect(mockFindOne).toHaveBeenCalledWith({ where: { email: 'mixed@landjet.com' } });
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ email: 'mixed@landjet.com' }));
  });

  it('rejects when email format is invalid', async () => {
    await expect(createUser({ ...baseInput, email: 'not-an-email' }, adminId))
      .rejects.toThrow(ValidationError);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects when email is missing', async () => {
    await expect(createUser({ ...baseInput, email: '' }, adminId))
      .rejects.toThrow(ValidationError);
  });

  it('rejects when first_name or last_name is missing', async () => {
    await expect(createUser({ ...baseInput, first_name: '' }, adminId))
      .rejects.toThrow(ValidationError);
    await expect(createUser({ ...baseInput, last_name: '' }, adminId))
      .rejects.toThrow(ValidationError);
  });

  it('rejects when role is not in the allowed list', async () => {
    await expect(createUser({ ...baseInput, role: 'superuser' as any }, adminId))
      .rejects.toThrow(ValidationError);
  });

  it('rejects when states contains an invalid code', async () => {
    await expect(createUser({ ...baseInput, states: ['TX', 'TEXAS'] }, adminId))
      .rejects.toThrow(/Invalid state code/);
  });

  it('rejects when email already exists (idempotency guard)', async () => {
    mockFindOne.mockResolvedValue({ id: 'existing', email: 'newperson@landjet.com' });
    await expect(createUser(baseInput, adminId))
      .rejects.toThrow(/already exists/);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('userManagementService.updateUserStates', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes states to default_filters preserving other keys', async () => {
    const updateSpy = jest.fn();
    mockFindByPk.mockResolvedValue({ id: 'u', default_filters: { other: 'keep me' }, update: updateSpy });

    await updateUserStates('u', ['TX', 'IA'], adminId);

    expect(updateSpy).toHaveBeenCalledWith({ default_filters: { other: 'keep me', states: ['TX', 'IA'] } });
  });

  it('normalizes input (uppercases, trims, dedupes)', async () => {
    const updateSpy = jest.fn();
    mockFindByPk.mockResolvedValue({ id: 'u', default_filters: {}, update: updateSpy });

    await updateUserStates('u', ['tx', 'TX', ' ia '], adminId);

    expect(updateSpy).toHaveBeenCalledWith({ default_filters: { states: ['TX', 'IA'] } });
  });

  it('accepts empty array (sees all)', async () => {
    const updateSpy = jest.fn();
    mockFindByPk.mockResolvedValue({ id: 'u', default_filters: { states: ['TX'] }, update: updateSpy });

    await updateUserStates('u', [], adminId);

    expect(updateSpy).toHaveBeenCalledWith({ default_filters: { states: [] } });
  });

  it('rejects an invalid state code', async () => {
    await expect(updateUserStates('u', ['Mars'], adminId)).rejects.toThrow(ValidationError);
  });

  it('throws NotFoundError when user does not exist', async () => {
    mockFindByPk.mockResolvedValue(null);
    await expect(updateUserStates('missing', ['TX'], adminId)).rejects.toThrow(NotFoundError);
  });
});
