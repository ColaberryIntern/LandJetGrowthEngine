import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import {
  createRequirement,
  getRequirementById,
  listRequirements,
  updateRequirement,
  categorizeRequirement,
  bulkUpdateStatus,
  getRequirementStats,
} from '../../services/uncategorizedRequirementsService';
import { createAuditLog } from '../../services/auditLogService';

const router = Router();
router.use(authenticate);

router.get('/stats', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await getRequirementStats();
    res.json(stats);
  } catch (error) { next(error); }
});

router.get('/', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await listRequirements({
      status: req.query.status as string,
      priority: req.query.priority as string,
      search: req.query.search as string,
      assigned_capability: req.query.assigned_capability as string,
      limit: req.query.limit ? Number(req.query.limit) : 25,
      offset: req.query.offset ? Number(req.query.offset) : 0,
    });
    res.json({ requirements: result.rows, total: result.count });
  } catch (error) { next(error); }
});

router.get('/:id', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requirement = await getRequirementById(req.params.id as string);
    res.json({ requirement });
  } catch (error) { next(error); }
});

router.post('/', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requirement = await createRequirement(req.body);
    await createAuditLog({
      userId: req.user!.userId,
      action: 'requirement.create',
      entityType: 'uncategorized_requirement',
      entityId: requirement.id,
      newValue: { title: requirement.title },
      ipAddress: req.ip || null,
    });
    res.status(201).json({ requirement });
  } catch (error) { next(error); }
});

router.patch('/:id', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requirement = await updateRequirement(req.params.id as string, req.body);
    await createAuditLog({
      userId: req.user!.userId,
      action: 'requirement.update',
      entityType: 'uncategorized_requirement',
      entityId: requirement.id,
      newValue: req.body,
      ipAddress: req.ip || null,
    });
    res.json({ requirement });
  } catch (error) { next(error); }
});

router.patch('/:id/categorize', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requirement = await categorizeRequirement(
      req.params.id as string,
      req.body.capability,
      req.user!.userId,
    );
    await createAuditLog({
      userId: req.user!.userId,
      action: 'requirement.categorize',
      entityType: 'uncategorized_requirement',
      entityId: requirement.id,
      newValue: { capability: req.body.capability },
      ipAddress: req.ip || null,
    });
    res.json({ requirement });
  } catch (error) { next(error); }
});

router.post('/bulk-status', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids, status } = req.body;
    const result = await bulkUpdateStatus(ids, status, req.user!.userId);
    await createAuditLog({
      userId: req.user!.userId,
      action: 'requirement.bulk_status',
      entityType: 'uncategorized_requirement',
      entityId: ids.join(','),
      newValue: { status, count: result.updated },
      ipAddress: req.ip || null,
    });
    res.json(result);
  } catch (error) { next(error); }
});

export default router;
