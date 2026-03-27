import { logger } from '../config/logger';

export interface MessageGenerationInput {
  channel: 'email' | 'sms' | 'voice';
  ai_instructions: string;
  tone?: string;
  lead: {
    name?: string;
    email?: string;
    company?: string;
    title?: string;
    industry?: string;
    lead_score?: number;
    technology_stack?: string[] | null;
    annual_revenue?: number | null;
    employee_count?: number | null;
    linkedin_url?: string | null;
    notes?: object | null;
    interest_area?: string | null;
  };
  conversationHistory?: { timestamp: string; sender: string; channel: string; body: string; outcome: string }[];
  campaignContext?: { type: string; name: string; step_goal?: string; step_number?: number; system_prompt?: string };
  cohortContext?: { name: string; start_date: string; seats_remaining: number };
  appointmentContext?: { scheduled_at: string; timezone: string; meet_link: string };
  insights?: string[];
}

export interface MessageGenerationOutput {
  body: string;
  subject?: string;
  tokens_used: number;
  model: string;
}

const APPROVED_URLS = [
  'https://enterprise.colaberry.ai/ai-architect',
  'https://enterprise.colaberry.ai/alumni-ai-champion',
  'https://enterprise.colaberry.ai',
];

/**
 * Build the system prompt for the AI model.
 */
export function buildSystemPrompt(channel: string, campaignSystemPrompt?: string): string {
  let prompt = campaignSystemPrompt || 'You are a professional outreach assistant for LandJet Growth Engine.';

  prompt += '\n\nOUTPUT FORMAT RULES:\n';
  if (channel === 'email') {
    prompt += '- Return JSON with "subject" and "body" fields\n- body should be HTML\n- Keep subject under 60 characters\n';
  } else if (channel === 'sms') {
    prompt += '- Return plain text only\n- Maximum 160 characters\n- Do NOT include opt-out language\n- Do NOT mention being an AI\n';
  } else if (channel === 'voice') {
    prompt += '- Return a conversational script\n- Include talking points and objection handling\n- Natural, human-like language\n';
  }

  prompt += `\nURL WHITELIST (NEVER invent URLs, only use these):\n${APPROVED_URLS.map(u => `- ${u}`).join('\n')}\n`;

  return prompt;
}

/**
 * Build the user prompt with all context.
 */
export function buildUserPrompt(input: MessageGenerationInput): string {
  const parts: string[] = [];

  parts.push(`INSTRUCTIONS: ${input.ai_instructions}`);
  if (input.tone) parts.push(`TONE: ${input.tone}`);

  // Lead profile
  const lead = input.lead;
  parts.push(`\nLEAD PROFILE:\n- Name: ${lead.name || 'Unknown'}\n- Company: ${lead.company || 'Unknown'}\n- Title: ${lead.title || 'Unknown'}\n- Industry: ${lead.industry || 'Unknown'}\n- Score: ${lead.lead_score || 0}`);

  if (lead.interest_area) parts.push(`- Interest: ${lead.interest_area}`);
  if (lead.technology_stack?.length) parts.push(`- Tech Stack: ${lead.technology_stack.join(', ')}`);

  // Campaign context
  if (input.campaignContext) {
    const ctx = input.campaignContext;
    parts.push(`\nCAMPAIGN: ${ctx.name} (${ctx.type})`);
    if (ctx.step_goal) parts.push(`STEP GOAL: ${ctx.step_goal}`);
    if (ctx.step_number) parts.push(`STEP: ${ctx.step_number}`);
  }

  // Conversation history
  if (input.conversationHistory?.length) {
    parts.push(`\nPREVIOUS INTERACTIONS (last ${input.conversationHistory.length}):`);
    for (const h of input.conversationHistory.slice(-5)) {
      parts.push(`  [${h.timestamp}] ${h.channel}: ${h.body.substring(0, 100)}`);
    }
  }

  // Cohort/appointment context
  if (input.cohortContext) {
    parts.push(`\nCOHORT: ${input.cohortContext.name}, starts ${input.cohortContext.start_date}, ${input.cohortContext.seats_remaining} seats left`);
  }
  if (input.appointmentContext) {
    parts.push(`\nAPPOINTMENT: ${input.appointmentContext.scheduled_at} (${input.appointmentContext.timezone})\nMeeting link: ${input.appointmentContext.meet_link}`);
  }

  // Insights
  if (input.insights?.length) {
    parts.push(`\nCAMPAIGN KNOWLEDGE (proven patterns):`);
    for (const insight of input.insights) {
      parts.push(`- ${insight}`);
    }
  }

  return parts.join('\n');
}

/**
 * Post-generation cleanup per Blueprint Section 5.
 */
export function cleanGeneratedContent(content: string, channel: string): string {
  let cleaned = content;

  // Strip markdown code fences
  cleaned = cleaned.replace(/```json\s*/g, '').replace(/```\s*/g, '');

  // URL sanitization: replace hallucinated URLs with approved booking link
  cleaned = cleaned.replace(
    /https?:\/\/(?:calendly\.com|cal\.com|book\.)[^\s"')>]*/gi,
    APPROVED_URLS[0],
  );

  if (channel === 'sms') {
    // SMS-specific cleanup
    cleaned = cleaned
      .replace(/Reply STOP[^.]*\.?/gi, '')
      .replace(/\bCory\b/gi, '')
      .replace(/\bAI Assistant\b/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length > 160) {
      cleaned = cleaned.substring(0, 157) + '...';
    }
  }

  return cleaned;
}

/**
 * Generate a message using OpenAI API.
 * Falls back to template body on failure.
 */
export async function generateMessage(
  input: MessageGenerationInput,
  fallbackBody?: string,
): Promise<MessageGenerationOutput> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.AI_MODEL || 'gpt-4o';

  if (!apiKey) {
    logger.warn('OPENAI_API_KEY not configured, using fallback');
    return {
      body: fallbackBody || 'Message generation unavailable.',
      subject: input.channel === 'email' ? 'Follow Up' : undefined,
      tokens_used: 0,
      model: 'fallback',
    };
  }

  const systemPrompt = buildSystemPrompt(input.channel, input.campaignContext?.system_prompt);
  const userPrompt = buildUserPrompt(input);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: parseInt(process.env.AI_MAX_TOKENS || '2048', 10),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = (await response.json()) as any;
    const rawContent = data.choices?.[0]?.message?.content || '';
    const tokensUsed = data.usage?.total_tokens || 0;

    let body = cleanGeneratedContent(rawContent, input.channel);
    let subject: string | undefined;

    // Parse email JSON response
    if (input.channel === 'email') {
      try {
        const parsed = JSON.parse(body);
        subject = parsed.subject;
        body = parsed.body;
      } catch {
        // Not valid JSON, use raw content as body
        subject = 'Follow Up';
      }
    }

    return { body, subject, tokens_used: tokensUsed, model };
  } catch (error) {
    logger.error('AI message generation failed', { error: (error as Error).message });
    return {
      body: fallbackBody || 'Message generation unavailable.',
      subject: input.channel === 'email' ? 'Follow Up' : undefined,
      tokens_used: 0,
      model: 'fallback',
    };
  }
}
