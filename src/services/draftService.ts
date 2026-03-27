import { Op } from 'sequelize';
import { ScheduledEmail, ScheduledEmailMetadata } from '../models/ScheduledEmail';
import { Campaign } from '../models/Campaign';
import { Lead } from '../models/Lead';
import { createAuditLog } from './auditLogService';
import { ValidationError, NotFoundError } from '../middleware/errors';
import { logger } from '../config/logger';

export interface CreateDraftInput {
  lead_id: number;
  campaign_id: string;
  sequence_id: string;
  step_index: number;
  subject: string;
  body: string;
  to_email: string;
  ai_instructions: string;
  metadata: ScheduledEmailMetadata;
}

export interface DraftFilters {
  campaign_id?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface DraftStats {
  pending_drafts: number;
  approved_today: number;
  rejected_today: number;
  sent_today: number;
}

/**
 * Create a draft email. Checks for duplicates first.
 */
export async function createDraft(input: CreateDraftInput): Promise<ScheduledEmail> {
  // Check for existing draft for same campaign+lead+step
  const existing = await ScheduledEmail.findOne({
    where: {
      campaign_id: input.campaign_id,
      lead_id: input.lead_id,
      step_index: input.step_index,
      status: { [Op.in]: ['draft', 'approved'] },
    },
  });

  if (existing) {
    // Cancel old draft before creating new one
    await existing.update({ status: 'cancelled' });
    logger.info('Cancelled existing draft for new version', { id: existing.id });
  }

  return ScheduledEmail.create({
    lead_id: input.lead_id,
    campaign_id: input.campaign_id,
    sequence_id: input.sequence_id,
    step_index: input.step_index,
    channel: 'email',
    subject: input.subject,
    body: input.body,
    to_email: input.to_email,
    max_attempts: 1,
    fallback_channel: null,
    scheduled_for: new Date(),
    status: 'draft',
    ai_instructions: input.ai_instructions,
    ai_generated: true,
    is_test_action: false,
    metadata: {
      ...input.metadata,
      draft_mode: true,
      draft_version: (existing?.metadata?.draft_version || 0) + 1,
    },
  });
}

/**
 * List drafts with lead context.
 */
export async function listDrafts(filters: DraftFilters) {
  const where: Record<string, unknown> = { status: 'draft' };
  if (filters.campaign_id) where.campaign_id = filters.campaign_id;

  const drafts = await ScheduledEmail.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit: filters.limit || 25,
    offset: filters.offset || 0,
  });

  // Enrich with lead data
  const enriched = await Promise.all(
    drafts.rows.map(async (draft) => {
      const lead = await Lead.findByPk(draft.lead_id);
      return {
        ...draft.toJSON(),
        lead: lead
          ? { id: lead.id, first_name: lead.first_name, last_name: lead.last_name, email: lead.email, company: lead.company, title: lead.title }
          : null,
      };
    }),
  );

  return { drafts: enriched, total: drafts.count };
}

/**
 * Approve a draft - transitions to 'approved' so scheduler picks it up.
 */
export async function approveDraft(draftId: string, userId: string): Promise<ScheduledEmail> {
  const draft = await ScheduledEmail.findByPk(draftId);
  if (!draft) throw new NotFoundError('Draft not found');
  if (draft.status !== 'draft') {
    throw new ValidationError(`Cannot approve a draft with status '${draft.status}'`);
  }

  // Check campaign is still active
  if (draft.campaign_id) {
    const campaign = await Campaign.findByPk(draft.campaign_id);
    if (campaign && campaign.status !== 'active') {
      throw new ValidationError(`Campaign is '${campaign.status}', cannot approve draft`);
    }
  }

  await draft.update({
    status: 'approved',
    scheduled_for: new Date(), // Scheduler picks up immediately
    metadata: {
      ...draft.metadata,
      approved_by: userId,
      approved_at: new Date().toISOString(),
    },
  });

  await createAuditLog({
    userId,
    action: 'draft.approve',
    entityType: 'scheduled_email',
    entityId: draftId,
    newValue: { status: 'approved' },
  });

  return draft;
}

/**
 * Reject a draft.
 */
export async function rejectDraft(draftId: string, userId: string, reason?: string): Promise<ScheduledEmail> {
  const draft = await ScheduledEmail.findByPk(draftId);
  if (!draft) throw new NotFoundError('Draft not found');
  if (draft.status !== 'draft') {
    throw new ValidationError(`Cannot reject a draft with status '${draft.status}'`);
  }

  await draft.update({
    status: 'cancelled',
    metadata: {
      ...draft.metadata,
      rejection_reason: reason || 'Rejected by reviewer',
    },
  });

  await createAuditLog({
    userId,
    action: 'draft.reject',
    entityType: 'scheduled_email',
    entityId: draftId,
    newValue: { status: 'cancelled', reason },
  });

  return draft;
}

/**
 * Edit draft content before approval.
 */
export async function editDraft(draftId: string, updates: { subject?: string; body?: string }): Promise<ScheduledEmail> {
  const draft = await ScheduledEmail.findByPk(draftId);
  if (!draft) throw new NotFoundError('Draft not found');
  if (draft.status !== 'draft') {
    throw new ValidationError(`Cannot edit a draft with status '${draft.status}'`);
  }

  await draft.update(updates);
  return draft;
}

/**
 * Get draft stats for dashboard.
 */
export async function getDraftStats(campaignId?: string): Promise<DraftStats> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const baseWhere: Record<string, unknown> = {};
  if (campaignId) baseWhere.campaign_id = campaignId;

  const [pending, approved, rejected, sent] = await Promise.all([
    ScheduledEmail.count({ where: { ...baseWhere, status: 'draft' } }),
    ScheduledEmail.count({ where: { ...baseWhere, status: 'approved', created_at: { [Op.gte]: todayStart } } }),
    ScheduledEmail.count({ where: { ...baseWhere, status: 'cancelled', created_at: { [Op.gte]: todayStart }, 'metadata.draft_mode': true } as any }),
    ScheduledEmail.count({ where: { ...baseWhere, status: 'sent', created_at: { [Op.gte]: todayStart }, 'metadata.draft_mode': true } as any }),
  ]);

  return { pending_drafts: pending, approved_today: approved, rejected_today: rejected, sent_today: sent };
}
