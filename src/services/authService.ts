import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { ValidationError, AuthenticationError, ConflictError } from '../middleware/errors';
import { JwtPayload } from '../middleware/auth';

const SALT_ROUNDS = 12;

export interface RegisterInput {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role?: 'admin' | 'manager' | 'user';
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
  };
  token: string;
  expiresIn: string;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  return secret;
}

function getJwtExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN || '1h';
}

function generateToken(user: User): string {
  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: getJwtExpiresIn() as any,
  });
}

function formatUserResponse(user: User) {
  return {
    id: user.id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    role: user.role,
  };
}

export async function register(input: RegisterInput): Promise<AuthResponse> {
  if (!input.email || !input.password || !input.first_name || !input.last_name) {
    throw new ValidationError('Email, password, first_name, and last_name are required');
  }

  if (input.password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters');
  }

  const existing = await User.findOne({ where: { email: input.email.toLowerCase() } });
  if (existing) {
    throw new ConflictError('Email already registered');
  }

  const password_hash = await bcrypt.hash(input.password, SALT_ROUNDS);

  const user = await User.create({
    email: input.email.toLowerCase(),
    password_hash,
    first_name: input.first_name,
    last_name: input.last_name,
    role: input.role || 'user',
    status: 'active',
  });

  const token = generateToken(user);

  return {
    user: formatUserResponse(user),
    token,
    expiresIn: getJwtExpiresIn(),
  };
}

export async function login(input: LoginInput): Promise<AuthResponse> {
  if (!input.email || !input.password) {
    throw new ValidationError('Email and password are required');
  }

  const user = await User.findOne({ where: { email: input.email.toLowerCase() } });
  if (!user) {
    throw new AuthenticationError('Invalid email or password');
  }

  if (user.status !== 'active') {
    throw new AuthenticationError('Account is not active');
  }

  const isValid = await bcrypt.compare(input.password, user.password_hash);
  if (!isValid) {
    throw new AuthenticationError('Invalid email or password');
  }

  await user.update({ last_login_at: new Date() });

  const token = generateToken(user);

  return {
    user: formatUserResponse(user),
    token,
    expiresIn: getJwtExpiresIn(),
  };
}

export async function refreshToken(userId: string): Promise<AuthResponse> {
  const user = await User.findByPk(userId);
  if (!user || user.status !== 'active') {
    throw new AuthenticationError('Invalid user');
  }

  const token = generateToken(user);

  return {
    user: formatUserResponse(user),
    token,
    expiresIn: getJwtExpiresIn(),
  };
}

export async function getUserById(userId: string) {
  const user = await User.findByPk(userId, {
    attributes: { exclude: ['password_hash'] },
  });
  if (!user) return null;
  return user;
}
