import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import {
  createCampaign, getCampaignById, updateCampaign,
  listCampaigns, transitionApproval, linkSequence,
} from '../../services/campaignService';
import {
  createSequence, getSequenceById, listSequences,
} from '../../services/sequenceService';
import { getTemplates } from '../../services/campaignBuilderService';
import { enrollLead, enrollBulk, getCampaignLeads } from '../../services/enrollmentService';
import { createAuditLog } from '../../services/auditLogService';
import { logger } from '../../config/logger';

const router = Router();
router.use(authenticate);

// --- Campaigns ---

router.post('/', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaign = await createCampaign(req.body, req.user!.userId);
    await createAuditLog({
      userId: req.user!.userId, action: 'campaign.create',
      entityType: 'campaign', entityId: campaign.id,
      newValue: { name: campaign.name, type: campaign.type },
      ipAddress: req.ip || null,
    });
    res.status(201).json({ campaign });
  } catch (error) {
    logger.error('POST /campaigns failed', { error: (error as Error).message });
    next(error);
  }
});

router.get('/', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await listCampaigns({
      status: req.query.status as string,
      type: req.query.type as string,
      approval_status: req.query.approval_status as string,
      limit: req.query.limit ? Number(req.query.limit) : 25,
      offset: req.query.offset ? Number(req.query.offset) : 0,
    });
    res.json({ campaigns: result.rows, total: result.count });
  } catch (error) {
    logger.error('GET /campaigns failed', { error: (error as Error).message });
    next(error);
  }
});

router.get('/:id', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaign = await getCampaignById(req.params.id as string);
    res.json({ campaign });
  } catch (error) {
    logger.error('GET /campaigns/:id failed', { id: req.params.id, error: (error as Error).message });
    next(error);
  }
});

router.patch('/:id', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaign = await updateCampaign(req.params.id as string, req.body);
    await createAuditLog({
      userId: req.user!.userId, action: 'campaign.update',
      entityType: 'campaign', entityId: campaign.id,
      newValue: req.body, ipAddress: req.ip || null,
    });
    res.json({ campaign });
  } catch (error) { next(error); }
});

router.post('/:id/prompt', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ai_system_prompt } = req.body;
    if (!ai_system_prompt || !ai_system_prompt.trim()) {
      return res.status(400).json({ error: 'Prompt cannot be empty' });
    }
    const campaign = await updateCampaign(req.params.id as string, { ai_system_prompt: ai_system_prompt.trim() });
    await createAuditLog({
      userId: req.user!.userId, action: 'campaign.update_prompt',
      entityType: 'campaign', entityId: campaign.id,
      newValue: { ai_system_prompt: ai_system_prompt.trim() }, ipAddress: req.ip || null,
    });
    res.json({ campaign });
  } catch (error) { next(error); }
});

router.post('/:id/approve', authorize('campaigns:approve'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body;
    const campaign = await transitionApproval(req.params.id as string, status, req.user!.userId);
    await createAuditLog({
      userId: req.user!.userId, action: 'campaign.approval_transition',
      entityType: 'campaign', entityId: campaign.id,
      newValue: { approval_status: status }, ipAddress: req.ip || null,
    });
    res.json({ campaign });
  } catch (error) { next(error); }
});

router.post('/:id/link-sequence', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sequence_id } = req.body;
    const campaign = await linkSequence(req.params.id as string, sequence_id);
    res.json({ campaign });
  } catch (error) { next(error); }
});

// --- Enrollment ---

router.post('/:id/enroll', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { lead_id, event_date, is_test } = req.body;
    const result = await enrollLead(req.params.id as string, lead_id, {
      eventDate: event_date ? new Date(event_date) : undefined,
      isTest: is_test,
    });
    await createAuditLog({
      userId: req.user!.userId, action: 'campaign.enroll_lead',
      entityType: 'campaign_lead', entityId: result.campaignLead.id,
      newValue: { campaign_id: req.params.id, lead_id, scheduled: result.scheduledActions },
      ipAddress: req.ip || null,
    });
    res.status(201).json(result);
  } catch (error) {
    logger.error('POST /campaigns/:id/enroll failed', { id: req.params.id, error: (error as Error).message });
    next(error);
  }
});

router.post('/:id/enroll-bulk', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { lead_ids, event_date, is_test } = req.body;
    if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
      return res.status(400).json({ error: 'lead_ids must be a non-empty array' });
    }
    const result = await enrollBulk(req.params.id as string, lead_ids, {
      eventDate: event_date ? new Date(event_date) : undefined,
      isTest: is_test,
    });
    logger.info('Bulk enrollment completed', { campaignId: req.params.id, enrolled: result.enrolled, skipped: result.skipped });
    res.json(result);
  } catch (error) {
    logger.error('POST /campaigns/:id/enroll-bulk failed', { id: req.params.id, error: (error as Error).message });
    next(error);
  }
});

router.get('/:id/leads', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await getCampaignLeads(req.params.id as string, {
      status: req.query.status as string,
      limit: req.query.limit ? Number(req.query.limit) : 25,
      offset: req.query.offset ? Number(req.query.offset) : 0,
    });
    res.json({ leads: result.rows, total: result.count });
  } catch (error) { next(error); }
});

// --- Apollo Lead Sourcing ---

router.post('/:id/pull-apollo', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { pullLeadsForCampaign } = await import('../../services/apolloLeadService');
    const count = Math.min(parseInt(req.body?.count, 10) || 25, 100);
    const result = await pullLeadsForCampaign(req.params.id as string, count);
    await createAuditLog({
      userId: (req as any).user?.id,
      action: 'campaign.apollo_pull',
      entityType: 'campaign',
      entityId: req.params.id as string,
      metadata: { count, ...result, details: undefined },
    } as any);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('POST /campaigns/:id/pull-apollo failed', { error: (error as Error).message });
    next(error);
  }
});

router.get('/apollo/credits', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { getApolloCreditUsage } = await import('../../services/apolloLeadService');
    const usage = await getApolloCreditUsage();
    res.json(usage);
  } catch (error) { next(error); }
});

// --- Sequences ---

router.post('/sequences', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sequence = await createSequence(req.body);
    res.status(201).json({ sequence });
  } catch (error) { next(error); }
});

router.get('/sequences', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const sequences = await listSequences();
    res.json({ sequences });
  } catch (error) { next(error); }
});

router.get('/sequences/templates', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const templates = getTemplates();
    res.json({ templates });
  } catch (error) { next(error); }
});

router.get('/sequences/:id', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sequence = await getSequenceById(req.params.id as string);
    res.json({ sequence });
  } catch (error) { next(error); }
});

export default router;
