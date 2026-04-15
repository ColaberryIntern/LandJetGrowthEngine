import { Op } from 'sequelize';
import { Campaign } from '../models/Campaign';
import { CampaignHealth } from '../models/CampaignHealth';
import { CampaignError } from '../models/CampaignError';
import { ScheduledEmail } from '../models/ScheduledEmail';
import { CommunicationLog } from '../models/CommunicationLog';
import { Lead } from '../models/Lead';
import { getErrorStats } from './errorTrackingService';
import { runQACycle as runAgentQACycle, QAResult } from '../agents/campaignQAAgent';
import { logger } from '../config/logger';

// --- Dashboard ---

export interface QADashboard {
  qa_status_counts: { passed: number; failed: number; untested: number };
  health_counts: { healthy: number; degraded: number; critical: number; unknown: number };
  error_summary: { total: number; unresolved: number; today: number; bySeverity: Record<string, number> };
  agent_activity: AgentActivity;
}

export interface AgentActivity {
  email_retries: number;
  voice_fallbacks: number;
  bounce_cleanups: number;
  self_healing_retries: number;
}

export async function getQADashboard(): Promise<QADashboard> {
  try {
    const [
      qaPassed, qaFailed, qaUntested,
      healthy, degraded, critical, unknown,
      errorSummary,
      activity,
    ] = await Promise.all([
      Campaign.count({ where: { qa_status: 'passed', status: 'active' } }),
      Campaign.count({ where: { qa_status: 'failed', status: 'active' } }),
      Campaign.count({ where: { qa_status: 'untested', status: 'active' } }),
      CampaignHealth.count({ where: { status: 'healthy' } }),
      CampaignHealth.count({ where: { status: 'degraded' } }),
      CampaignHealth.count({ where: { status: 'critical' } }),
      CampaignHealth.count({ where: { status: 'unknown' } }),
      getErrorStats(),
      getAgentActivity(),
    ]);

    return {
      qa_status_counts: { passed: qaPassed, failed: qaFailed, untested: qaUntested },
      health_counts: { healthy, degraded, critical, unknown },
      error_summary: errorSummary,
      agent_activity: activity,
    };
  } catch (error) {
    logger.error('Failed to get QA dashboard', { error: (error as Error).message });
    throw error;
  }
}

// --- Per-Campaign QA Details ---

export interface CampaignQADetail {
  id: string;
  name: string;
  status: string;
  qa_status: string;
  health_score: number | null;
  health_status: string | null;
  last_scan_at: string | null;
  unresolved_errors: number;
  active_leads: number;
}

export async function getCampaignQADetails(): Promise<CampaignQADetail[]> {
  try {
    const campaigns = await Campaign.findAll({
      where: { status: 'active' },
      attributes: ['id', 'name', 'status', 'qa_status'],
      order: [['name', 'ASC']],
    });

    const campaignIds = campaigns.map(c => c.id);
    if (campaignIds.length === 0) return [];

    const [healthRecords, errorCounts, leadCounts] = await Promise.all([
      CampaignHealth.findAll({
        where: { campaign_id: { [Op.in]: campaignIds } },
        attributes: ['campaign_id', 'health_score', 'status', 'last_scan_at'],
      }),
      CampaignError.findAll({
        where: { campaign_id: { [Op.in]: campaignIds }, resolved: false },
        attributes: ['campaign_id', [CampaignError.sequelize!.fn('COUNT', '*'), 'count']],
        group: ['campaign_id'],
        raw: true,
      }) as Promise<any[]>,
      Lead.findAll({
        where: { campaign_id: { [Op.in]: campaignIds }, status: 'active' },
        attributes: ['campaign_id', [Lead.sequelize!.fn('COUNT', '*'), 'count']],
        group: ['campaign_id'],
        raw: true,
      }) as Promise<any[]>,
    ]);

    const healthMap = new Map(healthRecords.map(h => [h.campaign_id, h]));
    const errorMap = new Map(errorCounts.map((r: any) => [r.campaign_id, parseInt(r.count, 10)]));
    const leadMap = new Map(leadCounts.map((r: any) => [r.campaign_id, parseInt(r.count, 10)]));

    logger.info('Campaign QA details fetched', { campaigns: campaignIds.length });
    return campaigns.map(c => {
      const health = healthMap.get(c.id);
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        qa_status: c.qa_status || 'untested',
        health_score: health?.health_score ?? null,
        health_status: health?.status ?? null,
        last_scan_at: health?.last_scan_at?.toISOString() ?? null,
        unresolved_errors: errorMap.get(c.id) || 0,
        active_leads: leadMap.get(c.id) || 0,
      };
    });
  } catch (error) {
    logger.error('Failed to get campaign QA details', { error: (error as Error).message });
    throw error;
  }
}

