import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { listRoles, getRoleDetail, getRoleAssignmentStats, auditPermissions } from '../../services/roleManagementService';
import { logger } from '../../config/logger';

const router = Router();
router.use(authenticate);

router.get('/', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ roles: listRoles() });
  } catch (e) {
    logger.error('GET /roles failed', { error: (e as Error).message });
    next(e);
  }
});

router.get('/stats', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await getRoleAssignmentStats());
  } catch (e) {
    logger.error('GET /roles/stats failed', { error: (e as Error).message });
    next(e);
  }
});

router.get('/audit', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await auditPermissions());
  } catch (e) {
    logger.error('GET /roles/audit failed', { error: (e as Error).message });
    next(e);
  }
});

router.get('/:name', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const role = getRoleDetail(req.params.name as string);
    res.json({ role });
  } catch (e) {
    logger.error('GET /roles/:name failed', { name: req.params.name, error: (e as Error).message });
    next(e);
  }
});

export default router;
