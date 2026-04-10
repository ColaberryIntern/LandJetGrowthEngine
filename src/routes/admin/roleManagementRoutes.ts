import { Router, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { listRoles, getRoleDetail, getRoleAssignmentStats, auditPermissions } from '../../services/roleManagementService';

const router = Router();
router.use(authenticate);

// List all roles with permissions
router.get('/', authorize('campaigns:read'), async (_req, res: Response, next: NextFunction) => {
  try { res.json({ roles: listRoles() }); } catch (e) { next(e); }
});

// Get role assignment stats (user count per role)
router.get('/stats', authorize('campaigns:read'), async (_req, res: Response, next: NextFunction) => {
  try { res.json(await getRoleAssignmentStats()); } catch (e) { next(e); }
});

// Run permission audit
router.get('/audit', authorize('campaigns:read'), async (_req, res: Response, next: NextFunction) => {
  try { res.json(await auditPermissions()); } catch (e) { next(e); }
});

// Get specific role detail
router.get('/:name', authorize('campaigns:read'), async (req, res: Response, next: NextFunction) => {
  try {
    const role = getRoleDetail(req.params.name);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    res.json({ role });
  } catch (e) { next(e); }
});

export default router;
