import { generateMessage } from '../services/aiMessageService';
import { registerAgent, getAgent } from '../intelligence/agents/agentRegistry';
import { CampaignLead } from '../models/CampaignLead';
import { Unsubscribe } from '../models/Unsubscribe';
import { InteractionOutcome } from '../models/InteractionOutcome';
import { createNotification } from '../services/notificationService';
import { handlePositiveResponse } from '../services/leadProgressionService';
import { logger } from '../config/logger';

export interface ClassifyInput {
  inboundBody: string;
  inboundSubject: string;
  leadId: number;
  leadEmail: string;
  campaignId: string;
}

export interface ClassificationResult {
  classification: 'positive' | 'negative' | 'question' | 'out_of_office' | 'unsubscribe' | 'unknown';
  confidence: number;
  summary: string;
  recommended_action: 'pause_sequence' | 'continue_sequence' | 'escalate_to_human' | 'mark_unsubscribed';
}

/**
 * Classify an inbound email response using AI.
 */
export async function classifyResponse(input: ClassifyInput): Promise<ClassificationResult> {
  // Check agent is enabled
  const agent = await getAgent('response_classifier');
  if (agent && !agent.enabled) {
    return { classification: 'unknown', confidence: 0, summary: 'Agent disabled', recommended_action: 'escalate_to_human' };
  }

  try {
    const result = await generateMessage({
      channel: 'email',
      ai_instructions: `Classify this inbound email response. Return ONLY valid JSON with these fields:
{
  "classification": "positive" | "negative" | "question" | "out_of_office" | "unsubscribe",
  "confidence": 0.0-1.0,
  "summary": "one-line summary",
  "recommended_action": "pause_sequence" | "continue_sequence" | "escalate_to_human" | "mark_unsubscribed"
}

Rules:
- "positive" = interested, wants to meet, asks for details (action: pause_sequence)
- "negative" = not interested, declined (action: pause_sequence)
- "question" = has questions but not clearly positive/negative (action: escalate_to_human)
- "out_of_office" = auto-reply, vacation (action: continue_sequence)
- "unsubscribe" = asks to stop emails, remove from list (action: mark_unsubscribed)

Subject: ${input.inboundSubject}
Body: ${input.inboundBody}`,
      lead: { name: 'classifier' },
    });

    const parsed = JSON.parse(result.body) as ClassificationResult;

    // Take action based on classification
    await handleClassificationAction(parsed, input);

    return parsed;
  } catch (error) {
    logger.error('Response classification failed', { error: (error as Error).message });
    return { classification: 'unknown', confidence: 0, summary: 'Classification failed', recommended_action: 'escalate_to_human' };
  }
}

async function handleClassificationAction(result: ClassificationResult, input: ClassifyInput): Promise<void> {
  // Record the reply as an interaction outcome
  await InteractionOutcome.create({
    lead_id: input.leadId,
    campaign_id: input.campaignId,
    scheduled_email_id: null,
    channel: 'email',
    step_index: 0,
    outcome: 'replied',
    lead_industry: null,
    lead_title_category: null,
    lead_company_size_bucket: null,
    lead_source_type: null,
    metadata: { classification: result.classification, confidence: result.confidence, summary: result.summary },
  });

  switch (result.recommended_action) {
    case 'pause_sequence':
      if (result.classification === 'positive') {
        await handlePositiveResponse(input.campaignId, input.leadId);
      } else {
        await CampaignLead.update(
          { status: 'paused', metadata: { response_classification: result.classification } as any },
          { where: { campaign_id: input.campaignId, lead_id: input.leadId } },
        );
      }
      break;

    case 'mark_unsubscribed':
      await Unsubscribe.findOrCreate({
        where: { email: input.leadEmail.toLowerCase() },
        defaults: { email: input.leadEmail.toLowerCase(), reason: 'Lead requested removal', source: 'response_classifier' },
      });
      await CampaignLead.update(
        { status: 'removed', lifecycle_status: 'dnd', outcome: 'unsubscribed' },
        { where: { campaign_id: input.campaignId, lead_id: input.leadId } },
      );
      break;

    case 'escalate_to_human':
      // Notify admins
      const { User } = require('../models/User');
      const admins = await User.findAll({ where: { role: 'admin', status: 'active' } });
      for (const admin of admins) {
        await createNotification({
          user_id: admin.id,
          type: 'in_app',
          subject: `Response needs review: ${result.summary}`,
          body: `Lead ${input.leadId} replied to CEO outreach. Classification: ${result.classification} (${Math.round(result.confidence * 100)}% confidence). Review and respond manually.`,
        });
      }
      break;

    case 'continue_sequence':
      // No action needed - sequence continues on schedule
      break;
  }

  logger.info('Response classified and handled', {
    leadId: input.leadId, classification: result.classification, action: result.recommended_action,
  });
}

export async function registerClassifierAgent() {
  return registerAgent({
    name: 'response_classifier',
    type: 'nlp',
    department: 'outreach',
    schedule: 'on-demand',
    config: { model: 'gpt-4o', max_tokens: 512 },
    enabled: true,
  });
}
