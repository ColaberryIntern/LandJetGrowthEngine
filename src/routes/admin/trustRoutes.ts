import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { getTrustOverview } from '../../services/trustDashboardService';

const router = Router();
router.use(authenticate);

// Trust Command Center aggregates (read-only). See docs/trust-audit/.
router.get('/overview', authorize('analytics:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await getTrustOverview());
  } catch (error) { next(error); }
});

export default router;
