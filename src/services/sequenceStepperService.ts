/**
 * Sequence stepper service (Ali asked 2026-06-18: A).
 *
 * Finds leads with overdue `Lead.next_action_at`, determines the next step in
 * their campaign's `sequence_steps`, and writes a ScheduledEmail row that the
 * existing scheduler service picks up on its next 1-minute tick.
 *
 * Why this exists: the 124 leads stranded at pipeline_stage='contacted' use
 * the Lead-direct enrollment model (Lead.campaign_id + Lead.next_action_at)
 * rather than the CampaignLead model that sequenceEngineService.runDailyDraftCycle
 * handles. No job in pipelineAutoRunner.ts currently bridges Lead.next_action_at
 * to ScheduledEmail, so the queue stays empty. This is that bridge.
 *
 * Safety:
 *  - Opt-in: requires PIPELINE_ENABLE_STEPPER=true to actually write
 *  - dry-run mode returns the would-fire list without DB writes
 *  - Per-cycle batch limit (default 10) so first live run cannot blast 124 at once
 *  - Per-lead idempotency: skips if a recent ScheduledEmail for the same lead
 *    + campaign already exists with status pending/processing/sent
 *  - Only handles pipeline_stage='contacted' (next step is the first follow-up).
 *    Other stages need manual review.
 */

import { Op, QueryTypes, WhereOptions } from 'sequelize';
import { Lead } from '../models/Lead';
import { Campaign } from '../models/Campaign';
import { ScheduledEmail, ScheduledEmailAttributes, ScheduledEmailCreationAttributes } from '../models/ScheduledEmail';
import { getSequelize } from '../config/database';
import { logger } from '../config/logger';
import { recordAgentRun } from '../intelligence/agents/agentRegistry';

export interface SequenceStep {
  step: number;
  channel: 'email' | 'linkedin_connect' | 'linkedin_message' | 'voice' | string;
  prompt?: string;
  subject?: string;
  delay_days?: number;
  ai_tone?: string;
  step_goal?: string;
}

export interface StepperPreview {
  lead_id: number;
  lead_email: string | null;
  lead_name: string;
  campaign_id: string;
  campaign_name: string;
  current_pipeline_stage: string;
  days_overdue: number;
  next_step_index: number;
  next_step_channel: string;
  next_step_delay_days: number;
  next_action_at_new: string; // ISO; what we would set after queueing
  reason_skipped?: string; // present if this row would be skipped
}

export interface StepperResult {
  cycle_started_at: string;
  dry_run: boolean;
  total_overdue: number;
  considered: number;
  queued: number;
  skipped: number;
  previews: StepperPreview[];
  errors: string[];
}

const DEFAULT_BATCH_LIMIT = 10;

export function isStepperEnabled(): boolean {
  return process.env.PIPELINE_ENABLE_STEPPER === 'true';
}

/**
 * Heuristic: given a pipeline_stage, return the index of the next step to fire.
 * Returns null if we should not touch this lead.
 */
export function nextStepIndex(pipelineStage: string): number | null {
  switch (pipelineStage) {
    case 'new_lead':
      return 0; // first touch
    case 'contacted':
      return 1; // first follow-up after the initial touch
    default:
      // replied, meeting_scheduled, proposal_sent, negotiation, enrolled, lost:
      // never auto-step these; they need human review.
      return null;
  }
}

/**
 * Find leads with Lead.next_action_at <= now() AND a campaign assigned,
 * gated to the safe pipeline_stage values. Returns the raw rows + their
 * campaign so the caller can compute previews.
 */
