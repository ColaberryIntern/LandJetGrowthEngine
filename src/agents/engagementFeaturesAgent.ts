import { Op } from 'sequelize';
import { generateMessage } from '../services/aiMessageService';
import { registerAgent, getAgent } from '../intelligence/agents/agentRegistry';
import { InteractionOutcome } from '../models/InteractionOutcome';
import { PageEvent } from '../models/PageEvent';
import { Lead } from '../models/Lead';
import { User } from '../models/User';
import { AiAgent } from '../models/AiAgent';
import { createNotification } from '../services/notificationService';
import { logger } from '../config/logger';

export interface EngagementInput {
  leadId: number;
  leadName: string;
  company: string;
  recentInteractions: { channel: string; outcome: string; created_at: string }[];
  pageViews: { page_category: string; created_at: string }[];
  currentPipelineStage: string;
  leadScore: number;
}

export interface EngagementAnalysis {
  engagement_level: 'cold' | 'warming' | 'hot' | 'active';
  recommended_action: 'nurture' | 'outreach' | 'escalate' | 'monitor' | 'none';
  reasoning: string;
  priority_score: number;
  suggested_notification: string | null;
}

const HOT_PAGE_CATEGORIES = ['pricing', 'enroll', 'strategy_call_prep', 'roi_calculator'];

/**
 * Rule-based fallback when AI is unavailable.
 */
function analyzeWithRules(input: EngagementInput): EngagementAnalysis {
  const { recentInteractions, pageViews, leadScore } = input;

  const opens = recentInteractions.filter(i => i.outcome === 'opened').length;
  const clicks = recentInteractions.filter(i => i.outcome === 'clicked').length;
  const replies = recentInteractions.filter(i => i.outcome === 'replied').length;
  const hotPages = pageViews.filter(p => HOT_PAGE_CATEGORIES.includes(p.page_category)).length;

  let level: EngagementAnalysis['engagement_level'] = 'cold';
  let action: EngagementAnalysis['recommended_action'] = 'none';
  let priority = 0;

  if (replies > 0) {
    level = 'active';
    action = 'escalate';
    priority = 90;
  } else if (clicks > 0 || hotPages > 0) {
    level = 'hot';
    action = 'outreach';
    priority = 75;
  } else if (opens >= 2) {
    level = 'warming';
    action = 'nurture';
    priority = 50;
  } else if (opens > 0 || pageViews.length > 0) {
    level = 'warming';
    action = 'monitor';
    priority = 30;
  } else {
    level = 'cold';
    action = leadScore > 60 ? 'nurture' : 'none';
    priority = Math.min(leadScore, 25);
  }

  const notification = priority >= 70
    ? `${input.leadName} (${input.company}) is showing strong engagement signals — ${level} lead, recommend ${action}`
    : null;

  return {
    engagement_level: level,
    recommended_action: action,
    reasoning: `Rule-based: ${opens} opens, ${clicks} clicks, ${replies} replies, ${hotPages} hot page views, score ${leadScore}`,
    priority_score: priority,
    suggested_notification: notification,
  };
}

/**
 * Analyze a single lead's engagement using AI (with rule-based fallback).
 */
export async function analyzeEngagement(input: EngagementInput): Promise<EngagementAnalysis> {
  const agent = await getAgent('engagement_features');
  if (agent && !agent.enabled) {
    return analyzeWithRules(input);
  }

  try {
    const result = await generateMessage({
      channel: 'email',
      ai_instructions: `Analyze this lead's engagement signals and return ONLY valid JSON:
{
  "engagement_level": "cold" | "warming" | "hot" | "active",
  "recommended_action": "nurture" | "outreach" | "escalate" | "monitor" | "none",
  "reasoning": "one sentence explanation",
  "priority_score": 0-100,
  "suggested_notification": "notification text if priority >= 70, else null"
}

Rules:
- "active" = replied or booked meeting (action: escalate)
- "hot" = clicked links or visited pricing/enrollment pages (action: outreach)
- "warming" = multiple opens, some page views (action: nurture)
- "cold" = no meaningful engagement (action: none or monitor)

Lead: ${input.leadName} at ${input.company}
Pipeline Stage: ${input.currentPipelineStage}
Lead Score: ${input.leadScore}
Recent Interactions (${input.recentInteractions.length}): ${JSON.stringify(input.recentInteractions.slice(0, 10))}
Page Views (${input.pageViews.length}): ${JSON.stringify(input.pageViews.slice(0, 10))}`,
      lead: { name: input.leadName, company: input.company },
    });

    const parsed = JSON.parse(result.body) as EngagementAnalysis;
    return parsed;
  } catch (error) {
    logger.warn('Engagement AI analysis failed, using rules', { leadId: input.leadId, error: (error as Error).message });
    return analyzeWithRules(input);
  }
}

