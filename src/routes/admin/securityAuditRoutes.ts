import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { runSecurityAudit } from '../../services/securityAuditService';
import { logger } from '../../config/logger';

const router = Router();
router.use(authenticate);

router.get('/', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info('Security audit requested', { userId: req.user?.userId });
    const result = await runSecurityAudit();
    res.json(result);
  } catch (e) {
    logger.error('GET /security-audit failed', { error: (e as Error).message, userId: req.user?.userId });
    next(e);
  }
});

export default router;
