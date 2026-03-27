import { Op } from 'sequelize';
import { ScheduledEmail } from '../models/ScheduledEmail';
import { CommunicationLog } from '../models/CommunicationLog';
import { CampaignLead } from '../models/CampaignLead';
import { logger } from '../config/logger';

/**
 * Repair agent: fix broken campaigns per Blueprint Section 12.
 * Runs every 20 minutes.
 */
export async function runRepairCycle(): Promise<{
  emailRetries: number;
  voiceFallbacks: number;
  bounceCleanups: number;
}> {
  let emailRetries = 0;
  let voiceFallbacks = 0;
  let bounceCleanups = 0;

  // 1. Email retry: reset failed email actions with retries remaining
  const failedEmails = await ScheduledEmail.findAll({
    where: {
      status: 'failed',
      channel: 'email',
      attempts_made: { [Op.lt]: 2 },
    },
    limit: 20,
  });

  for (const action of failedEmails) {
    await action.update({
      status: 'pending',
      scheduled_for: new Date(Date.now() + 30 * 60 * 1000),
      processing_started_at: null,
      processor_id: null,
    });
    emailRetries++;
  }

  // 2. Voice fallback: create email action if voice failed
  const failedVoice = await ScheduledEmail.findAll({
    where: {
      status: 'failed',
      channel: 'voice',
      fallback_channel: { [Op.ne]: null },
    },
    limit: 20,
  });

  for (const action of failedVoice) {
    await ScheduledEmail.create({
      lead_id: action.lead_id,
      campaign_id: action.campaign_id,
      sequence_id: action.sequence_id,
      step_index: action.step_index,
      channel: (action.fallback_channel || 'email') as any,
      subject: action.subject,
      body: null,
      to_email: action.to_email,
      to_phone: action.to_phone,
      max_attempts: 1,
      fallback_channel: null,
      scheduled_for: new Date(Date.now() + 10 * 60 * 1000),
      status: 'pending',
      ai_instructions: action.ai_instructions,
      is_test_action: action.is_test_action,
      metadata: action.metadata,
    });
    voiceFallbacks++;
  }

  // 3. Bounce cleanup: mark bounced leads, remove from active campaigns
  const bouncedLogs = await CommunicationLog.findAll({
    where: {
      status: 'bounced',
      created_at: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    attributes: ['lead_id'],
    group: ['lead_id'],
    raw: true,
  });

  for (const log of bouncedLogs as any[]) {
    await CampaignLead.update(
      { lifecycle_status: 'bounced', status: 'removed' },
      { where: { lead_id: log.lead_id, status: { [Op.in]: ['enrolled', 'active'] } } },
    );
    bounceCleanups++;
  }

  if (emailRetries + voiceFallbacks + bounceCleanups > 0) {
    logger.info('Repair cycle complete', { emailRetries, voiceFallbacks, bounceCleanups });
  }

  return { emailRetries, voiceFallbacks, bounceCleanups };
}