async function findOverdueLeads(limit: number): Promise<Array<{ lead: Lead; campaign: Campaign }>> {
  // Raw SQL for the discovery query -- the rest of the service touches Sequelize
  // models normally. This sidesteps a Sequelize attribute-mapping issue on the
  // Lead model in this codebase and matches the pattern in usageStatsService.
  const sequelize = getSequelize();
  const rows = await sequelize.query<{ id: number }>(
    `SELECT id FROM leads
     WHERE next_action_at <= now()
       AND campaign_id IS NOT NULL
       AND pipeline_stage IN ('new_lead', 'contacted')
       AND status = 'active'
     ORDER BY next_action_at ASC
     LIMIT :limit`,
    { type: QueryTypes.SELECT, replacements: { limit } },
  );
  if (rows.length === 0) return [];

  const leadIds = rows.map(r => r.id);
  const leads = await Lead.findAll({ where: { id: { [Op.in]: leadIds } } });
  const leadMap = new Map(leads.map(l => [l.id, l]));

  const campaignIds = [...new Set(leads.map(l => l.campaign_id).filter(Boolean) as string[])];
  const campaigns = await Campaign.findAll({ where: { id: { [Op.in]: campaignIds } } });
  const campaignMap = new Map(campaigns.map(c => [c.id, c]));

  const pairs: Array<{ lead: Lead; campaign: Campaign }> = [];
  for (const id of leadIds) {
    const lead = leadMap.get(id);
    if (!lead || !lead.campaign_id) continue;
    const campaign = campaignMap.get(lead.campaign_id);
    if (!campaign) continue;
    pairs.push({ lead, campaign });
  }
  return pairs;
}

function getSequenceSteps(campaign: Campaign): SequenceStep[] {
  const raw = (campaign as unknown as { sequence_steps?: unknown }).sequence_steps;
  if (!Array.isArray(raw)) return [];
  return raw as SequenceStep[];
}

function daysOverdue(nextActionAt: Date | null | undefined): number {
  if (!nextActionAt) return 0;
  return Math.floor((Date.now() - new Date(nextActionAt).getTime()) / 86_400_000);
}

/**
 * Already queued a ScheduledEmail for this lead+campaign+step within the last
 * 7 days? Skip to avoid duplicate sends.
 */
async function isAlreadyQueuedOrSent(leadId: number, campaignId: string, stepIndex: number): Promise<boolean> {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const where: WhereOptions<ScheduledEmailAttributes> = {
    lead_id: leadId,
    campaign_id: campaignId,
    step_index: stepIndex,
    status: { [Op.in]: ['pending', 'approved', 'processing', 'sent'] },
    created_at: { [Op.gte]: since },
  } as WhereOptions<ScheduledEmailAttributes>;
  const existing = await ScheduledEmail.findOne({ where });
  return !!existing;
}

function previewForPair(lead: Lead, campaign: Campaign, step: SequenceStep, stepIndex: number): StepperPreview {
  const delay = step.delay_days ?? 3;
  return {
    lead_id: lead.id,
    lead_email: lead.email,
    lead_name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
    campaign_id: campaign.id,
    campaign_name: campaign.name,
    current_pipeline_stage: (lead as unknown as { pipeline_stage: string }).pipeline_stage,
    days_overdue: daysOverdue((lead as unknown as { next_action_at: Date | null }).next_action_at),
    next_step_index: stepIndex,
    next_step_channel: step.channel,
    next_step_delay_days: delay,
    next_action_at_new: new Date(Date.now() + delay * 86_400_000).toISOString(),
  };
}

/**
 * Run one stepper cycle. dry_run=true returns previews without DB writes.
 * dry_run=false creates ScheduledEmail rows and updates Lead.next_action_at.
 */
