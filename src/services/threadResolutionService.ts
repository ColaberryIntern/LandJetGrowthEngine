import { TopicThreadMap } from '../models/TopicThreadMap';
import { logger } from '../config/logger';

/**
 * Look up an existing Basecamp mapping for a Gmail thread.
 * Returns the mapping if found (append mode), null if not (create mode).
 */
export async function resolveThread(gmailThreadId: string): Promise<TopicThreadMap | null> {
  const existing = await TopicThreadMap.findOne({
    where: { gmail_thread_id: gmailThreadId },
  });

  if (existing) {
    logger.info('Thread resolved to existing Basecamp mapping', {
      gmailThreadId,
      basecampTopicId: existing.basecamp_topic_id,
    });
  }

  return existing;
}

/**
 * Create a new mapping between a Gmail thread and Basecamp topic/todolist.
 */
export async function createMapping(
  gmailThreadId: string,
  basecampTopicId: string | null,
  basecampTodolistId: string | null,
): Promise<TopicThreadMap> {
  const mapping = await TopicThreadMap.create({
    gmail_thread_id: gmailThreadId,
    basecamp_topic_id: basecampTopicId,
    basecamp_todolist_id: basecampTodolistId,
    last_updated: new Date(),
  });

  logger.info('Created new thread mapping', {
    gmailThreadId,
    basecampTopicId,
    basecampTodolistId,
  });

  return mapping;
}

/**
 * Update an existing mapping (e.g., after appending a comment).
 */
export async function updateMapping(
  gmailThreadId: string,
  updates: Partial<{ basecamp_topic_id: string; basecamp_todolist_id: string; status: 'active' | 'resolved' | 'stalled' }>,
): Promise<void> {
  await TopicThreadMap.update(
    { ...updates, last_updated: new Date() },
    { where: { gmail_thread_id: gmailThreadId } },
  );
}
