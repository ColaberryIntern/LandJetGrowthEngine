import { Op } from 'sequelize';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { Lead } from '../models/Lead';
import { InteractionOutcome } from '../models/InteractionOutcome';
import { logger } from '../config/logger';

/**
 * Cohort Analytics Service
 * Covers requirements: User Engagement Data, Retention, Feature Adoption,
 * Cohort Segmentation, Conversion Rates, Engagement Metrics.
 */

export interface CohortResult {
  cohort: string;
  total_users: number;
  active_users: number;
  retention_rate: number;
  avg_actions: number;
}

export interface EngagementMetrics {
  total_users: number;
  active_last_7d: number;
  active_last_30d: number;
  dormant: number;
  avg_actions_per_user: number;
  feature_adoption: Record<string, number>;
}

export interface ConversionMetrics {
  total_leads: number;
  contacted: number;
  meetings_scheduled: number;
  enrolled: number;
  contact_rate: number;
  meeting_rate: number;
  enrollment_rate: number;
}

/**
 * Req 10, 13, 16: Retention analysis by registration cohort.
 */
export async function getRetentionByCohort(): Promise<CohortResult[]> {
  const users = await User.findAll({
    attributes: ['id', 'created_at', 'last_login_at', 'status'],
    raw: true,
  }) as any[];

  // Group by registration month
  const cohorts = new Map<string, { total: number; active: number; actions: number[] }>();

  for (const user of users) {
    const month = new Date(user.created_at).toISOString().substring(0, 7); // YYYY-MM
    if (!cohorts.has(month)) cohorts.set(month, { total: 0, active: 0, actions: [] });
    const c = cohorts.get(month)!;
    c.total++;

    if (user.status === 'active' && user.last_login_at) {
      const daysSinceLogin = (Date.now() - new Date(user.last_login_at).getTime()) / (86400 * 1000);
      if (daysSinceLogin <= 30) c.active++;
    }

    // Count actions per user
    const actionCount = await AuditLog.count({ where: { user_id: user.id } });
    c.actions.push(actionCount);
  }

  const results: CohortResult[] = [];
  for (const [month, data] of cohorts) {
    const avgActions = data.actions.length > 0
      ? Math.round(data.actions.reduce((s, n) => s + n, 0) / data.actions.length)
      : 0;
    results.push({
      cohort: month,
      total_users: data.total,
      active_users: data.active,
      retention_rate: data.total > 0 ? Math.round((data.active / data.total) * 100) : 0,
      avg_actions: avgActions,
    });
  }

  return results.sort((a, b) => a.cohort.localeCompare(b.cohort));
}

/**
 * Req 8, 14, 15, 18: User engagement metrics with feature adoption.
 */
export async function getEngagementMetrics(): Promise<EngagementMetrics> {
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 86400 * 1000);
  const thirtyDaysAgo = new Date(now - 30 * 86400 * 1000);

  const [totalUsers, activeWeek, activeMonth] = await Promise.all([
    User.count(),
    User.count({ where: { last_login_at: { [Op.gte]: sevenDaysAgo }, status: 'active' } }),
    User.count({ where: { last_login_at: { [Op.gte]: thirtyDaysAgo }, status: 'active' } }),
  ]);

  const dormant = totalUsers - activeMonth;

  // Feature adoption: count distinct actions in last 30 days
  const recentActions = await AuditLog.findAll({
    attributes: ['action', [AuditLog.sequelize!.fn('COUNT', AuditLog.sequelize!.col('action')), 'count']],
    where: { created_at: { [Op.gte]: thirtyDaysAgo } },
    group: ['action'],
    order: [[AuditLog.sequelize!.fn('COUNT', AuditLog.sequelize!.col('action')), 'DESC']],
    limit: 10,
    raw: true,
  }) as any[];

  const featureAdoption: Record<string, number> = {};
  for (const r of recentActions) featureAdoption[r.action] = parseInt(r.count, 10);

  // Average actions per user
  const totalActions = await AuditLog.count({ where: { created_at: { [Op.gte]: thirtyDaysAgo } } });
  const avgActions = activeMonth > 0 ? Math.round(totalActions / activeMonth) : 0;

  return {
    total_users: totalUsers,
    active_last_7d: activeWeek,
    active_last_30d: activeMonth,
    dormant,
    avg_actions_per_user: avgActions,
    feature_adoption: featureAdoption,
  };
}

/**
 * Req 9, 11, 12, 17: Conversion funnel metrics from leads.
 */
export async function getConversionMetrics(): Promise<ConversionMetrics> {
  const [total, contacted, meetings, enrolled] = await Promise.all([
    Lead.count({ where: { status: 'active' } }),
    Lead.count({ where: { pipeline_stage: { [Op.in]: ['contacted', 'meeting_scheduled', 'proposal_sent', 'negotiation', 'enrolled'] } } }),
    Lead.count({ where: { pipeline_stage: { [Op.in]: ['meeting_scheduled', 'proposal_sent', 'negotiation', 'enrolled'] } } }),
    Lead.count({ where: { pipeline_stage: 'enrolled' } }),
  ]);

  return {
    total_leads: total,
    contacted,
    meetings_scheduled: meetings,
    enrolled,
    contact_rate: total > 0 ? Math.round((contacted / total) * 100) : 0,
    meeting_rate: total > 0 ? Math.round((meetings / total) * 100) : 0,
    enrollment_rate: total > 0 ? Math.round((enrolled / total) * 100) : 0,
  };
}

/**
 * Req 14: Segment users by engagement level.
 */
export async function getEngagementSegments() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000);

  const [power, active, occasional, dormant] = await Promise.all([
    // Power users: logged in within 7 days + 10+ actions in 30 days
    User.count({
      where: {
        status: 'active',
        last_login_at: { [Op.gte]: sevenDaysAgo },
      },
    }),
    User.count({
      where: {
        status: 'active',
        last_login_at: { [Op.gte]: thirtyDaysAgo, [Op.lt]: sevenDaysAgo },
      },
    }),
    User.count({
      where: {
        status: 'active',
        [Op.or]: [
          { last_login_at: { [Op.lt]: thirtyDaysAgo } },
          { last_login_at: null },
        ],
      },
    }),
    User.count({ where: { status: { [Op.ne]: 'active' } } }),
  ]);

  return {
    power_users: power,
    active_users: active,
    occasional_users: occasional,
    dormant_users: dormant,
  };
}
