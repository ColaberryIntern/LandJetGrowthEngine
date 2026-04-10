import { Op } from 'sequelize';
import { VisitorSession } from '../models/VisitorSession';
import { PageEvent, PAGE_CATEGORIES } from '../models/PageEvent';
import { Visitor } from '../models/Visitor';

/**
 * Visitor Analytics Service
 * Uses existing visitor_sessions and page_events tables (reqs 24-27).
 */

export async function getVisitorDashboard(days: number = 7) {
  const since = new Date(Date.now() - days * 86400 * 1000);

  const [totalSessions, totalVisitors, totalPageViews, pagesByCategory, sessionsByDay] = await Promise.all([
    VisitorSession.count({ where: { started_at: { [Op.gte]: since } } }),
    Visitor.count({ where: { last_seen_at: { [Op.gte]: since } } }),
    PageEvent.count({ where: { created_at: { [Op.gte]: since } } }),

    // Page views by category
    PageEvent.findAll({
      attributes: ['page_category', [PageEvent.sequelize!.fn('COUNT', '*'), 'count']],
      where: { created_at: { [Op.gte]: since } },
      group: ['page_category'],
      order: [[PageEvent.sequelize!.fn('COUNT', '*'), 'DESC']],
      raw: true,
    }),

    // Sessions by day
    VisitorSession.findAll({
      attributes: [
        [VisitorSession.sequelize!.fn('DATE', VisitorSession.sequelize!.col('started_at')), 'day'],
        [VisitorSession.sequelize!.fn('COUNT', '*'), 'count'],
      ],
      where: { started_at: { [Op.gte]: since } },
      group: [VisitorSession.sequelize!.fn('DATE', VisitorSession.sequelize!.col('started_at'))],
      order: [[VisitorSession.sequelize!.fn('DATE', VisitorSession.sequelize!.col('started_at')), 'ASC']],
      raw: true,
    }),
  ]);

  const byCategory: Record<string, number> = {};
  for (const r of pagesByCategory as any[]) byCategory[r.page_category] = parseInt(r.count, 10);

  const daily: { day: string; sessions: number }[] = (sessionsByDay as any[]).map(r => ({
    day: r.day, sessions: parseInt(r.count, 10),
  }));

  // Bounce rate: sessions with only 1 page view
  const singlePageSessions = await VisitorSession.count({
    where: { started_at: { [Op.gte]: since }, page_count: { [Op.lte]: 1 } },
  });
  const bounceRate = totalSessions > 0 ? Math.round((singlePageSessions / totalSessions) * 100) : 0;

  // Avg pages per session
  const avgPages = totalSessions > 0 ? Math.round((totalPageViews / totalSessions) * 10) / 10 : 0;

  return {
    period_days: days,
    total_sessions: totalSessions,
    unique_visitors: totalVisitors,
    total_page_views: totalPageViews,
    bounce_rate: bounceRate,
    avg_pages_per_session: avgPages,
    page_views_by_category: byCategory,
    sessions_by_day: daily,
  };
}

export async function getTopPages(days: number = 7, limit: number = 10) {
  const since = new Date(Date.now() - days * 86400 * 1000);

  const pages = await PageEvent.findAll({
    attributes: ['page_url', [PageEvent.sequelize!.fn('COUNT', '*'), 'views']],
    where: { created_at: { [Op.gte]: since } },
    group: ['page_url'],
    order: [[PageEvent.sequelize!.fn('COUNT', '*'), 'DESC']],
    limit,
    raw: true,
  });

  return (pages as any[]).map(p => ({ url: p.page_url, views: parseInt(p.views, 10) }));
}
