import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { createCampaign, getCampaignById } from '../../services/campaignService';
import { CampaignLead } from '../../models/CampaignLead';
import { Lead } from '../../models/Lead';
import { FollowUpSequence } from '../../models/FollowUpSequence';
import { Campaign } from '../../models/Campaign';
import { listDrafts, approveDraft, rejectDraft, editDraft, getDraftStats } from '../../services/draftService';
import { runDailyDraftCycle, generateDraftForLead } from '../../services/sequenceEngineService';
import { createAuditLog } from '../../services/auditLogService';
import { NotFoundError, ValidationError } from '../../middleware/errors';

const router = Router();
router.use(authenticate);

// --- Campaign Management ---

router.post('/campaigns', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaign = await createCampaign(
      { ...req.body, type: 'executive_outreach' },
      req.user!.userId,
    );
    await createAuditLog({
      userId: req.user!.userId, action: 'ceo_intro.campaign_create',
      entityType: 'campaign', entityId: campaign.id,
      newValue: { name: campaign.name }, ipAddress: req.ip || null,
    });
    res.status(201).json({ campaign });
  } catch (error) { next(error); }
});

router.post('/campaigns/:id/enroll', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { lead_ids } = req.body;
    if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
      throw new ValidationError('lead_ids array is required');
    }

    const campaign = await getCampaignById(req.params.id as string);
    if (!campaign.sequence_id) throw new ValidationError('Campaign has no sequence linked');

    const sequence = await FollowUpSequence.findByPk(campaign.sequence_id);
    if (!sequence) throw new NotFoundError('Sequence not found');

    let enrolled = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const leadId of lead_ids) {
      try {
        const lead = await Lead.findByPk(leadId);
        if (!lead) { errors.push(`Lead ${leadId} not found`); continue; }

        const existing = await CampaignLead.findOne({
          where: { campaign_id: campaign.id, lead_id: leadId },
        });
        if (existing) { skipped++; continue; }

        await CampaignLead.create({
          campaign_id: campaign.id,
          lead_id: leadId,
          status: 'active',
          lifecycle_status: 'enrolled',
          enrolled_at: new Date(),
          current_step_index: 0,
          total_steps: sequence.steps.length,
          next_action_at: new Date(), // Due immediately for first draft cycle
          metadata: { draft_mode: true, outreach_step: '1st_outreach' },
        });
        enrolled++;
      } catch (error) {
        errors.push(`Lead ${leadId}: ${(error as Error).message}`);
      }
    }

    await createAuditLog({
      userId: req.user!.userId, action: 'ceo_intro.enroll',
      entityType: 'campaign', entityId: campaign.id,
      newValue: { enrolled, skipped, errors: errors.length }, ipAddress: req.ip || null,
    });

    res.json({ enrolled, skipped, errors });
  } catch (error) { next(error); }
});

router.post('/campaigns/:id/run-cycle', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await runDailyDraftCycle();
    res.json(result);
  } catch (error) { next(error); }
});

// --- Draft Management ---

router.get('/drafts', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await listDrafts({
      campaign_id: req.query.campaign_id as string,
      limit: req.query.limit ? Number(req.query.limit) : 25,
      offset: req.query.offset ? Number(req.query.offset) : 0,
    });
    res.json(result);
  } catch (error) { next(error); }
});

router.patch('/drafts/:id', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const draft = await editDraft(req.params.id as string, req.body);
    res.json({ draft });
  } catch (error) { next(error); }
});

router.post('/drafts/:id/approve', authorize('campaigns:approve'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const draft = await approveDraft(req.params.id as string, req.user!.userId);
    res.json({ draft, message: 'Draft approved. Will be sent on next scheduler cycle.' });
  } catch (error) { next(error); }
});

router.post('/drafts/:id/reject', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const draft = await rejectDraft(req.params.id as string, req.user!.userId, req.body.reason);
    res.json({ draft });
  } catch (error) { next(error); }
});

router.post('/drafts/:id/regenerate', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ScheduledEmail } = require('../../models/ScheduledEmail');
    const oldDraft = await ScheduledEmail.findByPk(req.params.id);
    if (!oldDraft) throw new NotFoundError('Draft not found');

    const campaign = await Campaign.findByPk(oldDraft.campaign_id);
    if (!campaign?.sequence_id) throw new ValidationError('Campaign has no sequence');

    const sequence = await FollowUpSequence.findByPk(campaign.sequence_id);
    if (!sequence) throw new NotFoundError('Sequence not found');

    const campaignLead = await CampaignLead.findOne({
      where: { campaign_id: campaign.id, lead_id: oldDraft.lead_id },
    });
    if (!campaignLead) throw new NotFoundError('Campaign lead not found');

    // Cancel old draft
    await oldDraft.update({ status: 'cancelled' });

    // Temporarily set step back so generateDraftForLead works
    const savedStep = campaignLead.current_step_index;
    await campaignLead.update({ current_step_index: oldDraft.step_index });

    const newDraft = await generateDraftForLead(campaign, sequence, campaignLead);

    // Restore step index
    await campaignLead.update({ current_step_index: savedStep });

    res.json({ draft: newDraft });
  } catch (error) { next(error); }
});

// --- Stats ---

router.get('/stats', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await getDraftStats(req.query.campaign_id as string);

    // Add lead counts
    const baseWhere: Record<string, unknown> = {};
    if (req.query.campaign_id) baseWhere.campaign_id = req.query.campaign_id;

    const [activeLeads, completedLeads] = await Promise.all([
      CampaignLead.count({ where: { ...baseWhere, status: 'active' } }),
      CampaignLead.count({ where: { ...baseWhere, status: 'completed' } }),
    ]);

    res.json({ ...stats, active_leads: activeLeads, completed_leads: completedLeads });
  } catch (error) { next(error); }
});

export default router;
