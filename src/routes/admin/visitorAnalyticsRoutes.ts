import { Router, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { getVisitorDashboard, getTopPages } from '../../services/visitorAnalyticsService';

const router = Router();
router.use(authenticate);

router.get('/dashboard', authorize('analytics:read'), async (req, res: Response, next: NextFunction) => {
  try {
    const days = req.query.days ? Number(req.query.days) : 7;
    res.json(await getVisitorDashboard(days));
  } catch (e) { next(e); }
});

router.get('/top-pages', authorize('analytics:read'), async (req, res: Response, next: NextFunction) => {
  try {
    const days = req.query.days ? Number(req.query.days) : 7;
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    res.json({ pages: await getTopPages(days, limit) });
  } catch (e) { next(e); }
});

export default router;
