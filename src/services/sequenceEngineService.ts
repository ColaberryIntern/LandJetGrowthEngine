import { Op } from 'sequelize';
import { Campaign } from '../models/Campaign';
import { CampaignLead } from '../models/CampaignLead';
import { FollowUpSequence } from '../models/FollowUpSequence';
import { Lead } from '../models/Lead';
import { ScheduledEmail } from '../models/ScheduledEmail';
import { generateCeoIntroEmail } from './messageAgentService';
import { polish } from '../agents/emailPolisherAgent';
import { createDraft } from './draftService';
import { advanceLead, markSequenceCompleted } from './leadProgressionService';
import { createNotification } from './notificationService';
import { logger } from '../config/logger';

// CEO signature HTML - matches n8n's Ryan Landry signature
const CEO_SIGNATURE_HTML = `
<br><br>
<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.4; color: #000000;">
  <tr><td style="padding-bottom: 10px;"><strong style="font-size: 16px;">Ryan Landry</strong></td></tr>
  <tr><td style="padding-bottom: 8px;">Chief Executive Officer</td></tr>
  <tr><td style="padding-bottom: 10px;">M: <a href="tel:9494122682" style="color: #000000; text-decoration: none;">949.412.2682</a> P: <a href="tel:8665263538" style="color: #000000; text-decoration: none;">866.LANDJET</a></td></tr>
  <tr><td style="padding-bottom: 12px;"><a href="https://www.landjet.com" style="color: #0066cc; text-decoration: none;">www.landjet.com</a></td></tr>
  <tr><td style="padding-bottom: 8px;"><img src="https://landjet.com/assets/images/logo.png" alt="LANDJET" style="height: 30px; display: block;" /></td></tr>
  <tr><td style="color: #000000; font-size: 13px;">Get In. Get Connected. Get Things Done.</td></tr>
</table>`;

export interface DraftCycleResult {
  draftsCreated: number;
  leadsProcessed: number;
  errors: string[];
}

/**
 * Run the daily draft generation cycle for all active CEO intro campaigns.
 * This is the main orchestrator - wires MessageAgent → Polisher → Draft → Progression → Notify.
 */
export async function runDailyDraftCycle(): Promise<DraftCycleResult> {
  const result: DraftCycleResult = { draftsCreated: 0, leadsProcessed: 0, errors: [] };

  // Find all active executive_outreach campaigns
  const campaigns = await Campaign.findAll({
    where: { type: 'executive_outreach', status: 'active' },
  });

  if (campaigns.length === 0) {
    logger.info('No active CEO intro campaigns found');
    return result;
  }

  for (const campaign of campaigns) {
    if (!campaign.sequence_id) {
      result.errors.push(`Campaign ${campaign.id}: no sequence linked`);
      continue;
    }

    const sequence = await FollowUpSequence.findByPk(campaign.sequence_id);
    if (!sequence) {
      result.errors.push(`Campaign ${campaign.id}: sequence not found`);
      continue;
    }

    // Find due leads
    const dueLeads = await CampaignLead.findAll({
      where: {
        campaign_id: campaign.id,
        status: 'active',
        next_action_at: { [Op.lte]: new Date() },
      },
    });

    for (const campaignLead of dueLeads) {
      try {
        await generateDraftForLead(campaign, sequence, campaignLead);
        result.draftsCreated++;
      } catch (error) {
        const msg = `Lead ${campaignLead.lead_id}: ${(error as Error).message}`;
        result.errors.push(msg);
        logger.error('Draft generation failed for lead', { leadId: campaignLead.lead_id, error: msg });
      }
      result.leadsProcessed++;
    }
  }

  // Notify admins if drafts were created
  if (result.draftsCreated > 0) {
    try {
      // Find admin users to notify
      const { User } = require('../models/User');
      const admins = await User.findAll({ where: { role: 'admin', status: 'active' } });

      for (const admin of admins) {
        await createNotification({
          user_id: admin.id,
          type: 'in_app',
          subject: 'CEO Intro Drafts Ready',
          body: `${result.draftsCreated} draft${result.draftsCreated > 1 ? 's' : ''} ready for review. Check the CEO Intro dashboard.`,
        });
      }
    } catch (error) {
      logger.warn('Failed to send draft notifications', { error: (error as Error).message });
    }
  }

  logger.info('Daily draft cycle complete', result);
  return result;
}

/**
 * Generate a single draft for a specific lead in a campaign.
 */
export async function generateDraftForLead(
  campaign: Campaign,
  sequence: FollowUpSequence,
  campaignLead: CampaignLead,
): Promise<ScheduledEmail> {
  const stepIndex = campaignLead.current_step_index;

  // Check if sequence is complete
  if (stepIndex >= sequence.steps.length) {
    await markSequenceCompleted(campaign.id, campaignLead.lead_id, 'sequence_finished');
    throw new Error('Sequence already complete');
  }

  // Check for existing draft (idempotent)
  const existingDraft = await ScheduledEmail.findOne({
    where: {
      campaign_id: campaign.id,
      lead_id: campaignLead.lead_id,
      step_index: stepIndex,
      status: { [Op.in]: ['draft', 'approved'] },
    },
  });
  if (existingDraft) {
    return existingDraft; // Already has a draft, skip
  }

  const step = sequence.steps[stepIndex];
  const lead = await Lead.findByPk(campaignLead.lead_id);
  if (!lead) throw new Error('Lead not found');

  // Step 1: Generate email content via MessageAgentService
  const generated = await generateCeoIntroEmail({
    lead,
    step,
    campaign,
    stepIndex,
  });

  // Step 2: Polish via EmailPolisherAgent
  const polished = await polish({
    subject: generated.subject || step.subject || 'Follow Up',
    body: generated.body,
    leadFirstName: lead.first_name,
    stepGoal: step.step_goal,
    aiTone: step.ai_tone,
  });

  // Step 3: Append CEO signature
  const bodyWithSignature = polished.body + CEO_SIGNATURE_HTML;

  // Step 4: Create draft
  const draft = await createDraft({
    lead_id: lead.id,
    campaign_id: campaign.id,
    sequence_id: campaign.sequence_id!,
    step_index: stepIndex,
    subject: polished.subject,
    body: bodyWithSignature,
    to_email: lead.email,
    ai_instructions: step.ai_instructions,
    metadata: {
      ai_tone: step.ai_tone,
      step_goal: step.step_goal,
      step_number: stepIndex + 1,
      draft_mode: true,
      polisher_changes: polished.changes_made,
      polisher_quality_score: polished.quality_score,
      ai_tokens_used: generated.tokens_used + polished.tokens_used,
      ai_model: generated.model,
      ceo_signature_appended: true,
    },
  });

  // Step 5: Advance lead (+4 days for next step)
  await advanceLead(campaign.id, lead.id, stepIndex, generated.body);

  // Update campaign_lead metadata with draft reference
  const currentMeta = (campaignLead.metadata || {}) as Record<string, unknown>;
  await campaignLead.update({
    metadata: { ...currentMeta, last_draft_id: draft.id },
  });

  return draft;
}
