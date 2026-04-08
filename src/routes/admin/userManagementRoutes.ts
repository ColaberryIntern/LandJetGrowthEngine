import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import {
  listUsers, getUserDetail, updateUserRole,
  updateUserStatus, getUserStats,
} from '../../services/userManagementService';
import { createAuditLog } from '../../services/auditLogService';

const router = Router();
router.use(authenticate);

router.get('/stats', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await getUserStats();
    res.json(stats);
  } catch (error) { next(error); }
});

router.get('/', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await listUsers({
      role: req.query.role as string,
      status: req.query.status as string,
      search: req.query.search as string,
      limit: req.query.limit ? Number(req.query.limit) : 25,
      offset: req.query.offset ? Number(req.query.offset) : 0,
    });
    res.json({ users: result.rows, total: result.count });
  } catch (error) { next(error); }
});

router.get('/:id', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await getUserDetail(req.params.id as string);
    res.json(result);
  } catch (error) { next(error); }
});

router.patch('/:id/role', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await updateUserRole(req.params.id as string, req.body.role, req.user!.userId);
    await createAuditLog({
      userId: req.user!.userId,
      action: 'user.update_role',
      entityType: 'user',
      entityId: user.id,
      newValue: { role: req.body.role },
      ipAddress: req.ip || null,
    });
    res.json({ user });
  } catch (error) { next(error); }
});

router.patch('/:id/status', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await updateUserStatus(req.params.id as string, req.body.status, req.user!.userId);
    await createAuditLog({
      userId: req.user!.userId,
      action: 'user.update_status',
      entityType: 'user',
      entityId: user.id,
      newValue: { status: req.body.status },
      ipAddress: req.ip || null,
    });
    res.json({ user });
  } catch (error) { next(error); }
});

export default router;
