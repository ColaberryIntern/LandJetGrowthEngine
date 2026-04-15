import { Router, Request, Response, NextFunction } from 'express';
import { register, login, refreshToken } from '../services/authService';
import { authenticate } from '../middleware/auth';
import { createAuditLog } from '../services/auditLogService';
import { authLimiter } from '../middleware/rateLimiter';
import { User } from '../models/User';
import { NotFoundError, ValidationError } from '../middleware/errors';
import { logger } from '../config/logger';

const router = Router();

router.post(
  '/register',
  authLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await register(req.body);

      await createAuditLog({
        userId: result.user.id,
        action: 'user.register',
        entityType: 'user',
        entityId: result.user.id,
        newValue: { email: result.user.email, role: result.user.role },
        ipAddress: req.ip || null,
      });

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/login',
  authLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await login(req.body);

      await createAuditLog({
        userId: result.user.id,
        action: 'user.login',
        entityType: 'user',
        entityId: result.user.id,
        ipAddress: req.ip || null,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/refresh',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await refreshToken(req.user!.userId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

// Email verification: user clicks verification link with token
router.get(
  '/verify-email',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token } = req.query;
      if (!token || typeof token !== 'string') {
        throw new ValidationError('Verification token is required');
      }

      const user = await User.findOne({ where: { verification_token: token } });
      if (!user) {
        throw new NotFoundError('Invalid or expired verification token');
      }

      if (user.email_verified) {
        return res.json({ message: 'Email already verified', verified: true });
      }

      await user.update({ email_verified: true, verification_token: null });

      await createAuditLog({
        userId: user.id,
        action: 'user.verify_email',
        entityType: 'user',
        entityId: user.id,
        newValue: { email_verified: true },
        ipAddress: req.ip || null,
      });

      logger.info('Email verified', { userId: user.id, email: user.email });
      res.json({ message: 'Email verified successfully', verified: true });
    } catch (error) {
      logger.error('Email verification failed', { error: (error as Error).message });
      next(error);
    }
  },
);

export default router;
