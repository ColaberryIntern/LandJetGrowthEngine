import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { createPipeline, updatePipelineStatus, listPipelines, getPipelineStats } from '../../services/dataProcessingService';
import { createAuditLog } from '../../services/auditLogService';
import { logger } from '../../config/logger';

const router = Router();
router.use(authenticate);

router.get('/stats', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await getPipelineStats();
    res.json(stats);
  } catch (e) {
    logger.error('Failed to get pipeline stats', { error: (e as Error).message });
    next(e);
  }
});

router.get('/', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const r = await listPipelines({
      source: req.query.source as string,
      status: req.query.status as string,
      limit: req.query.limit ? Number(req.query.limit) : 25,
      offset: req.query.offset ? Number(req.query.offset) : 0,
    });
    res.json({ pipelines: r.rows, total: r.count });
  } catch (e) {
    logger.error('Failed to list pipelines', { error: (e as Error).message });
    next(e);
  }
});

router.post('/', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const p = await createPipeline(req.body);
    await createAuditLog({
      userId: req.user!.userId,
      action: 'etl.create',
      entityType: 'etl_pipeline',
      entityId: p.id,
      newValue: { name: p.name, source: p.source },
      ipAddress: req.ip || null,
    });
    res.status(201).json({ pipeline: p });
  } catch (e) {
    logger.error('Failed to create pipeline', { error: (e as Error).message, body: req.body });
    next(e);
  }
});

router.patch('/:id/status', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const oldStatus = req.body._old_status; // optional for audit
    const p = await updatePipelineStatus(req.params.id as string, req.body.status, req.body);
    await createAuditLog({
      userId: req.user!.userId,
      action: 'etl.status_update',
      entityType: 'etl_pipeline',
      entityId: p.id,
      newValue: { status: req.body.status, records_loaded: req.body.records_loaded },
      ipAddress: req.ip || null,
    });
    res.json({ pipeline: p });
  } catch (e) {
    logger.error('Failed to update pipeline status', { id: req.params.id, error: (e as Error).message });
    next(e);
  }
});

export default router;
