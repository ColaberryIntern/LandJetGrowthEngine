import { EmailThread } from '../models/EmailThread';
import { TopicThreadMap } from '../models/TopicThreadMap';
import { CommunicationFeedback } from '../models/CommunicationFeedback';
import { Op } from 'sequelize';
import { logger } from '../config/logger';
import { getFeedbackStats } from './communicationFeedbackService';

export interface DailySummary {
  summary: string;
  date: string;
  total_emails: number;
  processed: number;
  skipped: number;
  by_type: Record<string, number>;
  by_priority: Record<string, number>;
  high_priority_items: { subject: string; topic: string; todos: string[] }[];
  feedback_stats: {
    total_topics: number;
    total_todos_created: number;
    total_todos_completed: number;
    completion_rate: number;
    stalled_count: number;
    recurring_count: number;
  };
}

/**
 * Generate a daily summary of communication intelligence activity.
 */
export async function generateDailySummary(date?: Date): Promise<DailySummary> {
  const targetDate = date || new Date();
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  // Get all emails from the target day
  const emails = await EmailThread.findAll({
    where: {
      received_at: { [Op.between]: [startOfDay, endOfDay] },
    },
    order: [['received_at', 'DESC']],
  });

  const processed = emails.filter(e => e.processed);
  const skipped = emails.filter(e => e.skipped);

  // Aggregate by type and priority
  const byType: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  const highPriorityItems: { subject: string; topic: string; todos: string[] }[] = [];

  for (const email of processed) {
    const classified = email.classified_data;
    if (classified) {
      byType[classified.type] = (byType[classified.type] || 0) + 1;
      byPriority[classified.priority] = (byPriority[classified.priority] || 0) + 1;

      if (classified.priority === 'high') {
        highPriorityItems.push({
          subject: email.subject || '(no subject)',
          topic: classified.topic,
          todos: classified.todos || [],
        });
      }
    }
  }

  const feedbackStats = await getFeedbackStats();

  // Generate AI summary
  const summary = await generateAISummary(
    emails.length,
    processed.length,
    skipped.length,
    byType,
    byPriority,
    highPriorityItems,
    feedbackStats,
  );

  return {
    summary,
    date: targetDate.toISOString().split('T')[0],
    total_emails: emails.length,
    processed: processed.length,
    skipped: skipped.length,
    by_type: byType,
    by_priority: byPriority,
    high_priority_items: highPriorityItems,
    feedback_stats: feedbackStats,
  };
}

async function generateAISummary(
  totalEmails: number,
  processed: number,
  skipped: number,
  byType: Record<string, number>,
  byPriority: Record<string, number>,
  highPriorityItems: { subject: string; topic: string; todos: string[] }[],
  feedbackStats: any,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.AI_MODEL || 'gpt-4o';

  if (!apiKey) {
    return `Daily Summary: ${totalEmails} emails received, ${processed} processed, ${skipped} skipped.`;
  }

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
            content: 'Generate a concise executive daily summary in markdown. Include: Active Topics, Pending Todos, Recurring Issues, and Suggested Focus Areas. Keep it brief and actionable.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              total_emails: totalEmails,
              processed,
              skipped,
              by_type: byType,
              by_priority: byPriority,
              high_priority_items: highPriorityItems,
              feedback_stats: feedbackStats,
            }),
          },
        ],
        temperature: 0.5,
        max_tokens: 1024,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return `Daily Summary: ${totalEmails} emails received, ${processed} processed, ${skipped} skipped.`;
    }

    const data = (await response.json()) as any;
    return data.choices?.[0]?.message?.content || `Daily Summary: ${totalEmails} emails.`;
  } catch (error) {
    logger.error('Daily summary generation failed', { error: (error as Error).message });
    return `Daily Summary: ${totalEmails} emails received, ${processed} processed, ${skipped} skipped.`;
  }
}
