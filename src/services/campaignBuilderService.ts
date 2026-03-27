import { SequenceStep } from '../models/FollowUpSequence';

export interface SequenceTemplate {
  name: string;
  description: string;
  campaign_type: string;
  steps: SequenceStep[];
}

function step(
  delay_days: number,
  channel: 'email' | 'voice' | 'sms',
  subject: string,
  ai_instructions: string,
  opts: Partial<SequenceStep> = {},
): SequenceStep {
  return {
    delay_days,
    channel,
    subject,
    body_template: '',
    ai_instructions,
    ai_tone: opts.ai_tone || 'professional',
    step_goal: opts.step_goal || '',
    max_attempts: opts.max_attempts || (channel === 'voice' ? 2 : 1),
    fallback_channel: opts.fallback_channel,
    voice_agent_type: opts.voice_agent_type,
    voice_prompt: opts.voice_prompt,
    ai_context_notes: opts.ai_context_notes,
  };
}

export const COLD_OUTBOUND_TEMPLATE: SequenceTemplate = {
  name: 'Standard Cold Outbound',
  description: '7-step cold outbound sequence over 21 days',
  campaign_type: 'cold_outbound',
  steps: [
    step(0, 'email', 'Introduction', 'Cold intro - research their industry, spark curiosity about how we help similar companies', { ai_tone: 'professional', step_goal: 'Open conversation' }),
    step(2, 'email', 'Social Proof', 'Share specific graduate outcomes and success metrics relevant to their industry', { ai_tone: 'warm', step_goal: 'Build credibility' }),
    step(5, 'voice', 'Intro Call', 'Identify pain points, understand their situation, book strategy call', { ai_tone: 'consultative', step_goal: 'Book strategy call', voice_agent_type: 'interest', fallback_channel: 'email' }),
    step(8, 'email', 'ROI Justification', 'Present business case with ROI numbers tailored to their company size and industry', { ai_tone: 'professional', step_goal: 'Justify investment' }),
    step(12, 'voice', 'Follow-up Call', 'Overcome objections, address concerns from previous interactions, close for strategy call', { ai_tone: 'consultative', step_goal: 'Close for meeting', voice_agent_type: 'interest', fallback_channel: 'email' }),
    step(16, 'email', 'Value-Add', 'Share an actionable insight or resource relevant to their industry challenges', { ai_tone: 'warm', step_goal: 'Provide value' }),
    step(21, 'email', 'Breakup', 'Graceful close - acknowledge their time, leave the door open for future engagement', { ai_tone: 'warm', step_goal: 'Graceful close' }),
  ],
};

export const STRATEGY_CALL_READINESS_TEMPLATE: SequenceTemplate = {
  name: 'Strategy Call Readiness',
  description: '6-step countdown sequence to prepare leads for their strategy call',
  campaign_type: 'executive_outreach',
  steps: [
    step(0, 'email', 'Booking Confirmation', 'Confirm the strategy call booking with call details, expectations, and prep instructions', { ai_tone: 'professional', step_goal: 'Confirm booking' }),
    step(0, 'sms', 'Quick Confirmation', 'Brief SMS confirming strategy call is booked with date/time', { ai_tone: 'warm', step_goal: 'SMS confirmation' }),
    step(3, 'email', 'Prep Encouragement', 'Encourage completion of prep form, explain how it maximizes call value', { ai_tone: 'warm', step_goal: 'Drive prep completion' }),
    step(5, 'email', 'Agenda Preview', 'Preview the agenda, share what to expect, build anticipation', { ai_tone: 'professional', step_goal: 'Set expectations' }),
    step(7, 'sms', 'Day-Before Reminder', 'Friendly reminder about tomorrow\'s call with prep form link', { ai_tone: 'warm', step_goal: 'Final prep nudge' }),
    step(7, 'email', 'Day-Of Logistics', 'Productivity tips, logistics, and meeting link for today\'s call', { ai_tone: 'professional', step_goal: 'Ensure attendance' }),
  ],
};

export const PAYMENT_READINESS_TEMPLATE: SequenceTemplate = {
  name: 'Payment Readiness',
  description: '5-step countdown to cohort start to drive payment completion',
  campaign_type: 'payment_readiness',
  steps: [
    step(0, 'email', 'Welcome & Payment Required', 'Welcome to the program, spot reserved, payment required to confirm enrollment', { ai_tone: 'professional', step_goal: 'Initial payment request' }),
    step(2, 'email', 'Friendly Reminder', 'Friendly reminder about benefits and what they\'ll gain, payment link', { ai_tone: 'warm', step_goal: 'Soft reminder' }),
    step(4, 'email', 'Urgency Notice', 'Spots being finalized, share specifics about limited availability', { ai_tone: 'professional', step_goal: 'Create urgency' }),
    step(6, 'email', 'Final Reminder', 'Final reminder with offer to help if payment issues, direct contact info', { ai_tone: 'warm', step_goal: 'Remove barriers' }),
    step(8, 'email', 'Last Notice', 'Final notice - pay now or spot will be released to waitlist', { ai_tone: 'professional', step_goal: 'Final push' }),
  ],
};

export function getTemplates(): SequenceTemplate[] {
  return [COLD_OUTBOUND_TEMPLATE, STRATEGY_CALL_READINESS_TEMPLATE, PAYMENT_READINESS_TEMPLATE];
}

export function getTemplateByType(campaignType: string): SequenceTemplate | undefined {
  const templates = getTemplates();
  return templates.find((t) => t.campaign_type === campaignType);
}
