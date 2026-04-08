import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { listErrors, getErrorById, resolveError, getErrorStats } from '../../services/errorTrackingService';
import { createAuditLog } from '../../services/auditLogService';

const router = Router();
router.use(authenticate);

router.get('/stats', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await getErrorStats();
    res.json(stats);
  } catch (error) { next(error); }
});

router.get('/', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await listErrors({
      campaign_id: req.query.campaign_id as string,
      severity: req.query.severity as string,
      component: req.query.component as string,
      resolved: req.query.resolved as string,
      limit: req.query.limit ? Number(req.query.limit) : 25,
      offset: req.query.offset ? Number(req.query.offset) : 0,
    });
    res.json({ errors: result.rows, total: result.count });
  } catch (error) { next(error); }
});

router.get('/:id', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const err = await getErrorById(req.params.id as string);
    res.json({ error: err });
  } catch (error) { next(error); }
});

router.patch('/:id/resolve', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const err = await resolveError(req.params.id as string, req.user!.userId);
    await createAuditLog({
      userId: req.user!.userId,
      action: 'error.resolve',
      entityType: 'campaign_error',
      entityId: err.id,
      newValue: { resolved: true },
      ipAddress: req.ip || null,
    });
    res.json({ error: err });
  } catch (error) { next(error); }
});

export default router;
