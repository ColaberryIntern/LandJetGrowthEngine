import { CommunicationFeedback } from '../models/CommunicationFeedback';
import { TopicThreadMap } from '../models/TopicThreadMap';
import { Op } from 'sequelize';
import { logger } from '../config/logger';

/**
 * Create or update feedback for a topic thread map.
 */
export async function updateFeedback(
  topicThreadMapId: string,
  todosCreated: number,
): Promise<CommunicationFeedback> {
  const [feedback, created] = await CommunicationFeedback.findOrCreate({
    where: { topic_thread_map_id: topicThreadMapId },
    defaults: {
      topic_thread_map_id: topicThreadMapId,
      todos_created: todosCreated,
      last_activity: new Date(),
    },
  });

  if (!created) {
    feedback.todos_created += todosCreated;
    feedback.recurrence_count += 1;
    feedback.is_recurring = feedback.recurrence_count >= 3;
    feedback.last_activity = new Date();
    await feedback.save();
  }

  return feedback;
}

/**
 * Get topics that are stalled (open > 7 days with no completion).
 */
export async function getStalledTopics(): Promise<TopicThreadMap[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  return TopicThreadMap.findAll({
    where: {
      status: 'active',
      last_updated: { [Op.lt]: sevenDaysAgo },
    },
    include: [{
      model: CommunicationFeedback,
      as: 'feedback',
      where: {
        todos_created: { [Op.gt]: 0 },
        todos_completed: 0,
      },
      required: true,
    }],
  });
}

/**
 * Get recurring topics (referenced 3+ times).
 */
export async function getRecurringTopics(): Promise<CommunicationFeedback[]> {
  return CommunicationFeedback.findAll({
    where: { is_recurring: true },
    include: [{ model: TopicThreadMap, as: 'topicMap' }],
    order: [['recurrence_count', 'DESC']],
  });
}

/**
 * Get overall feedback stats.
 */
export async function getFeedbackStats(): Promise<{
  total_topics: number;
  total_todos_created: number;
  total_todos_completed: number;
  completion_rate: number;
  stalled_count: number;
  recurring_count: number;
}> {
  const allFeedback = await CommunicationFeedback.findAll();

  const totalTodosCreated = allFeedback.reduce((sum, f) => sum + f.todos_created, 0);
  const totalTodosCompleted = allFeedback.reduce((sum, f) => sum + f.todos_completed, 0);

  const stalledTopics = await getStalledTopics();
  const recurringTopics = await getRecurringTopics();

  return {
    total_topics: allFeedback.length,
    total_todos_created: totalTodosCreated,
    total_todos_completed: totalTodosCompleted,
    completion_rate: totalTodosCreated > 0 ? totalTodosCompleted / totalTodosCreated : 0,
    stalled_count: stalledTopics.length,
    recurring_count: recurringTopics.length,
  };
}
