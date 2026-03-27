import { Campaign } from '../models/Campaign';
import { FollowUpSequence, SequenceStep } from '../models/FollowUpSequence';
import { CampaignLead } from '../models/CampaignLead';
import { ScheduledEmail } from '../models/ScheduledEmail';
import { Lead } from '../models/Lead';
import { ValidationError, NotFoundError, ConflictError } from '../middleware/errors';

/**
 * Generate a random jitter between 0 and maxMs milliseconds.
 */
function jitterMs(maxMs: number): number {
  return Math.floor(Math.random() * maxMs);
}

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface EnrollmentOptions {
  /** For countdown campaigns: the event date to count back from */
  eventDate?: Date;
  /** Whether this is a test enrollment */
  isTest?: boolean;
}

export interface EnrollmentResult {
  campaignLead: CampaignLead;
  scheduledActions: number;
  cancelledActions: number;
}

/**
 * Calculate scheduled_for for a standard sequence step.
 * scheduled_for = enrollmentTime + step.delay_days + random jitter (0-1h)
 */
export function calculateStandardScheduleTime(enrollmentTime: Date, step: SequenceStep): Date {
  const baseMs = enrollmentTime.getTime() + step.delay_days * ONE_DAY_MS;
  return new Date(baseMs + jitterMs(ONE_HOUR_MS));
}

/**
 * Calculate scheduled_for for a countdown sequence step.
 * For minutes_before_call: scheduled_for = eventDate - minutes_before_call
 * For days_before_cohort_start: scheduled_for = eventDate - days_before_cohort_start
 * Fallback: uses delay_days as days-before-event
 */
export function calculateCountdownScheduleTime(eventDate: Date, step: SequenceStep): Date {
  if (step.minutes_before_call !== undefined) {
    return new Date(eventDate.getTime() - step.minutes_before_call * 60 * 1000);
  }
  if (step.days_before_cohort_start !== undefined) {
    return new Date(eventDate.getTime() - step.days_before_cohort_start * ONE_DAY_MS);
  }
  // Fallback: treat delay_days as days-from-enrollment (standard mode)
  return new Date(Date.now() + step.delay_days * ONE_DAY_MS + jitterMs(ONE_HOUR_MS));
}

/**
 * Enroll a single lead into a campaign.
 */
export async function enrollLead(
  campaignId: string,
  leadId: number,
  options: EnrollmentOptions = {},
): Promise<EnrollmentResult> {
  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign) throw new NotFoundError('Campaign not found');

  if (!campaign.sequence_id) {
    throw new ValidationError('Campaign has no sequence linked');
  }

  const sequence = await FollowUpSequence.findByPk(campaign.sequence_id);
  if (!sequence) throw new NotFoundError('Sequence not found');

  const lead = await Lead.findByPk(leadId);
  if (!lead) throw new NotFoundError('Lead not found');

  // Check for duplicate enrollment
  const existing = await CampaignLead.findOne({
    where: { campaign_id: campaignId, lead_id: leadId },
  });
  if (existing) {
    throw new ConflictError('Lead is already enrolled in this campaign');
  }

  const now = new Date();
  const isCountdown = !!options.eventDate;
  const steps = sequence.steps;
  const isTest = options.isTest || campaign.settings?.test_mode_enabled || false;

  // Create CampaignLead record
  const campaignLead = await CampaignLead.create({
    campaign_id: campaignId,
    lead_id: leadId,
    status: 'enrolled',
    lifecycle_status: 'enrolled',
    enrolled_at: now,
    current_step_index: 0,
    total_steps: steps.length,
    metadata: options.eventDate ? { event_date: options.eventDate.toISOString() } : null,
  });

  let scheduledCount = 0;
  let cancelledCount = 0;

  // Create ScheduledEmail records for each step
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    const scheduledFor = isCountdown
      ? calculateCountdownScheduleTime(options.eventDate!, step)
      : calculateStandardScheduleTime(now, step);

    // Auto-cancel steps whose countdown has already passed
    const isPast = scheduledFor.getTime() < now.getTime();

    await ScheduledEmail.create({
      lead_id: leadId,
      campaign_id: campaignId,
      sequence_id: campaign.sequence_id,
      step_index: i,
      channel: step.channel,
      subject: step.subject || null,
      body: null, // Will be AI-generated at send time
      to_email: step.channel === 'email' ? lead.email : null,
      to_phone: step.channel !== 'email' ? lead.phone : null,
      voice_agent_type: step.voice_agent_type || null,
      max_attempts: step.max_attempts,
      fallback_channel: step.fallback_channel || null,
      scheduled_for: scheduledFor,
      status: isPast ? 'cancelled' : 'pending',
      ai_instructions: step.ai_instructions || null,
      is_test_action: isTest,
      metadata: {
        ai_tone: step.ai_tone,
        ai_context_notes: step.ai_context_notes,
        step_goal: step.step_goal,
        step_number: i + 1,
      },
    });

    if (isPast) {
      cancelledCount++;
    } else {
      scheduledCount++;
    }
  }

  // Update next_action_at on CampaignLead
  const firstPending = await ScheduledEmail.findOne({
    where: { campaign_id: campaignId, lead_id: leadId, status: 'pending' },
    order: [['scheduled_for', 'ASC']],
  });

  if (firstPending) {
    await campaignLead.update({ next_action_at: firstPending.scheduled_for });
  }

  return { campaignLead, scheduledActions: scheduledCount, cancelledActions: cancelledCount };
}

/**
 * Enroll multiple leads into a campaign.
 */
export async function enrollBulk(
  campaignId: string,
  leadIds: number[],
  options: EnrollmentOptions = {},
): Promise<{ enrolled: number; skipped: number; errors: string[] }> {
  let enrolled = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const leadId of leadIds) {
    try {
      await enrollLead(campaignId, leadId, options);
      enrolled++;
    } catch (error) {
      if (error instanceof ConflictError) {
        skipped++;
      } else {
        errors.push(`Lead ${leadId}: ${(error as Error).message}`);
      }
    }
  }

  return { enrolled, skipped, errors };
}

/**
 * Get enrolled leads for a campaign with their status.
 */
export async function getCampaignLeads(
  campaignId: string,
  filters: { status?: string; limit?: number; offset?: number } = {},
) {
  const where: Record<string, unknown> = { campaign_id: campaignId };
  if (filters.status) where.status = filters.status;

  return CampaignLead.findAndCountAll({
    where,
    order: [['enrolled_at', 'DESC']],
    limit: filters.limit || 25,
    offset: filters.offset || 0,
  });
}
