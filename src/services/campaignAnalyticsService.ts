import { Op } from 'sequelize';
import { InteractionOutcome } from '../models/InteractionOutcome';
import { ScheduledEmail } from '../models/ScheduledEmail';

export interface CampaignMetrics {
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  booked_meeting: number;
  open_rate: number;
  click_rate: number;
  reply_rate: number;
  bounce_rate: number;
  meeting_rate: number;
}

/**
 * Calculate 7-day rolling engagement metrics for a campaign.
 */
export async function getCampaignMetrics(campaignId: string): Promise<CampaignMetrics> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const outcomes = await InteractionOutcome.findAll({
    where: {
      campaign_id: campaignId,
      created_at: { [Op.gte]: sevenDaysAgo },
    },
    attributes: ['outcome'],
  });

  const counts: Record<string, number> = {};
  for (const o of outcomes) {
    counts[o.outcome] = (counts[o.outcome] || 0) + 1;
  }

  const sent = counts['sent'] || 0;
  const opened = counts['opened'] || 0;
  const clicked = counts['clicked'] || 0;
  const replied = counts['replied'] || 0;
  const bounced = counts['bounced'] || 0;
  const booked_meeting = counts['booked_meeting'] || 0;

  const rate = (num: number) => (sent > 0 ? Math.round((num / sent) * 10000) / 100 : 0);

  return {
    sent, opened, clicked, replied, bounced, booked_meeting,
    open_rate: rate(opened),
    click_rate: rate(clicked),
    reply_rate: rate(replied),
    bounce_rate: rate(bounced),
    meeting_rate: rate(booked_meeting),
  };
}

/**
 * Detect hot leads: 2+ email opens OR any click.
 */
export async function getHotLeads(campaignId?: string): Promise<number[]> {
  const where: Record<string, unknown> = {};
  if (campaignId) where.campaign_id = campaignId;

  // Leads with 2+ opens
  const multiOpens = await InteractionOutcome.findAll({
    where: { ...where, outcome: 'opened' },
    attributes: ['lead_id'],
    group: ['lead_id'],
    having: InteractionOutcome.sequelize!.literal('COUNT(*) >= 2'),
    raw: true,
  });

  // Leads with any click
  const clicks = await InteractionOutcome.findAll({
    where: { ...where, outcome: 'clicked' },
    attributes: ['lead_id'],
    group: ['lead_id'],
    raw: true,
  });

  const hotSet = new Set<number>();
  for (const r of multiOpens as any[]) hotSet.add(r.lead_id);
  for (const r of clicks as any[]) hotSet.add(r.lead_id);

  return Array.from(hotSet);
}

/**
 * Get dashboard KPIs.
 */
export async function getDashboardKPIs() {
  const { Lead } = require('../models/Lead');
  const { Campaign } = require('../models/Campaign');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalLeads, activeCampaigns, sendsToday, hotLeads] = await Promise.all([
    Lead.count({ where: { status: 'active' } }),
    Campaign.count({ where: { status: 'active' } }),
    InteractionOutcome.count({ where: { outcome: 'sent', created_at: { [Op.gte]: today } } }),
    getHotLeads(),
  ]);

  return {
    total_leads: totalLeads,
    active_campaigns: activeCampaigns,
    sends_today: sendsToday,
    hot_leads_count: hotLeads.length,
  };
}
