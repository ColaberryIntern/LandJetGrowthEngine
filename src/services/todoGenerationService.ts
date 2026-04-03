import { logger } from '../config/logger';
import { ClassifiedData } from '../models/EmailThread';

export interface StructuredTodo {
  content: string;
  priority: 'high' | 'medium' | 'low';
  assignee_hint: string | null;
}

/**
 * Generate structured, actionable todos from classified email data.
 * Refines raw AI-extracted todos into atomic, assignable items.
 */
export async function generateTodos(classified: ClassifiedData): Promise<StructuredTodo[]> {
  if (!classified.todos || classified.todos.length === 0) {
    return [];
  }

  const todos: StructuredTodo[] = classified.todos.slice(0, 7).map(rawTodo => {
    let content = rawTodo.trim();

    // Ensure todo starts with an action verb
    const startsWithVerb = /^[A-Z][a-z]+\s/.test(content);
    if (!startsWithVerb && content.length > 0) {
      content = content.charAt(0).toUpperCase() + content.slice(1);
    }

    // Find assignee hint from owners list
    const assigneeHint = classified.owners.length > 0 ? classified.owners[0] : null;

    return {
      content,
      priority: classified.priority,
      assignee_hint: assigneeHint,
    };
  });

  logger.info(`Generated ${todos.length} structured todos`);
  return todos;
}

/**
 * Use AI to refine vague todos into specific, measurable action items.
 */
export async function refineTodos(rawTodos: string[], context: string): Promise<string[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.AI_MODEL || 'gpt-4o';

  if (!apiKey || rawTodos.length === 0) return rawTodos;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: `Refine these action items into specific, measurable, atomic todos. Each must:
- Start with an action verb
- Be completable by one person
- Have a clear done state
- Be specific (no vague "look into" or "think about")
Return a JSON array of strings. Max 7 items.`,
          },
          {
            role: 'user',
            content: `Context: ${context}\n\nRaw todos:\n${rawTodos.map((t, i) => `${i + 1}. ${t}`).join('\n')}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 512,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) return rawTodos;

    const data = (await response.json()) as any;
    const content = data.choices?.[0]?.message?.content || '';
    const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const refined = JSON.parse(cleaned) as string[];
    return refined.slice(0, 7);
  } catch {
    return rawTodos;
  }
}
