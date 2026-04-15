import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { createDecision, getDecisionById, listDecisions, updateDecisionStatus, getDecisionStats } from '../../services/intelligenceDecisionService';
import { createAuditLog } from '../../services/auditLogService';
import { requireGovernance } from '../../middleware/governanceCheck';
import { logger } from '../../config/logger';

const router = Router();
router.use(authenticate);

router.get('/stats', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await getDecisionStats();
    res.json(stats);
  } catch (e) {
    logger.error('Decision route error', { error: (e as Error).message });
    next(e);
  }
});

router.get('/', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await listDecisions({
      execution_status: req.query.execution_status as string,
      risk_tier: req.query.risk_tier as string,
      recommended_action: req.query.recommended_action as string,
      limit: req.query.limit ? Number(req.query.limit) : 25,
      offset: req.query.offset ? Number(req.query.offset) : 0,
    });
    res.json({ decisions: result.rows, total: result.count });
  } catch (e) {
    logger.error('Decision route error', { error: (e as Error).message });
    next(e);
  }
});

router.get('/:id', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const decision = await getDecisionById(req.params.id as string);
    res.json({ decision });
  } catch (e) {
    logger.error('Decision route error', { error: (e as Error).message });
    next(e);
  }
});

router.post('/', authorize('campaigns:write'), requireGovernance(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const decision = await createDecision(req.body);
    await createAuditLog({
      userId: req.user!.userId,
      action: 'decision.create',
      entityType: 'intelligence_decision',
      entityId: decision.decision_id,
      newValue: { action: decision.recommended_action, risk_tier: decision.risk_tier, confidence: decision.confidence_score },
      ipAddress: req.ip || null,
    });
    res.status(201).json({ decision });
  } catch (e) {
    logger.error('Decision route error', { error: (e as Error).message });
    next(e);
  }
});

router.patch('/:id/status', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const decision = await updateDecisionStatus(req.params.id as string, req.body.status, {
      executed_by: req.user!.userId,
      after_state: req.body.after_state,
      reasoning: req.body.reasoning,
    });
    await createAuditLog({
      userId: req.user!.userId,
      action: 'decision.status_update',
      entityType: 'intelligence_decision',
      entityId: decision.decision_id,
      newValue: { status: req.body.status },
      ipAddress: req.ip || null,
    });
    res.json({ decision });
  } catch (e) {
    logger.error('Decision route error', { error: (e as Error).message });
    next(e);
  }
});

export default router;
