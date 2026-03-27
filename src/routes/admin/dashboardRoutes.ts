import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { getCampaignMetrics } from '../../services/campaignAnalyticsService';

const router = Router();
router.use(authenticate);

router.get('/:id/analytics', authorize('analytics:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const metrics = await getCampaignMetrics(req.params.id as string);
    res.json({ metrics });
  } catch (error) { next(error); }
});

export default router;
