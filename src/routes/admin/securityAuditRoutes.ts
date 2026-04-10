import { Router, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { runSecurityAudit } from '../../services/securityAuditService';

const router = Router();
router.use(authenticate);

router.get('/', authorize('campaigns:read'), async (_req, res: Response, next: NextFunction) => {
  try { res.json(await runSecurityAudit()); } catch (e) { next(e); }
});

export default router;
