import { Router, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { getCapacityReport } from '../../services/capacityPlanningService';

const router = Router();
router.use(authenticate);

router.get('/', authorize('analytics:read'), async (_req, res: Response, next: NextFunction) => {
  try { res.json(await getCapacityReport()); } catch (e) { next(e); }
});

export default router;
