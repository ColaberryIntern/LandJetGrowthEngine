import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { createStrategy, getStrategyById, listStrategies, updateStrategy, getStrategyStats } from '../../services/acquisitionStrategyService';
import { createAuditLog } from '../../services/auditLogService';

const router = Router();
router.use(authenticate);

router.get('/stats', authorize('campaigns:read'), async (_req, res, next) => {
  try { res.json(await getStrategyStats()); } catch (e) { next(e); }
});

router.get('/', authorize('campaigns:read'), async (req, res, next) => {
  try {
    const result = await listStrategies({
      status: req.query.status as string, channel: req.query.channel as string,
      limit: req.query.limit ? Number(req.query.limit) : 25,
      offset: req.query.offset ? Number(req.query.offset) : 0,
    });
    res.json({ strategies: result.rows, total: result.count });
  } catch (e) { next(e); }
});

router.get('/:id', authorize('campaigns:read'), async (req, res, next) => {
  try { res.json({ strategy: await getStrategyById(req.params.id as string) }); } catch (e) { next(e); }
});

router.post('/', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const strategy = await createStrategy({ ...req.body, owner_id: req.user!.userId });
    await createAuditLog({ userId: req.user!.userId, action: 'strategy.create', entityType: 'acquisition_strategy', entityId: strategy.id, newValue: { name: strategy.name, channel: strategy.channel }, ipAddress: req.ip || null });
    res.status(201).json({ strategy });
  } catch (e) { next(e); }
});

router.patch('/:id', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const strategy = await updateStrategy(req.params.id as string, req.body);
    await createAuditLog({ userId: req.user!.userId, action: 'strategy.update', entityType: 'acquisition_strategy', entityId: strategy.id, newValue: req.body, ipAddress: req.ip || null });
    res.json({ strategy });
  } catch (e) { next(e); }
});

export default router;
