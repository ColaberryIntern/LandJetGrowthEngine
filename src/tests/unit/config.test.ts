// Prevent dotenv from loading .env file during tests
jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

describe('Environment Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    // Create a clean env without the .env file values
    process.env = {};
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should throw if DATABASE_URL is missing', () => {
    const { loadConfig } = require('../../config/environment');
    expect(() => loadConfig()).toThrow('Missing required environment variable: DATABASE_URL');
  });

  it('should throw if JWT_SECRET is missing', () => {
    process.env.DATABASE_URL = 'postgres://localhost:5432/test';
    const { loadConfig } = require('../../config/environment');
    expect(() => loadConfig()).toThrow('Missing required environment variable: JWT_SECRET');
  });

  it('should load config with all required vars present', () => {
    process.env.DATABASE_URL = 'postgres://localhost:5432/test';
    process.env.JWT_SECRET = 'test-secret';
    process.env.PORT = '4000';
    process.env.NODE_ENV = 'test';

    const { loadConfig } = require('../../config/environment');
    const config = loadConfig();

    expect(config.databaseUrl).toBe('postgres://localhost:5432/test');
    expect(config.jwtSecret).toBe('test-secret');
    expect(config.port).toBe(4000);
    expect(config.nodeEnv).toBe('test');
  });

  it('should use default values when optional vars are missing', () => {
    process.env.DATABASE_URL = 'postgres://localhost:5432/test';
    process.env.JWT_SECRET = 'test-secret';
    delete process.env.PORT;
    delete process.env.NODE_ENV;

    const { loadConfig } = require('../../config/environment');
    const config = loadConfig();

    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe('development');
    expect(config.jwtExpiresIn).toBe('1h');
  });
});
