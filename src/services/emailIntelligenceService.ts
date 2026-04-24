import { logger } from '../config/logger';
import { ClassifiedData } from '../models/EmailThread';
import { recordAgentRun } from '../intelligence/agents/agentRegistry';

/**
 * Classify an email using OpenAI to extract intent, priority, and action items.
 */
export async function classifyEmail(subject: string, body: string, sender: string): Promise<ClassifiedData> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.AI_MODEL || 'gpt-4o';

  if (!apiKey) {
    logger.warn('OPENAI_API_KEY not configured, returning default classification');
    return {
      topic: subject || 'Unclassified',
      type: 'discussion',
      priority: 'medium',
      todos: [],
      owners: [],
      confidence: 0.0,
    };
  }

  const systemPrompt = `You are an email classification assistant. Analyze the email and return a JSON object with these fields:

1. "topic": A concise topic title (max 10 words) summarizing the email's main subject
2. "type": One of "project", "task", or "discussion"
   - "project": Multi-step initiative or ongoing work
   - "task": Specific actionable request
   - "discussion": Informational, FYI, or conversational
3. "priority": One of "high", "medium", or "low"
   - "high": Urgent, time-sensitive, blockers, deadlines
   - "medium": Important but not urgent
   - "low": FYI, informational, no action needed
4. "todos": Array of 0-7 actionable items extracted from the email
   - Each todo must start with an action verb
   - Each must be specific, assignable, and have a clear done state
   - For discussion emails with no actions, return empty array
   - Normalize vague language: "look into X" becomes "Research X and summarize findings"
   - Extract implicit tasks from "we need to..." or "can you..." language
5. "owners": Array of people mentioned as responsible (names or emails)
6. "confidence": Float 0.0-1.0 indicating classification confidence

Return ONLY valid JSON, no markdown fences or explanation.`;

  const userPrompt = `FROM: ${sender}
SUBJECT: ${subject || '(no subject)'}

BODY:
${(body || '').substring(0, 4000)}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

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
        temperature: 0.3,
        max_tokens: 1024,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = (await response.json()) as any;
    const rawContent = data.choices?.[0]?.message?.content || '';

    // Strip any markdown fences
    const cleaned = rawContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const classified: ClassifiedData = JSON.parse(cleaned);

    // Validate and cap todos
    classified.todos = (classified.todos || []).slice(0, 7);
    classified.confidence = Math.min(1.0, Math.max(0.0, classified.confidence || 0.5));

    recordAgentRun('inbound_classifier', { topic: classified.topic, type: classified.type, priority: classified.priority, todoCount: classified.todos.length, confidence: classified.confidence }).catch(() => {});
    logger.info('Email classified', {
      topic: classified.topic,
      type: classified.type,
      priority: classified.priority,
      todoCount: classified.todos.length,
      confidence: classified.confidence,
    });

    return classified;
  } catch (error) {
    recordAgentRun('inbound_classifier', undefined, 'failed', (error as Error).message).catch(() => {});
    logger.error('Email classification failed', { error: (error as Error).message });
    return {
      topic: subject || 'Classification Failed',
      type: 'discussion',
      priority: 'medium',
      todos: [],
      owners: [],
      confidence: 0.0,
    };
  }
}
