import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { getQADashboard, getCampaignQADetails, runQACycle, getAgentActivity, getTestSuiteInfo } from '../../services/qaService';
import { createAuditLog } from '../../services/auditLogService';
import { logger } from '../../config/logger';

const router = Router();
router.use(authenticate);

router.get('/dashboard', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const dashboard = await getQADashboard();
    res.json(dashboard);
  } catch (e) {
    logger.error('GET /qa/dashboard failed', { error: (e as Error).message });
    next(e);
  }
});

router.get('/campaigns', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const campaigns = await getCampaignQADetails();
    res.json({ campaigns });
  } catch (e) {
    logger.error('GET /qa/campaigns failed', { error: (e as Error).message });
    next(e);
  }
});

router.post('/run-cycle', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info('QA cycle triggered manually', { userId: req.user!.userId });
    const results = await runQACycle();
    await createAuditLog({
      userId: req.user!.userId,
      action: 'qa.run_cycle',
      entityType: 'qa',
      entityId: 'manual',
      newValue: { campaigns_scanned: results.length, failed: results.filter(r => r.status === 'failed').length },
      ipAddress: req.ip || null,
    });
    res.json({ results });
  } catch (e) {
    logger.error('POST /qa/run-cycle failed', { error: (e as Error).message, userId: req.user?.userId });
    next(e);
  }
});

router.get('/agents', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const activity = await getAgentActivity();
    res.json(activity);
  } catch (e) {
    logger.error('GET /qa/agents failed', { error: (e as Error).message });
    next(e);
  }
});

router.get('/test-suite', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const info = getTestSuiteInfo();
    res.json(info);
  } catch (e) {
    logger.error('GET /qa/test-suite failed', { error: (e as Error).message });
    next(e);
  }
});

export default router;
