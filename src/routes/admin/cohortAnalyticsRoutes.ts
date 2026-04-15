import { Router, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import {
  getRetentionByCohort, getEngagementMetrics,
  getConversionMetrics, getEngagementSegments,
} from '../../services/cohortAnalyticsService';
import { logger } from '../../config/logger';

const router = Router();
router.use(authenticate);

router.get('/retention', authorize('campaigns:read'), async (_req, res: Response, next: NextFunction) => {
  try {
    const cohorts = await getRetentionByCohort();
    res.json({ cohorts });
  } catch (e) {
    logger.error('GET /analytics/retention failed', { error: (e as Error).message });
    next(e);
  }
});

router.get('/engagement', authorize('campaigns:read'), async (_req, res: Response, next: NextFunction) => {
  try {
    const metrics = await getEngagementMetrics();
    res.json(metrics);
  } catch (e) {
    logger.error('GET /analytics/engagement failed', { error: (e as Error).message });
    next(e);
  }
});

router.get('/conversions', authorize('campaigns:read'), async (_req, res: Response, next: NextFunction) => {
  try {
    const metrics = await getConversionMetrics();
    res.json(metrics);
  } catch (e) {
    logger.error('GET /analytics/conversions failed', { error: (e as Error).message });
    next(e);
  }
});

router.get('/segments', authorize('campaigns:read'), async (_req, res: Response, next: NextFunction) => {
  try {
    const segments = await getEngagementSegments();
    res.json(segments);
  } catch (e) {
    logger.error('GET /analytics/segments failed', { error: (e as Error).message });
    next(e);
  }
});

export default router;