/**
 * Run a batch engagement analysis cycle across all leads with recent activity.
 */
export async function runEngagementCycle(): Promise<{ analyzed: number; notifications: number; errors: number }> {
  const agent = await getAgent('engagement_features');
  if (agent && !agent.enabled) {
    logger.info('Engagement agent disabled, skipping cycle');
    return { analyzed: 0, notifications: 0, errors: 0 };
  }

  let analyzed = 0;
  let notifications = 0;
  let errors = 0;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Find leads with recent interaction outcomes
  const recentOutcomes = await InteractionOutcome.findAll({
    where: { created_at: { [Op.gte]: sevenDaysAgo } },
    attributes: ['lead_id'],
    group: ['lead_id'],
    raw: true,
  }) as any[];

  const leadIds = recentOutcomes.map((r: any) => r.lead_id);
  if (leadIds.length === 0) {
    logger.info('No leads with recent engagement');
    return { analyzed: 0, notifications: 0, errors: 0 };
  }

  // Process each lead
  for (const leadId of leadIds) {
    try {
      const lead = await Lead.findByPk(leadId);
      if (!lead || lead.status !== 'active') continue;

      const interactions = await InteractionOutcome.findAll({
        where: { lead_id: leadId, created_at: { [Op.gte]: sevenDaysAgo } },
        order: [['created_at', 'DESC']],
        limit: 20,
        raw: true,
      }) as any[];

      const pageViews = await PageEvent.findAll({
        where: {
          created_at: { [Op.gte]: sevenDaysAgo },
        },
        order: [['created_at', 'DESC']],
        limit: 10,
        raw: true,
      }) as any[];

      const analysis = await analyzeEngagement({
        leadId: lead.id,
        leadName: `${lead.first_name} ${lead.last_name}`,
        company: lead.company || 'Unknown',
        recentInteractions: interactions.map((i: any) => ({
          channel: i.channel,
          outcome: i.outcome,
          created_at: i.created_at,
        })),
        pageViews: pageViews.map((p: any) => ({
          page_category: p.page_category,
          created_at: p.created_at,
        })),
        currentPipelineStage: lead.pipeline_stage,
        leadScore: lead.lead_score,
      });

      analyzed++;

      // Create notification for high-priority leads
      if (analysis.suggested_notification && analysis.priority_score >= 70) {
        const admins = await User.findAll({ where: { role: 'admin', status: 'active' } });
        for (const admin of admins) {
          await createNotification({
            user_id: admin.id,
            type: 'in_app',
            subject: `Engagement Alert: ${lead.first_name} ${lead.last_name}`,
            body: analysis.suggested_notification,
          });
        }
        notifications++;
      }
    } catch (error) {
      errors++;
      logger.error('Engagement analysis failed for lead', { leadId, error: (error as Error).message });
    }
  }

  logger.info('Engagement cycle complete', { analyzed, notifications, errors });
  return { analyzed, notifications, errors };
}

/**
 * Register the engagement features agent.
 */
export async function registerEngagementAgent(): Promise<AiAgent> {
  return registerAgent({
    name: 'engagement_features',
    type: 'engagement_analysis',
    department: 'growth',
    schedule: 'every-4-hours',
    config: { model: 'gpt-4o', max_tokens: 512 },
    enabled: true,
  });
}
