import { Op } from 'sequelize';
import { InteractionOutcome } from '../models/InteractionOutcome';
import { ScheduledEmail } from '../models/ScheduledEmail';
import { logger } from '../config/logger';

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
 * Uses SQL GROUP BY instead of loading all rows into JS.
 */
export async function getCampaignMetrics(campaignId: string): Promise<CampaignMetrics> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const results = await InteractionOutcome.findAll({
    where: {
      campaign_id: campaignId,
      created_at: { [Op.gte]: sevenDaysAgo },
    },
    attributes: [
      'outcome',
      [InteractionOutcome.sequelize!.fn('COUNT', '*'), 'count'],
    ],
    group: ['outcome'],
    raw: true,
  }) as any[];

  const counts: Record<string, number> = {};
  for (const r of results) counts[r.outcome] = parseInt(r.count, 10);

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
 * Single query using UNION instead of 2 separate queries.
 * Uses parameterized queries to prevent SQL injection.
 */
export async function getHotLeads(campaignId?: string): Promise<number[]> {
  try {
    const campaignFilter = campaignId ? 'AND campaign_id = :campaignId' : '';
    const replacements = campaignId ? { campaignId } : {};

    const [results] = await InteractionOutcome.sequelize!.query(`
      SELECT DISTINCT lead_id FROM (
        SELECT lead_id FROM interaction_outcomes
        WHERE outcome = 'opened' ${campaignFilter}
        GROUP BY lead_id HAVING COUNT(*) >= 2
        UNION
        SELECT lead_id FROM interaction_outcomes
        WHERE outcome = 'clicked' ${campaignFilter}
        GROUP BY lead_id
      ) hot
    `, { replacements });

    return (results as any[]).map(r => r.lead_id);
  } catch (error) {
    logger.error('Failed to get hot leads', { campaignId, error: (error as Error).message });
    throw error;
  }
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
