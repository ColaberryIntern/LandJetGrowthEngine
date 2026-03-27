import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

describe('Auth Utilities', () => {
  const JWT_SECRET = 'test-secret-key';

  describe('JWT Token', () => {
    it('should generate and verify a valid token', () => {
      const payload = { userId: '123', email: 'test@test.com', role: 'user' };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

      const decoded = jwt.verify(token, JWT_SECRET) as typeof payload;
      expect(decoded.userId).toBe('123');
      expect(decoded.email).toBe('test@test.com');
      expect(decoded.role).toBe('user');
    });

    it('should reject token with wrong secret', () => {
      const token = jwt.sign({ userId: '123' }, JWT_SECRET);
      expect(() => jwt.verify(token, 'wrong-secret')).toThrow();
    });

    it('should reject expired token', () => {
      const token = jwt.sign({ userId: '123' }, JWT_SECRET, { expiresIn: '0s' });
      // Small delay to ensure expiration
      expect(() => jwt.verify(token, JWT_SECRET)).toThrow(jwt.TokenExpiredError);
    });
  });

  describe('Password Hashing', () => {
    it('should hash and verify a password', async () => {
      const password = 'SecurePassword123!';
      const hash = await bcrypt.hash(password, 12);

      expect(hash).not.toBe(password);
      expect(await bcrypt.compare(password, hash)).toBe(true);
      expect(await bcrypt.compare('wrong-password', hash)).toBe(false);
    });

    it('should produce different hashes for same password', async () => {
      const password = 'SecurePassword123!';
      const hash1 = await bcrypt.hash(password, 12);
      const hash2 = await bcrypt.hash(password, 12);

      expect(hash1).not.toBe(hash2);
      // Both should still verify
      expect(await bcrypt.compare(password, hash1)).toBe(true);
      expect(await bcrypt.compare(password, hash2)).toBe(true);
    });
  });
});
