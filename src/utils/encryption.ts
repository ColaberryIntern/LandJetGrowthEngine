import crypto from 'crypto';
import { ValidationError } from '../middleware/errors';
import { logger } from '../config/logger';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || '';
  if (!key) {
    throw new Error('No encryption key configured. Set ENCRYPTION_KEY or JWT_SECRET.');
  }
  // Derive a 32-byte key from the secret using SHA-256
  return crypto.createHash('sha256').update(key).digest();
}

/**
 * Encrypt sensitive data before database storage.
 * Returns a base64 string containing IV + auth tag + ciphertext.
 */
export function encryptData(plaintext: string): string {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new ValidationError('Data to encrypt must be a non-empty string');
  }

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Concatenate IV + authTag + ciphertext, separated by dots
    const result = `${iv.toString('base64')}.${authTag.toString('base64')}.${encrypted}`;
    return result;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    logger.error('Encryption failed', { error: (error as Error).message });
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt data retrieved from database storage.
 */
export function decryptData(encryptedData: string): string {
  if (!encryptedData || typeof encryptedData !== 'string') {
    throw new ValidationError('Encrypted data must be a non-empty string');
  }

  const parts = encryptedData.split('.');
  if (parts.length !== 3) {
    throw new ValidationError('Invalid encrypted data format');
  }

  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const ciphertext = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    logger.error('Decryption failed', { error: (error as Error).message });
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Hash data for non-reversible storage (e.g., tokens, identifiers).
 */
export function hashData(data: string): string {
  if (!data || typeof data !== 'string') {
    throw new ValidationError('Data to hash must be a non-empty string');
  }
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Generate a secure random token (e.g., for verification links).
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}
