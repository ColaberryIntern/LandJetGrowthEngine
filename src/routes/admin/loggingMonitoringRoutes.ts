import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { listAuditLogs, getAuditLogById, getAuditStats } from '../../services/loggingMonitoringService';

const router = Router();
router.use(authenticate);

router.get('/stats', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await getAuditStats();
    res.json(stats);
  } catch (error) { next(error); }
});

router.get('/', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await listAuditLogs({
      user_id: req.query.user_id as string,
      action: req.query.action as string,
      entity_type: req.query.entity_type as string,
      from: req.query.from as string,
      to: req.query.to as string,
      limit: req.query.limit ? Number(req.query.limit) : 50,
      offset: req.query.offset ? Number(req.query.offset) : 0,
    });
    res.json({ logs: result.rows, total: result.count });
  } catch (error) { next(error); }
});

router.get('/:id', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const log = await getAuditLogById(req.params.id as string);
    res.json({ log });
  } catch (error) { next(error); }
});

export default router;
