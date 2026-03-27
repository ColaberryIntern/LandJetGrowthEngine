import { Op } from 'sequelize';
import { CampaignLead } from '../models/CampaignLead';
import { Campaign } from '../models/Campaign';
import { FollowUpSequence } from '../models/FollowUpSequence';
import { ScheduledEmail } from '../models/ScheduledEmail';
import { InteractionOutcome } from '../models/InteractionOutcome';
import { Lead } from '../models/Lead';
import { logger } from '../config/logger';

const DEFAULT_FOLLOW_UP_DAYS = 4;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const OUTREACH_STEPS = ['1st_outreach', '2nd_outreach', 'last_email'] as const;

/**
 * Advance a lead through the CEO intro sequence after draft creation.
 * Matches n8n behavior: +4 days, shift outreach_step, archive last email.
 */
export async function advanceLead(
  campaignId: string,
  leadId: number,
  completedStepIndex: number,
  sentEmailBody?: string,
): Promise<void> {
  const campaignLead = await CampaignLead.findOne({
    where: { campaign_id: campaignId, lead_id: leadId },
  });
  if (!campaignLead) {
    logger.warn('CampaignLead not found for progression', { campaignId, leadId });
    return;
  }

  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign?.sequence_id) return;

  const sequence = await FollowUpSequence.findByPk(campaign.sequence_id);
  if (!sequence) return;

  const newStepIndex = completedStepIndex + 1;
  const totalSteps = sequence.steps.length;

  if (newStepIndex >= totalSteps) {
    await markSequenceCompleted(campaignId, leadId, 'sequence_finished');
    return;
  }

  // Calculate next action date
  const nextStep = sequence.steps[newStepIndex];
  const delayDays = nextStep?.delay_days || DEFAULT_FOLLOW_UP_DAYS;
  const nextActionAt = new Date(Date.now() + delayDays * ONE_DAY_MS);

  // Determine outreach step label
  const outreachStep = newStepIndex < OUTREACH_STEPS.length
    ? OUTREACH_STEPS[newStepIndex]
    : 'last_email';

  // Update campaign lead
  const currentMetadata = (campaignLead.metadata || {}) as Record<string, unknown>;
  await campaignLead.update({
    current_step_index: newStepIndex,
    next_action_at: nextActionAt,
    last_activity_at: new Date(),
    touchpoint_count: campaignLead.touchpoint_count + 1,
    metadata: {
      ...currentMetadata,
      outreach_step: outreachStep,
      last_approved_at: new Date().toISOString(),
      last_email_sent: sentEmailBody || currentMetadata.last_email_sent,
    },
  });

  // On first touch, advance lead pipeline stage
  if (completedStepIndex === 0) {
    const lead = await Lead.findByPk(leadId);
    if (lead && lead.pipeline_stage === 'new_lead') {
      await lead.update({ pipeline_stage: 'contacted' });
      logger.info('Lead pipeline advanced to contacted', { leadId });
    }
  }

  logger.info('Lead progressed in CEO intro sequence', {
    campaignId, leadId, newStepIndex, nextActionAt: nextActionAt.toISOString(), outreachStep,
  });
}

/**
 * Mark a lead's sequence as completed.
 */
export async function markSequenceCompleted(
  campaignId: string,
  leadId: number,
  outcome: string = 'sequence_finished',
): Promise<void> {
  await CampaignLead.update(
    {
      status: 'completed',
      completed_at: new Date(),
      outcome,
    },
    { where: { campaign_id: campaignId, lead_id: leadId } },
  );

  // Cancel any remaining drafts/pending for this lead
  await ScheduledEmail.update(
    { status: 'cancelled' },
    {
      where: {
        campaign_id: campaignId,
        lead_id: leadId,
        status: { [Op.in]: ['draft', 'pending'] },
      },
    },
  );

  logger.info('Sequence completed', { campaignId, leadId, outcome });
}

/**
 * Handle positive response - pause sequence and notify.
 */
export async function handlePositiveResponse(campaignId: string, leadId: number): Promise<void> {
  const campaignLead = await CampaignLead.findOne({
    where: { campaign_id: campaignId, lead_id: leadId },
  });
  if (!campaignLead) return;

  await campaignLead.update({
    status: 'paused',
    metadata: {
      ...((campaignLead.metadata || {}) as Record<string, unknown>),
      response_classification: 'positive',
      paused_at: new Date().toISOString(),
    },
  });

  // Advance lead pipeline
  const lead = await Lead.findByPk(leadId);
  if (lead) {
    await lead.update({ pipeline_stage: 'meeting_scheduled' });
  }

  // Cancel pending drafts
  await ScheduledEmail.update(
    { status: 'cancelled' },
    {
      where: {
        campaign_id: campaignId,
        lead_id: leadId,
        status: { [Op.in]: ['draft', 'pending'] },
      },
    },
  );

  logger.info('Positive response handled', { campaignId, leadId });
}
