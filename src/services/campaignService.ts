import { Campaign, CampaignCreationAttributes, ApprovalStatus } from '../models/Campaign';
import { ValidationError, NotFoundError } from '../middleware/errors';

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

  return Campaign.create({
    ...input,
    settings,
    status: 'draft',
    campaign_mode: (input.campaign_mode as any) || 'standard',
    created_by: userId,
    approval_status: 'draft',
    budget_spent: 0,
    qa_status: 'untested',
  });
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
    const allowedFields = ['settings', 'ai_system_prompt', 'goals', 'gtm_notes'];
    const attemptedFields = Object.keys(updates);
    const disallowed = attemptedFields.filter((f) => !allowedFields.includes(f));
    if (disallowed.length > 0) {
      throw new ValidationError(
        `Cannot modify ${disallowed.join(', ')} on a ${campaign.approval_status} campaign`,
      );
    }
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
}) {
  const where: Record<string, unknown> = {};
  if (filters.status) where.status = filters.status;
  if (filters.type) where.type = filters.type;
  if (filters.approval_status) where.approval_status = filters.approval_status;

  return Campaign.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit: filters.limit || 25,
    offset: filters.offset || 0,
  });
}
