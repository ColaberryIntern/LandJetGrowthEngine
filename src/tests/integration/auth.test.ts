import { createApp } from '../../app';
import express from 'express';
import http from 'http';

// Mock database and models
jest.mock('../../config/database', () => ({
  testConnection: jest.fn().mockResolvedValue(true),
  getSequelize: jest.fn(),
  closeConnection: jest.fn(),
}));

// Mock User model
const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'test@example.com',
  password_hash: '$2b$12$mockhashedpassword',
  first_name: 'Test',
  last_name: 'User',
  role: 'user',
  status: 'active',
  last_login_at: null,
  update: jest.fn(),
};

jest.mock('../../models/User', () => {
  const actual = jest.requireActual('../../models/User');
  return {
    ...actual,
    User: {
      findOne: jest.fn(),
      findByPk: jest.fn(),
      create: jest.fn(),
      init: jest.fn(),
    },
    initUserModel: jest.fn(() => ({
      findOne: jest.fn(),
      findByPk: jest.fn(),
      create: jest.fn(),
      init: jest.fn(),
    })),
  };
});

jest.mock('../../models/AuditLog', () => ({
  AuditLog: {
    create: jest.fn().mockResolvedValue({}),
    init: jest.fn(),
  },
  initAuditLogModel: jest.fn(() => ({
    create: jest.fn(),
    init: jest.fn(),
  })),
}));

jest.mock('../../models/SystemSetting', () => ({
  SystemSetting: { init: jest.fn() },
  initSystemSettingModel: jest.fn(() => ({ init: jest.fn() })),
}));

import { User } from '../../models/User';
import { AuditLog } from '../../models/AuditLog';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const mockedUserFindOne = User.findOne as jest.MockedFunction<typeof User.findOne>;
const mockedUserCreate = User.create as jest.MockedFunction<typeof User.create>;
const mockedUserFindByPk = User.findByPk as jest.MockedFunction<typeof User.findByPk>;

function makeRequest(
  app: express.Express,
  method: string,
  path: string,
  body?: object,
  headers?: Record<string, string>,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = (server.address() as { port: number }).port;
      const data = body ? JSON.stringify(body) : undefined;
      const options: http.RequestOptions = {
        hostname: 'localhost',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(headers || {}),
        },
      };

      const req = http.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => (responseData += chunk));
        res.on('end', () => {
          server.close();
          resolve({ status: res.statusCode!, body: responseData });
        });
      });

      req.on('error', (err) => {
        server.close();
        reject(err);
      });

      if (data) req.write(data);
      req.end();
    });
  });
}

describe('Auth Routes Integration', () => {
  let app: express.Express;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-integration-secret';
    process.env.JWT_EXPIRES_IN = '1h';
    app = createApp();
    jest.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user and return token', async () => {
      mockedUserFindOne.mockResolvedValue(null);
      mockedUserCreate.mockResolvedValue(mockUser as any);

      const res = await makeRequest(app, 'POST', '/api/auth/register', {
        email: 'new@example.com',
        password: 'SecurePass123!',
        first_name: 'New',
        last_name: 'User',
      });

      expect(res.status).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.user.email).toBe('test@example.com');
      expect(body.token).toBeDefined();
      expect(body.expiresIn).toBe('1h');
    });

    it('should return 409 if email already exists', async () => {
      mockedUserFindOne.mockResolvedValue(mockUser as any);

      const res = await makeRequest(app, 'POST', '/api/auth/register', {
        email: 'existing@example.com',
        password: 'SecurePass123!',
        first_name: 'Existing',
        last_name: 'User',
      });

      expect(res.status).toBe(409);
      const body = JSON.parse(res.body);
      expect(body.code).toBe('CONFLICT');
    });

    it('should return 400 for missing fields', async () => {
      const res = await makeRequest(app, 'POST', '/api/auth/register', {
        email: 'test@example.com',
      });

      expect(res.status).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for short password', async () => {
      mockedUserFindOne.mockResolvedValue(null);

      const res = await makeRequest(app, 'POST', '/api/auth/register', {
        email: 'test@example.com',
        password: 'short',
        first_name: 'Test',
        last_name: 'User',
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const hashedPassword = await bcrypt.hash('SecurePass123!', 12);
      const userWithHash = { ...mockUser, password_hash: hashedPassword };
      mockedUserFindOne.mockResolvedValue(userWithHash as any);

      const res = await makeRequest(app, 'POST', '/api/auth/login', {
        email: 'test@example.com',
        password: 'SecurePass123!',
      });

      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.token).toBeDefined();
      expect(body.user.email).toBe('test@example.com');
    });

    it('should return 401 for wrong password', async () => {
      const hashedPassword = await bcrypt.hash('CorrectPassword!', 12);
      const userWithHash = { ...mockUser, password_hash: hashedPassword };
      mockedUserFindOne.mockResolvedValue(userWithHash as any);

      const res = await makeRequest(app, 'POST', '/api/auth/login', {
        email: 'test@example.com',
        password: 'WrongPassword!',
      });

      expect(res.status).toBe(401);
    });

    it('should return 401 for non-existent user', async () => {
      mockedUserFindOne.mockResolvedValue(null);

      const res = await makeRequest(app, 'POST', '/api/auth/login', {
        email: 'nobody@example.com',
        password: 'anypassword1',
      });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/users/me', () => {
    it('should return user profile with valid token', async () => {
      const token = jwt.sign(
        { userId: mockUser.id, email: mockUser.email, role: mockUser.role },
        'test-integration-secret',
        { expiresIn: '1h' },
      );

      mockedUserFindByPk.mockResolvedValue(mockUser as any);

      const res = await makeRequest(app, 'GET', '/api/users/me', undefined, {
        Authorization: `Bearer ${token}`,
      });

      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.user).toBeDefined();
    });

    it('should return 401 without token', async () => {
      const res = await makeRequest(app, 'GET', '/api/users/me');
      expect(res.status).toBe(401);
    });

    it('should return 401 with invalid token', async () => {
      const res = await makeRequest(app, 'GET', '/api/users/me', undefined, {
        Authorization: 'Bearer invalid-token-here',
      });
      expect(res.status).toBe(401);
    });

    it('should return 401 with expired token', async () => {
      const token = jwt.sign(
        { userId: mockUser.id, email: mockUser.email, role: mockUser.role },
        'test-integration-secret',
        { expiresIn: '0s' },
      );

      const res = await makeRequest(app, 'GET', '/api/users/me', undefined, {
        Authorization: `Bearer ${token}`,
      });

      expect(res.status).toBe(401);
    });
  });
});
