import { Op } from 'sequelize';
import { Lead } from '../models/Lead';
import { Campaign } from '../models/Campaign';
import { InteractionOutcome } from '../models/InteractionOutcome';
import { sendOutreachEmail } from './outreachEmailService';
import { logger } from '../config/logger';

export interface KPIReport {
  period: string;
  total_leads: number;
  active_campaigns: number;
  emails_sent_this_week: number;
  emails_opened: number;
  emails_replied: number;
  open_rate: number;
  reply_rate: number;
  leads_contacted: number;
  leads_never_contacted: number;
  hot_leads: number;
  pipeline: Record<string, number>;
  by_campaign: { name: string; sent: number; opened: number; replied: number }[];
  generated_at: string;
}

export async function generateWeeklyKPIReport(): Promise<KPIReport> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [totalLeads, activeCampaigns, outcomes, contacted, neverContacted] = await Promise.all([
    Lead.count({ where: { status: 'active' } }),
    Campaign.count({ where: { status: 'active' } }),
    InteractionOutcome.findAll({
      where: { created_at: { [Op.gte]: sevenDaysAgo } },
      attributes: ['outcome', 'campaign_id', [InteractionOutcome.sequelize!.fn('COUNT', '*'), 'count']],
      group: ['outcome', 'campaign_id'],
      raw: true,
    }) as Promise<any[]>,
    Lead.count({ where: { last_contacted_at: { [Op.ne]: null } } }),
    Lead.count({ where: { last_contacted_at: null, status: 'active' } }),
  ]);

  // Aggregate outcomes
  let sent = 0, opened = 0, replied = 0;
  const campaignOutcomes: Record<string, { sent: number; opened: number; replied: number }> = {};

  for (const o of outcomes) {
    const count = parseInt(o.count, 10);
    if (o.outcome === 'sent') sent += count;
    if (o.outcome === 'opened') opened += count;
    if (o.outcome === 'replied') replied += count;

    if (o.campaign_id) {
      if (!campaignOutcomes[o.campaign_id]) campaignOutcomes[o.campaign_id] = { sent: 0, opened: 0, replied: 0 };
      if (o.outcome === 'sent') campaignOutcomes[o.campaign_id].sent += count;
      if (o.outcome === 'opened') campaignOutcomes[o.campaign_id].opened += count;
      if (o.outcome === 'replied') campaignOutcomes[o.campaign_id].replied += count;
    }
  }

  // Get campaign names
  const campaigns = await Campaign.findAll({ where: { status: 'active' }, attributes: ['id', 'name'] });
  const campaignMap = new Map(campaigns.map(c => [c.id, c.name]));

  const byCampaign = Object.entries(campaignOutcomes).map(([id, data]) => ({
    name: campaignMap.get(id) || 'Unknown',
    ...data,
  })).sort((a, b) => b.sent - a.sent);

  // Pipeline
  const pipelineRaw = await Lead.findAll({
    where: { status: 'active' },
    attributes: ['pipeline_stage', [Lead.sequelize!.fn('COUNT', '*'), 'count']],
    group: ['pipeline_stage'],
    raw: true,
  }) as any[];

  const pipeline: Record<string, number> = {};
  for (const r of pipelineRaw) pipeline[r.pipeline_stage] = parseInt(r.count, 10);

  // Hot leads (2+ opens or any click)
  const hotCount = await InteractionOutcome.count({
    where: { outcome: { [Op.in]: ['clicked', 'replied'] }, created_at: { [Op.gte]: sevenDaysAgo } },
    distinct: true,
    col: 'lead_id',
  } as any);

  return {
    period: `${sevenDaysAgo.toLocaleDateString()} - ${new Date().toLocaleDateString()}`,
    total_leads: totalLeads,
    active_campaigns: activeCampaigns,
    emails_sent_this_week: sent,
    emails_opened: opened,
    emails_replied: replied,
    open_rate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
    reply_rate: sent > 0 ? Math.round((replied / sent) * 100) : 0,
    leads_contacted: contacted,
    leads_never_contacted: neverContacted,
    hot_leads: hotCount as number,
    pipeline,
    by_campaign: byCampaign,
    generated_at: new Date().toISOString(),
  };
}

export async function sendWeeklyKPIEmail(recipientEmail: string): Promise<{ success: boolean }> {
  const report = await generateWeeklyKPIReport();

  const body = `Weekly KPI Report - LandJet Growth Engine
${report.period}

OVERVIEW
- Total Leads: ${report.total_leads.toLocaleString()}
- Active Campaigns: ${report.active_campaigns}
- Emails Sent This Week: ${report.emails_sent_this_week}
- Open Rate: ${report.open_rate}%
- Reply Rate: ${report.reply_rate}%
- Hot Leads: ${report.hot_leads}

PIPELINE
${Object.entries(report.pipeline).map(([stage, count]) => `- ${stage}: ${count}`).join('\n')}

CONTACTED
- Leads Contacted: ${report.leads_contacted.toLocaleString()}
- Never Contacted: ${report.leads_never_contacted.toLocaleString()}

BY CAMPAIGN (This Week)
${report.by_campaign.map(c => `- ${c.name}: ${c.sent} sent, ${c.opened} opened, ${c.replied} replied`).join('\n')}

Generated: ${new Date().toLocaleString()}
`;

  const result = await sendOutreachEmail({
    to: recipientEmail,
    subject: `Weekly KPI Report - ${new Date().toLocaleDateString()}`,
    body,
    from: 'rlandry@landjet.com',
    senderName: 'LandJet Growth Engine',
  });

  logger.info('Weekly KPI email sent', { to: recipientEmail, success: result.success });
  return { success: result.success };
}
