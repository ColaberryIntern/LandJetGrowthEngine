import { Op } from 'sequelize';
import { Lead } from '../models/Lead';
import { ScheduledEmail } from '../models/ScheduledEmail';
import { InteractionOutcome } from '../models/InteractionOutcome';
import { JobExecution } from '../models/JobExecution';
import { Campaign } from '../models/Campaign';
import { User } from '../models/User';
import { logger } from '../config/logger';

/**
 * Capacity Planning Service
 * Covers: stress testing metrics (req 7), capacity forecasting (req 10),
 * system growth analysis, and optimization recommendations.
 */

export async function getCapacityReport() {
  const now = Date.now();
  const day = 86400 * 1000;
  const periods = [
    { label: 'last_7d', since: new Date(now - 7 * day) },
    { label: 'last_30d', since: new Date(now - 30 * day) },
    { label: 'last_90d', since: new Date(now - 90 * day) },
  ];

  const growth: Record<string, { leads: number; emails: number; interactions: number; jobs: number }> = {};

  for (const p of periods) {
    const [leads, emails, interactions, jobs] = await Promise.all([
      Lead.count({ where: { created_at: { [Op.gte]: p.since } } }),
      ScheduledEmail.count({ where: { created_at: { [Op.gte]: p.since } } }),
      InteractionOutcome.count({ where: { created_at: { [Op.gte]: p.since } } }),
      JobExecution.count({ where: { started_at: { [Op.gte]: p.since } } }),
    ]);
    growth[p.label] = { leads, emails, interactions, jobs };
  }

  // Current capacity usage
  const [totalLeads, totalCampaigns, totalUsers, pendingActions, failedJobs] = await Promise.all([
    Lead.count(),
    Campaign.count({ where: { status: 'active' } }),
    User.count({ where: { status: 'active' } }),
    ScheduledEmail.count({ where: { status: { [Op.in]: ['pending', 'approved', 'draft'] } } }),
    JobExecution.count({ where: { status: 'failed' } }),
  ]);

  // Scheduler throughput (actions processed per day, last 7 days)
  const sentLast7d = await ScheduledEmail.count({
    where: { status: 'sent', sent_at: { [Op.gte]: new Date(now - 7 * day) } },
  });
  const dailyThroughput = Math.round(sentLast7d / 7);

  // Bottleneck detection
  const bottlenecks: string[] = [];
  if (pendingActions > 100) bottlenecks.push(`${pendingActions} actions pending — scheduler may be falling behind`);
  if (failedJobs > 10) bottlenecks.push(`${failedJobs} failed jobs — investigate error patterns`);
  if (dailyThroughput > 200) bottlenecks.push(`High throughput (${dailyThroughput}/day) — monitor scheduler cycle times`);

  // Growth rate (leads per week)
  const weeklyGrowthRate = growth.last_30d.leads > 0
    ? Math.round((growth.last_7d.leads / (growth.last_30d.leads / 4)) * 100) / 100
    : 0;

  // Recommendations
  const recommendations: string[] = [];
  if (weeklyGrowthRate > 1.5) recommendations.push('Lead growth accelerating — consider increasing scheduler MAX_PER_CYCLE');
  if (pendingActions > dailyThroughput * 2) recommendations.push('Pending backlog exceeds 2 days throughput — review send window or capacity');
  if (failedJobs > 5) recommendations.push('Review failed job patterns for systematic issues');
  if (recommendations.length === 0) recommendations.push('System operating within normal capacity parameters');

  return {
    current: {
      total_leads: totalLeads,
      active_campaigns: totalCampaigns,
      active_users: totalUsers,
      pending_actions: pendingActions,
      failed_jobs: failedJobs,
      daily_throughput: dailyThroughput,
    },
    growth,
    weekly_growth_multiplier: weeklyGrowthRate,
    bottlenecks,
    recommendations,
  };
}
