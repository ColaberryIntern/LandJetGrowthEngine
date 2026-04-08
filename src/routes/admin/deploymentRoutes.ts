import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { createDeployment, getDeploymentById, listDeployments, updateDeploymentStatus, getDeploymentStats } from '../../services/deploymentService';
import { createAuditLog } from '../../services/auditLogService';

const router = Router();
router.use(authenticate);

router.get('/stats', authorize('campaigns:read'), async (_req, res, next) => {
  try { res.json(await getDeploymentStats()); } catch (e) { next(e); }
});
router.get('/', authorize('campaigns:read'), async (req, res, next) => {
  try {
    const r = await listDeployments({ environment: req.query.environment as string, status: req.query.status as string, limit: req.query.limit ? Number(req.query.limit) : 25, offset: req.query.offset ? Number(req.query.offset) : 0 });
    res.json({ deployments: r.rows, total: r.count });
  } catch (e) { next(e); }
});
router.get('/:id', authorize('campaigns:read'), async (req, res, next) => {
  try { res.json({ deployment: await getDeploymentById(req.params.id as string) }); } catch (e) { next(e); }
});
router.post('/', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const d = await createDeployment({ ...req.body, deployed_by: req.user!.userId });
    await createAuditLog({ userId: req.user!.userId, action: 'deployment.create', entityType: 'deployment', entityId: d.id, newValue: { version: d.version, env: d.environment }, ipAddress: req.ip || null });
    res.status(201).json({ deployment: d });
  } catch (e) { next(e); }
});
router.patch('/:id/status', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const d = await updateDeploymentStatus(req.params.id as string, req.body.status, { rollback_reason: req.body.rollback_reason });
    await createAuditLog({ userId: req.user!.userId, action: 'deployment.update_status', entityType: 'deployment', entityId: d.id, newValue: { status: req.body.status }, ipAddress: req.ip || null });
    res.json({ deployment: d });
  } catch (e) { next(e); }
});

export default router;
