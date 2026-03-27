import { Op } from 'sequelize';
import { ScheduledEmail } from '../models/ScheduledEmail';
import { Lead } from '../models/Lead';
import { CampaignLead } from '../models/CampaignLead';
import { InteractionOutcome } from '../models/InteractionOutcome';
import { SCHEDULER } from '../config/schedulerConstants';
import { isInSendWindow, isCampaignActive, isTestSafe, interleaveActions } from './guardChecks';
import { evaluateSend } from './communicationSafetyService';
import { generateMessage } from './aiMessageService';
import { dispatchAction } from './channelDispatcher';
import { logger } from '../config/logger';

/**
 * Step 0: Claim pending actions atomically.
 * Max 40 per cycle, max 10 per campaign, round-robin.
 */
export async function claimPendingActions(): Promise<ScheduledEmail[]> {
  const now = new Date();

  const actions = await ScheduledEmail.findAll({
    where: {
      status: 'pending',
      scheduled_for: { [Op.lte]: now },
    },
    order: [['scheduled_for', 'ASC']],
    limit: SCHEDULER.MAX_PER_CYCLE * 2, // Fetch extra, then filter per-campaign
  });

  // Enforce per-campaign limit
  const campaignCounts = new Map<string, number>();
  const claimed: ScheduledEmail[] = [];

  for (const action of actions) {
    if (claimed.length >= SCHEDULER.MAX_PER_CYCLE) break;

    const campKey = action.campaign_id || '__none__';
    const count = campaignCounts.get(campKey) || 0;
    if (count >= SCHEDULER.MAX_PER_CAMPAIGN) continue;

    campaignCounts.set(campKey, count + 1);
    claimed.push(action);
  }

  // Mark as processing
  const processorId = `scheduler-${Date.now()}`;
  for (const action of claimed) {
    await action.update({
      status: 'processing',
      processing_started_at: now,
      processor_id: processorId,
    });
  }

  return claimed;
}

/**
 * Process a single action through the pipeline.
 */
export async function processAction(action: ScheduledEmail): Promise<void> {
  try {
    // Step 2a: Campaign status guard
    const campaignGuard = await isCampaignActive(action.campaign_id);
    if (!campaignGuard.allowed) {
      logger.info('Action skipped: campaign inactive', { actionId: action.id, reason: campaignGuard.reason });
      await action.update({ status: 'cancelled' });
      return;
    }

    // Step 2b: Send window check
    const windowGuard = isInSendWindow(action.channel);
    if (!windowGuard.allowed) {
      // Reschedule for next window - reset to pending
      logger.info('Action deferred: outside send window', { actionId: action.id, reason: windowGuard.reason });
      await action.update({ status: 'pending', processing_started_at: null, processor_id: null });
      return;
    }

    // Step 2c: Test safety
    const testGuard = isTestSafe(action);
    if (!testGuard.allowed) {
      logger.warn('Action blocked: test safety', { actionId: action.id, reason: testGuard.reason });
      await action.update({ status: 'cancelled' });
      return;
    }

    // Step 3: AI content generation (if needed)
    if (action.ai_instructions && !action.body) {
      const lead = await Lead.findByPk(action.lead_id);
      if (!lead) {
        await action.update({ status: 'failed' });
        return;
      }

      const generated = await generateMessage({
        channel: action.channel,
        ai_instructions: action.ai_instructions,
        tone: action.metadata?.ai_tone,
        lead: {
          name: `${lead.first_name} ${lead.last_name}`,
          email: lead.email,
          company: lead.company || undefined,
          title: lead.title || undefined,
          industry: lead.industry || undefined,
          lead_score: lead.lead_score,
        },
        campaignContext: action.metadata?.step_goal ? {
          type: '', name: '', step_goal: action.metadata.step_goal, step_number: action.metadata.step_number,
        } : undefined,
      });

      await action.update({
        body: generated.body,
        subject: generated.subject || action.subject,
        ai_generated: true,
        metadata: { ...action.metadata, ai_tokens_used: generated.tokens_used, ai_model: generated.model },
      });
    }

    // Step 4: Safety evaluation
    const lead = await Lead.findByPk(action.lead_id);
    if (!lead) {
      await action.update({ status: 'failed' });
      return;
    }

    const safety = await evaluateSend({
      leadId: action.lead_id,
      leadEmail: lead.email,
      leadPhone: lead.phone,
      campaignId: action.campaign_id,
      channel: action.channel,
      isTestAction: action.is_test_action,
    });

    if (!safety.allowed) {
      logger.info('Action blocked by safety', { actionId: action.id, reason: safety.blockedReason });
      await action.update({ status: 'cancelled' });
      return;
    }

    // Step 5: Send via channel
    const result = await dispatchAction(action, {
      deliveryMode: safety.deliveryMode,
      redirect: safety.redirect,
    });

    // Step 6: Post-send
    if (result.success) {
      await action.update({ status: 'sent', sent_at: new Date() });

      // Create interaction outcome
      await InteractionOutcome.create({
        lead_id: action.lead_id,
        campaign_id: action.campaign_id,
        scheduled_email_id: action.id,
        channel: action.channel,
        step_index: action.step_index,
        outcome: 'sent',
        lead_industry: lead.industry,
        lead_title_category: lead.title,
        lead_company_size_bucket: lead.company_size ? (lead.company_size > 500 ? 'enterprise' : lead.company_size > 50 ? 'mid' : 'small') : null,
        lead_source_type: lead.lead_source_type,
        metadata: null,
      });

      // Advance campaign lead step
      if (action.campaign_id) {
        await CampaignLead.update(
          {
            current_step_index: action.step_index + 1,
            last_activity_at: new Date(),
            touchpoint_count: CampaignLead.sequelize!.literal('touchpoint_count + 1') as any,
          },
          { where: { campaign_id: action.campaign_id, lead_id: action.lead_id } },
        );
      }
    } else {
      // Step 7: Error handling
      await handleActionFailure(action);
    }
  } catch (error) {
    logger.error('Action processing error', { actionId: action.id, error: (error as Error).message });
    await handleActionFailure(action);
  }
}