// --- Run QA Cycle ---

export async function runQACycle(): Promise<QAResult[]> {
  try {
    const results = await runAgentQACycle();
    logger.info('QA cycle completed', { campaigns: results.length, failed: results.filter(r => r.status === 'failed').length });
    return results;
  } catch (error) {
    logger.error('QA cycle failed', { error: (error as Error).message });
    throw error;
  }
}

// --- Agent Activity ---

export async function getAgentActivity(): Promise<AgentActivity> {
  try {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [emailRetries, selfHealingRetries, bounceCleanups, voiceFallbacks] = await Promise.all([
    // Failed emails that were retried (status pending, attempts > 0, updated recently)
    ScheduledEmail.count({
      where: {
        status: 'pending' as any,
        channel: 'email' as any,
        attempts_made: { [Op.gte]: 1 },
      },
    } as any) as Promise<number>,
    // Self-healing: all retried actions (any channel)
    ScheduledEmail.count({
      where: {
        status: 'pending' as any,
        attempts_made: { [Op.gte]: 1 },
      },
    } as any) as Promise<number>,
    // Bounced communications in last 24h
    CommunicationLog.count({
      where: {
        status: 'bounced',
        created_at: { [Op.gte]: twentyFourHoursAgo },
      },
    }),
    // Voice fallbacks: pending emails from voice fallback
    ScheduledEmail.count({
      where: {
        status: { [Op.in]: ['pending', 'sent'] } as any,
        channel: 'email' as any,
        fallback_channel: null,
        created_at: { [Op.gte]: twentyFourHoursAgo },
      },
    } as any) as Promise<number>,
  ]);

  return {
    email_retries: emailRetries as number,
    voice_fallbacks: Math.max(0, (voiceFallbacks as number) - (emailRetries as number)),
    bounce_cleanups: bounceCleanups as number,
    self_healing_retries: selfHealingRetries as number,
  };
  } catch (error) {
    logger.error('Failed to get agent activity', { error: (error as Error).message });
    throw error;
  }
}

// --- Test Suite Info ---

export interface TestSuiteInfo {
  framework: string;
  runner: string;
  categories: Record<string, number>;
  total: number;
  test_files: string[];
}

export function getTestSuiteInfo(): TestSuiteInfo {
  const categories: Record<string, number> = {
    unit: 21,
    integration: 2,
    e2e: 0,
  };

  const testFiles = [
    'healthScanner', 'campaignAnalytics', 'campaignApproval', 'campaignBuilder',
    'communicationSafety', 'draftService', 'emailService', 'enrollment',
    'leadScoring', 'outreachQueries', 'guardChecks', 'autonomousRamp',
    'leadProgression', 'pipelineValidation', 'sequenceValidation', 'smsService',
    'aiMessageService', 'auth', 'config', 'errors', 'roles',
  ];

  return {
    framework: 'Jest',
    runner: 'ts-jest',
    categories,
    total: Object.values(categories).reduce((a, b) => a + b, 0),
    test_files: testFiles,
  };
}
