/**
 * Deterministic outreach queries.
 * Pure data retrieval + in-memory priority scoring.
 */

import { Op } from 'sequelize';
import { Contact } from '../models/Contact';

/**
 * Compute priority score in-memory based on deterministic rules.
 * Does NOT persist the score.
 */
export function computePriorityScore(contact: Contact): number {
  let score = 0;

  // Stage bonus: earlier stages get higher priority
  switch (contact.sequence_stage) {
    case 1: score += 3; break;
    case 2: score += 2; break;
    case 3: score += 1; break;
  }

  // Never contacted bonus
  if (contact.last_contacted_at === null) {
    score += 3;
  }

  // Tier bonus
  switch (contact.tier) {
    case 1: score += 5; break;
    case 2: score += 3; break;
    case 3: score += 1; break;
  }

  return score;
}

/**
 * Return contacts that need outreach today, scored and sorted by priority.
 *
 * Criteria:
 *   - status = 'ACTIVE'
 *   - next_action_at is NULL (never scheduled) OR next_action_at <= now
 *
 * Sorting: priority_score DESC, then created_at ASC.
 * Limited to 50 results.
 */
export async function getContactsForToday(): Promise<Contact[]> {
  const contacts = await Contact.findAll({
    where: {
      status: 'ACTIVE',
      [Op.or]: [
        { next_action_at: null },
        { next_action_at: { [Op.lte]: new Date() } },
      ],
    },
    limit: 200,
    order: [['created_at', 'ASC']],
  });

  // Compute priority in-memory and attach to each contact
  for (const contact of contacts) {
    contact.priority_score = computePriorityScore(contact);
  }

  // Sort by priority_score DESC, then created_at ASC
  contacts.sort((a, b) => {
    if (b.priority_score !== a.priority_score) {
      return b.priority_score - a.priority_score;
    }
    return a.created_at.getTime() - b.created_at.getTime();
  });

  return contacts.slice(0, 50);
}
