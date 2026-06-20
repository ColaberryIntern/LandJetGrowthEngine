import { Op } from 'sequelize';
import { Campaign, CampaignCreationAttributes, ApprovalStatus } from '../models/Campaign';
import { Lead } from '../models/Lead';
import { buildStatesPattern } from './leadService';
import { ValidationError, NotFoundError } from '../middleware/errors';
import { logger } from '../config/logger';

const VALID_APPROVAL_TRANSITIONS: Record<ApprovalStatus, ApprovalStatus[]> = {
  draft: ['pending_approval'],
  pending_approval: ['approved', 'draft'],
  approved: ['live', 'paused'],
  live: ['paused', 'completed'],
  paused: ['live', 'completed', 'draft'],
  completed: [],
};

const DEFAULT_SETTINGS = {
  test_mode_enabled: false,
  delay_between_sends: 120,
  max_leads_per_cycle: 10,
  call_time_start: '09:00',
  call_time_end: '17:00',
  call_timezone: 'America/Chicago',
  call_active_days: [1, 2, 3, 4, 5],
  max_daily_calls: 50,
  voicemail_enabled: true,
  auto_dnc_on_request: true,
};

export async function createCampaign(
  input: Omit<CampaignCreationAttributes, 'status' | 'campaign_mode'> & {
    campaign_mode?: string;
  },
  userId: string,
) {
  if (!input.name || !input.type) {
    throw new ValidationError('name and type are required');
  }

  const settings = { ...DEFAULT_SETTINGS, ...(input.settings || {}) };

  try {
    const campaign = await Campaign.create({
      ...input,
      settings,
      status: 'draft',
      campaign_mode: (input.campaign_mode as any) || 'standard',
      created_by: userId,
      approval_status: 'draft',
      budget_spent: 0,
      qa_status: 'untested',
    });
    logger.info('Campaign created', { id: campaign.id, name: campaign.name, type: campaign.type });
    return campaign;
  } catch (error) {
    logger.error('Failed to create campaign', { name: input.name, error: (error as Error).message });
    throw error;
  }
}

export async function getCampaignById(id: string) {
  const campaign = await Campaign.findByPk(id);
  if (!campaign) throw new NotFoundError('Campaign not found');
  return campaign;
}

export async function updateCampaign(id: string, updates: Partial<CampaignCreationAttributes>) {
  const campaign = await Campaign.findByPk(id);
  if (!campaign) throw new NotFoundError('Campaign not found');

  if (campaign.approval_status === 'live' || campaign.approval_status === 'completed') {
    const allowedFields = ['settings', 'ai_system_prompt', 'goals', 'gtm_notes', 'sequence_steps', 'channel_config'];
    const attemptedFields = Object.keys(updates);
    const disallowed = attemptedFields.filter((f) => !allowedFields.includes(f));
    if (disallowed.length > 0) {
      throw new ValidationError(
        `Cannot modify ${disallowed.join(', ')} on a ${campaign.approval_status} campaign`,
      );
    }
  }

  // Merge settings and channel_config instead of replacing
  if (updates.settings && campaign.settings) {
    (updates as any).settings = { ...(campaign.settings as any), ...(updates.settings as any) };
    // Deep merge variables if both exist
    if ((campaign.settings as any).variables && (updates.settings as any).variables) {
      (updates as any).settings.variables = { ...(campaign.settings as any).variables, ...(updates.settings as any).variables };
    }
  }
  if ((updates as any).channel_config && campaign.channel_config) {
    (updates as any).channel_config = { ...(campaign.channel_config as any), ...(updates as any).channel_config };
  }

  await campaign.update(updates);
  return campaign;
}

export async function transitionApproval(
  id: string,
  newStatus: ApprovalStatus,
  userId: string,
) {
  const campaign = await Campaign.findByPk(id);
  if (!campaign) throw new NotFoundError('Campaign not found');

  const allowed = VALID_APPROVAL_TRANSITIONS[campaign.approval_status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new ValidationError(
      `Cannot transition from '${campaign.approval_status}' to '${newStatus}'. Valid transitions: ${allowed?.join(', ') || 'none'}`,
    );
  }

  const updateData: Partial<Campaign> = { approval_status: newStatus } as any;

  if (newStatus === 'approved') {
    (updateData as any).approved_by = userId;
    (updateData as any).approved_at = new Date();
  }

  if (newStatus === 'live') {
    (updateData as any).status = 'active';
  } else if (newStatus === 'paused') {
    (updateData as any).status = 'paused';
  } else if (newStatus === 'completed') {
    (updateData as any).status = 'completed';
  } else if (newStatus === 'draft') {
    (updateData as any).status = 'draft';
  }

  await campaign.update(updateData);
  logger.info('Campaign approval transitioned', { id, from: campaign.approval_status, to: newStatus });
  return campaign;
}

export async function linkSequence(campaignId: string, sequenceId: string) {
  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign) throw new NotFoundError('Campaign not found');

  await campaign.update({ sequence_id: sequenceId });
  return campaign;
}

export async function listCampaigns(filters: {
  status?: string;
  type?: string;
  approval_status?: string;
  limit?: number;
  offset?: number;
  // Territory scope: when set, restrict to campaigns that have at least one
  // lead in these states, so a territory rep (Percy=TX, Grant=IA) only sees the
  // campaigns relevant to their location. Empty/undefined = all campaigns.
  states?: string[];
}) {
  const where: Record<string, unknown> = {};
  if (filters.status) where.status = filters.status;
  if (filters.type) where.type = filters.type;
  if (filters.approval_status) where.approval_status = filters.approval_status;

  if (filters.states && filters.states.length > 0) {
    const rows = await Lead.findAll({
      attributes: ['campaign_id'],
      where: { campaign_id: { [Op.ne]: null }, state: { [Op.iRegexp]: buildStatesPattern(filters.states) } },
      group: ['campaign_id'],
    });
    const ids = rows.map((r) => (r as unknown as { campaign_id: string }).campaign_id).filter(Boolean);
    // No campaigns have leads in this territory -> return an empty set rather than all.
    where.id = ids.length ? { [Op.in]: ids } : { [Op.in]: ['00000000-0000-0000-0000-000000000000'] };
  }

  const limit = Math.min(Math.max(filters.limit || 25, 1), 100);
  const offset = Math.max(filters.offset || 0, 0);

  return Campaign.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit,
    offset,
    attributes: ['id', 'name', 'type', 'status', 'approval_status', 'campaign_mode',
      'ai_system_prompt', 'settings', 'channel_config', 'sequence_steps', 'qa_status',
      'budget_total', 'budget_spent', 'created_at', 'updated_at'],
  });
}
