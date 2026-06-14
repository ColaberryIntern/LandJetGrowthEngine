import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import {
  listUsers, getUserDetail, updateUserRole,
  updateUserStatus, updateUserStates, createUser, getUserStats,
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

router.post('/', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user, tempPassword } = await createUser(req.body, req.user!.userId);
    await createAuditLog({
      userId: req.user!.userId,
      action: 'user.create',
      entityType: 'user',
      entityId: user.id,
      newValue: { email: user.email, role: user.role, default_filters: user.default_filters },
      ipAddress: req.ip || null,
    });
    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        status: user.status,
        default_filters: user.default_filters,
        created_at: user.created_at,
      },
      temp_password: tempPassword,
    });
  } catch (error) { next(error); }
});

// PATCH /:id/states accepts { states: ["TX", "IA"] } and writes to default_filters.states.
// 2026-06-14 refactor: replaces the old /:id/territory enum-based endpoint.
router.patch('/:id/states', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await updateUserStates(req.params.id as string, req.body.states, req.user!.userId);
    await createAuditLog({
      userId: req.user!.userId,
      action: 'user.update_states',
      entityType: 'user',
      entityId: user.id,
      newValue: { states: (user.default_filters as Record<string, unknown>)?.states },
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
