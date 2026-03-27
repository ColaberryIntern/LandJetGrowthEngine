import { Router, Request, Response, NextFunction } from 'express';
import { register, login, refreshToken } from '../services/authService';
import { authenticate } from '../middleware/auth';
import { createAuditLog } from '../services/auditLogService';
import { authLimiter } from '../middleware/rateLimiter';

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

export default router;
