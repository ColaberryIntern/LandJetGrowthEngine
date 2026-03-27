import { Lead } from '../models/Lead';
import { Campaign } from '../models/Campaign';
import { SequenceStep } from '../models/FollowUpSequence';
import { CommunicationLog } from '../models/CommunicationLog';
import { generateMessage, MessageGenerationOutput } from './aiMessageService';
import { logger } from '../config/logger';

export interface CeoIntroGenerationInput {
  lead: Lead;
  step: SequenceStep;
  campaign: Campaign;
  stepIndex: number;
  previousDrafts?: { subject: string; body: string; rejection_reason?: string }[];
}

/**
 * Generate a CEO intro email with enriched context.
 * Wraps aiMessageService.generateMessage() - does NOT call OpenAI directly.
 */
export async function generateCeoIntroEmail(input: CeoIntroGenerationInput): Promise<MessageGenerationOutput> {
  const { lead, step, campaign, stepIndex, previousDrafts } = input;

  // Load conversation history for this lead
  const history = await CommunicationLog.findAll({
    where: { lead_id: lead.id },
    order: [['created_at', 'DESC']],
    limit: 10,
  });

  const conversationHistory = history.map((h) => ({
    timestamp: h.created_at.toISOString(),
    sender: h.direction === 'outbound' ? 'system' : 'lead',
    channel: h.channel,
    body: h.body || '',
    outcome: h.status,
  }));

  // Build CEO-specific instructions
  let instructions = step.ai_instructions || '';
  instructions += `\n\nCONTEXT: You are writing this email on behalf of Ryan Landry, CEO of LandJet. `;
  instructions += `This is a personal outreach to a past client or prospect. `;
  instructions += `The tone should be warm, professional, and personal - as if the CEO is writing directly. `;
  instructions += `This is step ${stepIndex + 1} of the outreach sequence.`;

  if (stepIndex === 0) {
    instructions += ` This is the FIRST outreach - introduce yourself and establish rapport.`;
  } else if (stepIndex === 1) {
    instructions += ` This is a FOLLOW-UP - reference previous outreach and add value.`;
  } else {
    instructions += ` This is the FINAL outreach - graceful close, leave the door open.`;
  }

  // Include rejection context if regenerating
  if (previousDrafts?.length) {
    const rejected = previousDrafts.filter((d) => d.rejection_reason);
    if (rejected.length) {
      instructions += `\n\nPREVIOUS DRAFTS WERE REJECTED. Avoid these patterns:\n`;
      for (const d of rejected) {
        instructions += `- Rejected because: ${d.rejection_reason}\n`;
      }
    }
  }

  try {
    return await generateMessage({
      channel: 'email',
      ai_instructions: instructions,
      tone: step.ai_tone || 'professional',
      lead: {
        name: `${lead.first_name} ${lead.last_name}`,
        email: lead.email,
        company: lead.company || undefined,
        title: lead.title || undefined,
        industry: lead.industry || undefined,
        lead_score: lead.lead_score,
        interest_area: lead.interest_area || undefined,
      },
      conversationHistory,
      campaignContext: {
        type: campaign.type,
        name: campaign.name,
        step_goal: step.step_goal,
        step_number: stepIndex + 1,
        system_prompt: campaign.ai_system_prompt || undefined,
      },
    });
  } catch (error) {
    logger.error('CEO intro email generation failed', { leadId: lead.id, error: (error as Error).message });
    // Fallback
    return {
      body: step.body_template || 'Email generation failed - please write manually.',
      subject: step.subject || 'Follow Up',
      tokens_used: 0,
      model: 'fallback',
    };
  }
}
