/**
 * learnReservations.ts
 * One-off backfill: mine Sent Items across the reservation-related mailboxes and
 * build each account's tone profile. Idempotent (exemplars dedupe by message id).
 *
 * Run: docker exec landjet-backend npx tsx /app/src/scripts/learnReservations.ts
 */
import './../config/environment';
import { getSequelize } from '../config/database';
import { initModels } from '../models';
import { learnFromMailboxes } from '../services/reservationLearningService';

async function main(): Promise<void> {
  initModels(getSequelize());
  const def = (process.env.RESERVATION_EXTRA_MAILBOXES ?? 'rlandry@landjet.com,percy@landjet.com')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const mailboxes = ['ljreservations@landjet.com', ...def];
  const max = Number(process.env.LEARN_MAX_MESSAGES) || 400;
  console.log('Mining + tone-profiling:', mailboxes.join(', '), `(max ${max}/mailbox)`);
  const summary = await learnFromMailboxes(mailboxes, max);
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

main().catch((e) => { console.error('learnReservations FAILED:', e); process.exit(1); });
