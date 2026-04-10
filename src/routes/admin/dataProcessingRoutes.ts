import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { createPipeline, updatePipelineStatus, listPipelines, getPipelineStats } from '../../services/dataProcessingService';
import { createAuditLog } from '../../services/auditLogService';

const router = Router();
router.use(authenticate);

router.get('/stats', authorize('campaigns:read'), async (_req, res, next) => {
  try { res.json(await getPipelineStats()); } catch (e) { next(e); }
});
router.get('/', authorize('campaigns:read'), async (req, res, next) => {
  try {
    const r = await listPipelines({ source: req.query.source as string, status: req.query.status as string, limit: req.query.limit ? Number(req.query.limit) : 25, offset: req.query.offset ? Number(req.query.offset) : 0 });
    res.json({ pipelines: r.rows, total: r.count });
  } catch (e) { next(e); }
});
router.post('/', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const p = await createPipeline(req.body);
    await createAuditLog({ userId: req.user!.userId, action: 'etl.create', entityType: 'etl_pipeline', entityId: p.id, newValue: { name: p.name, source: p.source }, ipAddress: req.ip || null });
    res.status(201).json({ pipeline: p });
  } catch (e) { next(e); }
});
router.patch('/:id/status', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const p = await updatePipelineStatus(req.params.id as string, req.body.status, req.body);
    res.json({ pipeline: p });
  } catch (e) { next(e); }
});

export default router;
