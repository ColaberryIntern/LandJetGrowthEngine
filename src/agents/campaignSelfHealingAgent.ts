import { Op } from 'sequelize';
import { ScheduledEmail } from '../models/ScheduledEmail';
import { logger } from '../config/logger';

/**
 * Self-healing agent: find and retry failed actions from the last 6 hours.
 * Runs every 30 minutes per Blueprint Section 12.
 */
export async function runSelfHealingCycle(): Promise<{ retried: number; skipped: number }> {
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  let retried = 0;
  let skipped = 0;

  const failedActions = await ScheduledEmail.findAll({
    where: {
      status: 'failed',
      created_at: { [Op.gte]: sixHoursAgo },
      is_test_action: false,
    },
    order: [['created_at', 'DESC']],
    limit: 50,
  });

  for (const action of failedActions) {
    if (action.attempts_made < action.max_attempts) {
      await action.update({
        status: 'pending',
        scheduled_for: new Date(Date.now() + 5 * 60 * 1000),
        processing_started_at: null,
        processor_id: null,
      });
      retried++;
    } else {
      skipped++;
    }
  }

  if (retried > 0) {
    logger.info('Self-healing cycle complete', { retried, skipped });
  }

  return { retried, skipped };
}
