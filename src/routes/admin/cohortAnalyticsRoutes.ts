import { Router, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import {
  getRetentionByCohort, getEngagementMetrics,
  getConversionMetrics, getEngagementSegments,
} from '../../services/cohortAnalyticsService';

const router = Router();
router.use(authenticate);

router.get('/retention', authorize('campaigns:read'), async (_req, res: Response, next: NextFunction) => {
  try { res.json({ cohorts: await getRetentionByCohort() }); } catch (e) { next(e); }
});

router.get('/engagement', authorize('campaigns:read'), async (_req, res: Response, next: NextFunction) => {
  try { res.json(await getEngagementMetrics()); } catch (e) { next(e); }
});

router.get('/conversions', authorize('campaigns:read'), async (_req, res: Response, next: NextFunction) => {
  try { res.json(await getConversionMetrics()); } catch (e) { next(e); }
});

router.get('/segments', authorize('campaigns:read'), async (_req, res: Response, next: NextFunction) => {
  try { res.json(await getEngagementSegments()); } catch (e) { next(e); }
});

export default router;
