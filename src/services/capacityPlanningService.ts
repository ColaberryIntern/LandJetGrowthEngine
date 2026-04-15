import { Op } from 'sequelize';
import { Lead } from '../models/Lead';
import { ScheduledEmail } from '../models/ScheduledEmail';
import { InteractionOutcome } from '../models/InteractionOutcome';
import { JobExecution } from '../models/JobExecution';
import { Campaign } from '../models/Campaign';
import { User } from '../models/User';
import { SystemSetting } from '../models/SystemSetting';
import { SCHEDULER } from '../config/schedulerConstants';
import { ValidationError } from '../middleware/errors';
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

// --- Dynamic Resource Configuration ---

export interface ResourceConfig {
  max_per_cycle: number;
  max_per_campaign: number;
  send_window_start: number;
  send_window_end: number;
  max_daily_calls: number;
  api_rate_limit: number;
  retry_delay_minutes: number;
}

const SETTING_KEY = 'scheduler.resource_config';

const DEFAULT_RESOURCE_CONFIG: ResourceConfig = {
  max_per_cycle: SCHEDULER.MAX_PER_CYCLE,
  max_per_campaign: SCHEDULER.MAX_PER_CAMPAIGN,
  send_window_start: SCHEDULER.SEND_WINDOW_START,
  send_window_end: SCHEDULER.SEND_WINDOW_END,
  max_daily_calls: SCHEDULER.MAX_DAILY_CALLS,
  api_rate_limit: 100,
  retry_delay_minutes: SCHEDULER.RETRY_DELAY_MS / 60000,
};

export async function getResourceConfig(): Promise<ResourceConfig> {
  try {
    const row = await SystemSetting.findByPk(SETTING_KEY);
    if (!row) return { ...DEFAULT_RESOURCE_CONFIG };
    const val = row.value as any;
    return {
      max_per_cycle: val.max_per_cycle ?? DEFAULT_RESOURCE_CONFIG.max_per_cycle,
      max_per_campaign: val.max_per_campaign ?? DEFAULT_RESOURCE_CONFIG.max_per_campaign,
      send_window_start: val.send_window_start ?? DEFAULT_RESOURCE_CONFIG.send_window_start,
      send_window_end: val.send_window_end ?? DEFAULT_RESOURCE_CONFIG.send_window_end,
      max_daily_calls: val.max_daily_calls ?? DEFAULT_RESOURCE_CONFIG.max_daily_calls,
      api_rate_limit: val.api_rate_limit ?? DEFAULT_RESOURCE_CONFIG.api_rate_limit,
      retry_delay_minutes: val.retry_delay_minutes ?? DEFAULT_RESOURCE_CONFIG.retry_delay_minutes,
    };
  } catch {
    return { ...DEFAULT_RESOURCE_CONFIG };
  }
}

export async function updateResourceConfig(updates: Partial<ResourceConfig>): Promise<ResourceConfig> {
  // Validate ranges
  if (updates.max_per_cycle != null && (updates.max_per_cycle < 1 || updates.max_per_cycle > 200)) {
    throw new ValidationError('max_per_cycle must be between 1 and 200');
  }
  if (updates.max_per_campaign != null && (updates.max_per_campaign < 1 || updates.max_per_campaign > 50)) {
    throw new ValidationError('max_per_campaign must be between 1 and 50');
  }
  if (updates.send_window_start != null && (updates.send_window_start < 0 || updates.send_window_start > 23)) {
    throw new ValidationError('send_window_start must be between 0 and 23');
  }
  if (updates.send_window_end != null && (updates.send_window_end < 1 || updates.send_window_end > 24)) {
    throw new ValidationError('send_window_end must be between 1 and 24');
  }
  if (updates.max_daily_calls != null && (updates.max_daily_calls < 0 || updates.max_daily_calls > 500)) {
    throw new ValidationError('max_daily_calls must be between 0 and 500');
  }
  if (updates.api_rate_limit != null && (updates.api_rate_limit < 10 || updates.api_rate_limit > 1000)) {
    throw new ValidationError('api_rate_limit must be between 10 and 1000');
  }
  if (updates.retry_delay_minutes != null && (updates.retry_delay_minutes < 1 || updates.retry_delay_minutes > 120)) {
    throw new ValidationError('retry_delay_minutes must be between 1 and 120');
  }

  const current = await getResourceConfig();
  const merged: ResourceConfig = { ...current, ...updates };

  await SystemSetting.upsert({
    key: SETTING_KEY,
    value: merged as any,
    description: 'Scheduler and infrastructure resource limits',
  });

  logger.info('Resource config updated', { updates });
  return merged;
}