export async function runStepperCycle(opts: { dryRun?: boolean; limit?: number } = {}): Promise<StepperResult> {
  const dryRun = opts.dryRun ?? !isStepperEnabled();
  const limit = opts.limit ?? DEFAULT_BATCH_LIMIT;
  const startedAt = new Date();
  const result: StepperResult = {
    cycle_started_at: startedAt.toISOString(),
    dry_run: dryRun,
    total_overdue: 0,
    considered: 0,
    queued: 0,
    skipped: 0,
    previews: [],
    errors: [],
  };

  // Total overdue count (independent of batch limit) for visibility
  const sequelize = getSequelize();
  const [totalRow] = await sequelize.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM leads
     WHERE next_action_at <= now()
       AND campaign_id IS NOT NULL
       AND pipeline_stage IN ('new_lead', 'contacted')
       AND status = 'active'`,
    { type: QueryTypes.SELECT },
  );
  result.total_overdue = +totalRow.n;

  const pairs = await findOverdueLeads(limit);
  result.considered = pairs.length;

  for (const { lead, campaign } of pairs) {
    try {
      const steps = getSequenceSteps(campaign);
      if (steps.length === 0) {
        result.previews.push({
          lead_id: lead.id, lead_email: lead.email,
          lead_name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
          campaign_id: campaign.id, campaign_name: campaign.name,
          current_pipeline_stage: (lead as unknown as { pipeline_stage: string }).pipeline_stage,
          days_overdue: daysOverdue((lead as unknown as { next_action_at: Date | null }).next_action_at),
          next_step_index: -1, next_step_channel: '(none)', next_step_delay_days: 0,
          next_action_at_new: '',
          reason_skipped: 'campaign has no sequence_steps defined',
        });
        result.skipped++;
        continue;
      }
      const stepIdx = nextStepIndex((lead as unknown as { pipeline_stage: string }).pipeline_stage);
      if (stepIdx === null || stepIdx >= steps.length) {
        result.previews.push({
          lead_id: lead.id, lead_email: lead.email,
          lead_name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
          campaign_id: campaign.id, campaign_name: campaign.name,
          current_pipeline_stage: (lead as unknown as { pipeline_stage: string }).pipeline_stage,
          days_overdue: daysOverdue((lead as unknown as { next_action_at: Date | null }).next_action_at),
          next_step_index: stepIdx ?? -1, next_step_channel: '(beyond sequence)', next_step_delay_days: 0,
          next_action_at_new: '',
          reason_skipped: stepIdx === null ? 'pipeline_stage not auto-steppable' : 'sequence already complete',
        });
        result.skipped++;
        continue;
      }
      const step = steps[stepIdx];

      // ScheduledEmail model only handles email/voice/sms. LinkedIn touches
      // go through the Chrome extension, not this queue. Skip + surface so
      // Ali sees the LinkedIn-step leads need a different mechanism.
      if (step.channel !== 'email' && step.channel !== 'voice' && step.channel !== 'sms') {
        const pv = previewForPair(lead, campaign, step, stepIdx);
        pv.reason_skipped = `channel "${step.channel}" not handled by ScheduledEmail (LinkedIn flow uses the extension)`;
        result.previews.push(pv);
        result.skipped++;
        continue;
      }

      // Idempotency check: skip if recently queued/sent
      if (await isAlreadyQueuedOrSent(lead.id, campaign.id, stepIdx)) {
        const pv = previewForPair(lead, campaign, step, stepIdx);
        pv.reason_skipped = 'already queued or sent within last 7 days';
        result.previews.push(pv);
        result.skipped++;
        continue;
      }

      const preview = previewForPair(lead, campaign, step, stepIdx);
      result.previews.push(preview);

      if (!dryRun) {
        // Live: create ScheduledEmail row + update Lead.next_action_at to the
        // following step's delay (so this lead surfaces again when the next
        // follow-up is due).
        const nextStepDelay = steps[stepIdx + 1]?.delay_days ?? 0;
        const sequenceId = (campaign as unknown as { sequence_id?: string | null }).sequence_id ?? null;
        const phone = (lead as unknown as { phone?: string | null }).phone ?? null;
        const createPayload: ScheduledEmailCreationAttributes = {
          lead_id: lead.id,
          campaign_id: campaign.id,
          sequence_id: sequenceId,
          step_index: stepIdx,
          channel: step.channel,
          subject: step.subject || null,
          body: null, // dispatcher generates at send time
          to_email: step.channel === 'email' ? lead.email : null,
          to_phone: step.channel !== 'email' ? phone : null,
          voice_agent_type: null,
          max_attempts: 1,
          fallback_channel: null,
          scheduled_for: new Date(), // fire on next scheduler tick
          status: 'pending',
          ai_instructions: step.prompt || null,
          is_test_action: false,
          metadata: {
            step_number: stepIdx + 1,
            step_goal: step.step_goal,
            ai_tone: step.ai_tone,
          },
        };
        await ScheduledEmail.create(createPayload);

        const nextActionAt = nextStepDelay > 0
          ? new Date(Date.now() + nextStepDelay * 86_400_000)
          : null;
        await lead.update({ next_action_at: nextActionAt } as unknown as Partial<Lead>);
        result.queued++;
      }
    } catch (err) {
      const msg = `lead ${lead.id}: ${(err as Error).message}`;
      result.errors.push(msg);
      logger.warn('sequence_stepper: lead failed (non-fatal)', { lead_id: lead.id, error: (err as Error).message });
    }
  }

  recordAgentRun('sequence_stepper', {
    dry_run: dryRun,
    total_overdue: result.total_overdue,
    considered: result.considered,
    queued: result.queued,
    skipped: result.skipped,
    errors: result.errors.length,
  }).catch(() => {});

  return result;
}
