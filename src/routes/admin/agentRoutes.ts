import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { registerAgent, getAgent, enableAgent, disableAgent, listAgents } from '../../intelligence/agents/agentRegistry';
import { createAuditLog } from '../../services/auditLogService';
import { NotFoundError } from '../../middleware/errors';
import { logger } from '../../config/logger';

const router = Router();
router.use(authenticate);

router.get('/', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agents = await listAgents({
      type: req.query.type as string,
      department: req.query.department as string,
      enabled: req.query.enabled === 'true' ? true : req.query.enabled === 'false' ? false : undefined,
    });
    res.json({ agents, total: agents.length });
  } catch (e) {
    logger.error('GET /agents failed', { error: (e as Error).message });
    next(e);
  }
});

router.get('/:name', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agent = await getAgent(req.params.name as string);
    if (!agent) throw new NotFoundError(`Agent not found: ${req.params.name}`);
    res.json({ agent });
  } catch (e) {
    logger.error('GET /agents/:name failed', { name: req.params.name, error: (e as Error).message });
    next(e);
  }
});

router.post('/', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agent = await registerAgent(req.body);
    await createAuditLog({
      userId: req.user!.userId,
      action: 'agent.register',
      entityType: 'ai_agent',
      entityId: agent.id,
      newValue: { name: agent.name, type: agent.type },
      ipAddress: req.ip || null,
    });
    res.status(201).json({ agent });
  } catch (e) {
    logger.error('POST /agents failed', { error: (e as Error).message, body: { name: req.body?.name, type: req.body?.type } });
    next(e);
  }
});

router.patch('/:name/enable', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agent = await enableAgent(req.params.name as string);
    await createAuditLog({
      userId: req.user!.userId,
      action: 'agent.enable',
      entityType: 'ai_agent',
      entityId: agent.id,
      newValue: { name: agent.name, enabled: true },
      ipAddress: req.ip || null,
    });
    res.json({ agent });
  } catch (e) {
    logger.error('PATCH /agents/:name/enable failed', { name: req.params.name, error: (e as Error).message });
    next(e);
  }
});

router.patch('/:name/disable', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agent = await disableAgent(req.params.name as string);
    await createAuditLog({
      userId: req.user!.userId,
      action: 'agent.disable',
      entityType: 'ai_agent',
      entityId: agent.id,
      newValue: { name: agent.name, enabled: false },
      ipAddress: req.ip || null,
    });
    res.json({ agent });
  } catch (e) {
    logger.error('PATCH /agents/:name/disable failed', { name: req.params.name, error: (e as Error).message });
    next(e);
  }
});

export default router;
