import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { recordMetric, listMetrics, getPerformanceStats } from '../../services/performanceService';
import { getPerformanceSummary } from '../../middleware/requestTiming';
import { logger } from '../../config/logger';

const router = Router();
router.use(authenticate);

router.get('/stats', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await getPerformanceStats());
  } catch (e) {
    logger.error('GET /performance/stats failed', { error: (e as Error).message });
    next(e);
  }
});

router.get('/requests', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(getPerformanceSummary());
  } catch (e) {
    logger.error('GET /performance/requests failed', { error: (e as Error).message });
    next(e);
  }
});

router.get('/', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const r = await listMetrics({
      category: req.query.category as string, status: req.query.status as string,
      metric_name: req.query.metric_name as string, from: req.query.from as string,
      limit: req.query.limit ? Number(req.query.limit) : 50, offset: req.query.offset ? Number(req.query.offset) : 0,
    });
    res.json({ metrics: r.rows, total: r.count });
  } catch (e) {
    logger.error('GET /performance failed', { error: (e as Error).message });
    next(e);
  }
});

router.post('/', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const metric = await recordMetric(req.body);
    res.status(201).json({ metric });
  } catch (e) {
    logger.error('POST /performance failed', { error: (e as Error).message, body: { category: req.body.category, metric_name: req.body.metric_name } });
    next(e);
  }
});

export default router;