async function handleActionFailure(action: ScheduledEmail): Promise<void> {
  const newAttempts = action.attempts_made + 1;

  if (newAttempts < action.max_attempts) {
    // Retry after delay
    const retryAt = new Date(Date.now() + SCHEDULER.RETRY_DELAY_MS);
    await action.update({
      status: 'pending',
      attempts_made: newAttempts,
      scheduled_for: retryAt,
      processing_started_at: null,
      processor_id: null,
    });
  } else if (action.fallback_channel) {
    // Create fallback action
    await ScheduledEmail.create({
      lead_id: action.lead_id,
      campaign_id: action.campaign_id,
      sequence_id: action.sequence_id,
      step_index: action.step_index,
      channel: action.fallback_channel as any,
      subject: action.subject,
      body: null,
      to_email: action.to_email,
      to_phone: action.to_phone,
      max_attempts: 1,
      fallback_channel: null,
      scheduled_for: new Date(Date.now() + 5 * 60 * 1000),
      status: 'pending',
      ai_instructions: action.ai_instructions,
      is_test_action: action.is_test_action,
      metadata: action.metadata,
    });
    await action.update({ status: 'failed', attempts_made: newAttempts });
  } else {
    await action.update({ status: 'failed', attempts_made: newAttempts });
  }
}

/**
 * Recover stale actions stuck in 'processing' state.
 */
export async function recoverStaleActions(): Promise<number> {
  const threshold = new Date(Date.now() - SCHEDULER.STALE_THRESHOLD_MS);

  const [count] = await ScheduledEmail.update(
    { status: 'pending', processing_started_at: null, processor_id: null },
    {
      where: {
        status: 'processing',
        processing_started_at: { [Op.lt]: threshold },
      },
    },
  );

  if (count > 0) {
    logger.warn('Recovered stale actions', { count });
  }

  return count;
}

/**
 * Main scheduler cycle: claim, interleave, process.
 */
export async function runSchedulerCycle(): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;

  try {
    const claimed = await claimPendingActions();
    if (claimed.length === 0) return { processed: 0, errors: 0 };

    // Step 1: Interleave by campaign
    const interleaved = interleaveActions(claimed);

    logger.info('Scheduler cycle starting', { actions: interleaved.length });

    for (const action of interleaved) {
      try {
        await processAction(action);
        processed++;
      } catch (error) {
        errors++;
        logger.error('Action failed', { actionId: action.id, error: (error as Error).message });
      }
    }

    logger.info('Scheduler cycle complete', { processed, errors });
  } catch (error) {
    logger.error('Scheduler cycle failed', { error: (error as Error).message });
  }

  return { processed, errors };
}
