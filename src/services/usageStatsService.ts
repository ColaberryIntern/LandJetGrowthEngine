/**
 * Usage stats service.
 *
 * Reads from `leads.last_contacted_at` (truth source for historical sends since
 * communication_logs only started populating 2026-05-14 with the writeCommLog
 * change). Once communication_logs has 30 days of history, this can switch to
 * read from there for richer detail (per-status, delivery_mode breakdown).
 */

import { Op, QueryTypes } from 'sequelize';
import { Lead } from '../models/Lead';
import { getSequelize } from '../config/database';

export interface DailySend {
  day: string;        // ISO date 'YYYY-MM-DD'
  sends: number;
}

export interface CampaignUsage {
  campaign_name: string;
  sends_30d: number;
  last_send: string | null; // ISO timestamp
}

export interface UsageSummary {
  sends_last_7d: number;
  sends_last_30d: number;
  active_days_last_30d: number; // days with at least one send
  avg_sends_per_active_day: number;
  last_active: string | null;
  daily: DailySend[];        // last 30 days, descending
  by_campaign: CampaignUsage[]; // last 30 days, top campaigns
}

export async function getUsageSummary(): Promise<UsageSummary> {
  const sequelize = getSequelize();
  const since30 = new Date(Date.now() - 30 * 86400_000);
  const since7 = new Date(Date.now() - 7 * 86400_000);

  const [sends7, sends30] = await Promise.all([
    Lead.count({ where: { last_contacted_at: { [Op.gt]: since7 } } }),
    Lead.count({ where: { last_contacted_at: { [Op.gt]: since30 } } }),
  ]);

  const daily = await sequelize.query<{ day: string; sends: string }>(
    `SELECT to_char(date_trunc('day', last_contacted_at), 'YYYY-MM-DD') AS day,
            COUNT(*) AS sends
     FROM leads
     WHERE last_contacted_at > :since
     GROUP BY 1
     ORDER BY 1 DESC`,
    { type: QueryTypes.SELECT, replacements: { since: since30 } },
  );

  const byCampaign = await sequelize.query<{ campaign_name: string; sends: string; last_send: Date | null }>(
    `SELECT c.name AS campaign_name,
            COUNT(*) AS sends,
            MAX(l.last_contacted_at) AS last_send
     FROM leads l
     JOIN campaigns c ON c.id = l.campaign_id
     WHERE l.last_contacted_at > :since
     GROUP BY c.name
     ORDER BY sends DESC
     LIMIT 15`,
    { type: QueryTypes.SELECT, replacements: { since: since30 } },
  );

  const lastActiveRow = await sequelize.query<{ last_active: Date | null }>(
    `SELECT MAX(last_contacted_at) AS last_active FROM leads`,
    { type: QueryTypes.SELECT },
  );

  const dailyParsed: DailySend[] = daily.map(d => ({ day: d.day, sends: parseInt(d.sends, 10) }));
  const activeDays = dailyParsed.length;
  const avgPerActive = activeDays > 0 ? Math.round((sends30 / activeDays) * 10) / 10 : 0;

  return {
    sends_last_7d: sends7,
    sends_last_30d: sends30,
    active_days_last_30d: activeDays,
    avg_sends_per_active_day: avgPerActive,
    last_active: lastActiveRow[0]?.last_active ? new Date(lastActiveRow[0].last_active).toISOString() : null,
    daily: dailyParsed,
    by_campaign: byCampaign.map(c => ({
      campaign_name: c.campaign_name,
      sends_30d: parseInt(c.sends, 10),
      last_send: c.last_send ? new Date(c.last_send).toISOString() : null,
    })),
  };
}
