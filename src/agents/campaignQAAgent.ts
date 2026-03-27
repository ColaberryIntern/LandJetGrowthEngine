import { Campaign } from '../models/Campaign';
import { FollowUpSequence } from '../models/FollowUpSequence';
import { logger } from '../config/logger';

export interface QAResult {
  campaignId: string;
  score: number;
  status: 'passed' | 'degraded' | 'failed';
  issues: string[];
}

/**
 * QA Agent: validate campaign sequences and lead data.
 * Runs every 15 minutes on weekdays per Blueprint Section 12.
 */
export async function runQACycle(): Promise<QAResult[]> {
  const campaigns = await Campaign.findAll({ where: { status: 'active' } });
  const results: QAResult[] = [];

  for (const campaign of campaigns) {
    const issues: string[] = [];

    if (!campaign.sequence_id) {
      issues.push('No sequence linked');
    } else {
      const sequence = await FollowUpSequence.findByPk(campaign.sequence_id);
      if (!sequence) {
        issues.push('Linked sequence not found');
      } else {
        // Check each step has AI instructions
        for (let i = 0; i < sequence.steps.length; i++) {
          const step = sequence.steps[i];
          if (!step.ai_instructions && !step.body_template) {
            issues.push(`Step ${i + 1}: missing ai_instructions and body_template`);
          }
        }
      }
    }

    if (!campaign.channel_config) {
      issues.push('No channel configuration');
    }

    // Score: 100 - (issues * 20), min 0
    const score = Math.max(0, 100 - issues.length * 20);
    let status: 'passed' | 'degraded' | 'failed';
    if (score > 80) status = 'passed';
    else if (score >= 60) status = 'degraded';
    else status = 'failed';

    // Update campaign QA status
    await campaign.update({ qa_status: status === 'failed' ? 'failed' : status === 'passed' ? 'passed' : 'failed' });

    results.push({ campaignId: campaign.id, score, status, issues });
  }

  if (results.length > 0) {
    logger.info('QA cycle complete', { campaigns: results.length, failed: results.filter(r => r.status === 'failed').length });
  }

  return results;
}
