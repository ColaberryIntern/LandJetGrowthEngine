import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface EnvironmentConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export function loadConfig(): EnvironmentConfig {
  return {
    nodeEnv: getEnv('NODE_ENV', 'development'),
    port: parseInt(getEnv('PORT', '3000'), 10),
    databaseUrl: requireEnv('DATABASE_URL'),
    jwtSecret: requireEnv('JWT_SECRET'),
    jwtExpiresIn: getEnv('JWT_EXPIRES_IN', '1h'),
  };
}

let _config: EnvironmentConfig | null = null;

export function getConfig(): EnvironmentConfig {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}

export function isProduction(): boolean {
  return getConfig().nodeEnv === 'production';
}

export function isTest(): boolean {
  return getConfig().nodeEnv === 'test';
}
