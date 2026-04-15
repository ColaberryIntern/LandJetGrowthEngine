import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { getCapacityReport, getResourceConfig, updateResourceConfig } from '../../services/capacityPlanningService';
import { createAuditLog } from '../../services/auditLogService';

const router = Router();
router.use(authenticate);

router.get('/', authorize('analytics:read'), async (_req, res: Response, next: NextFunction) => {
  try { res.json(await getCapacityReport()); } catch (e) { next(e); }
});

router.get('/resources', authorize('analytics:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await getResourceConfig();
    res.json(config);
  } catch (e) { next(e); }
});

router.post('/resources', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await updateResourceConfig(req.body);
    await createAuditLog({
      userId: req.user!.userId,
      action: 'resource.update',
      entityType: 'resource_config',
      entityId: 'scheduler',
      newValue: req.body,
      ipAddress: req.ip || null,
    });
    res.json(config);
  } catch (e) { next(e); }
});

export default router;
