import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { createIntegration, getIntegrationById, listIntegrations, updateIntegration, getIntegrationStats } from '../../services/apiIntegrationService';
import { createAuditLog } from '../../services/auditLogService';

const router = Router();
router.use(authenticate);

router.get('/stats', authorize('campaigns:read'), async (_req, res, next) => {
  try { res.json(await getIntegrationStats()); } catch (e) { next(e); }
});
router.get('/', authorize('campaigns:read'), async (req, res, next) => {
  try {
    const r = await listIntegrations({ provider: req.query.provider as string, status: req.query.status as string, limit: req.query.limit ? Number(req.query.limit) : 25, offset: req.query.offset ? Number(req.query.offset) : 0 });
    res.json({ integrations: r.rows, total: r.count });
  } catch (e) { next(e); }
});
router.get('/:id', authorize('campaigns:read'), async (req, res, next) => {
  try { res.json({ integration: await getIntegrationById(req.params.id as string) }); } catch (e) { next(e); }
});
router.post('/', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const i = await createIntegration(req.body);
    await createAuditLog({ userId: req.user!.userId, action: 'integration.create', entityType: 'api_integration', entityId: i.id, newValue: { name: i.name, provider: i.provider }, ipAddress: req.ip || null });
    res.status(201).json({ integration: i });
  } catch (e) { next(e); }
});
router.patch('/:id', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const i = await updateIntegration(req.params.id as string, req.body);
    await createAuditLog({ userId: req.user!.userId, action: 'integration.update', entityType: 'api_integration', entityId: i.id, newValue: req.body, ipAddress: req.ip || null });
    res.json({ integration: i });
  } catch (e) { next(e); }
});

export default router;
