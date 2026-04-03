import { ClassifiedData } from '../models/EmailThread';

const KEYWORD_WEIGHTS: Record<string, number> = {
  urgent: 3,
  asap: 3,
  blocker: 3,
  deadline: 2,
  important: 1.5,
  critical: 3,
  'time-sensitive': 2,
  fyi: -1,
  'no rush': -1,
  'just wanted': -1,
};

const PRIORITY_BONUS: Record<string, number> = {
  high: 3,
  medium: 1,
  low: -1,
};

/**
 * Score an email for priority based on classification and content.
 */
export function scoreEmail(
  subject: string,
  body: string,
  classified: ClassifiedData,
): number {
  let score = 0;

  // Sender weight (monitored senders are always important)
  score += 3;

  // Keyword analysis on subject + body
  const text = `${subject} ${body}`.toLowerCase();
  for (const [keyword, weight] of Object.entries(KEYWORD_WEIGHTS)) {
    if (text.includes(keyword)) {
      score += weight;
    }
  }

  // AI priority bonus
  score += PRIORITY_BONUS[classified.priority] || 0;

  // Actionable bonus
  score += (classified.todos?.length || 0) * 0.5;

  // Length bonus (longer emails tend to be more substantive)
  if ((body || '').length > 1000) score += 1;

  // Discussion penalty (no todos = likely not actionable)
  if (classified.type === 'discussion' && (!classified.todos || classified.todos.length === 0)) {
    score -= 2;
  }

  return Math.round(score * 10) / 10;
}

/**
 * Check if an email should be processed based on its priority score.
 */
export function shouldProcess(score: number): boolean {
  const threshold = parseFloat(process.env.COMM_PRIORITY_THRESHOLD || '3');
  return score >= threshold;
}
