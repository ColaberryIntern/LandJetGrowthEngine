/**
 * backfillReservationRoutes.ts
 * Re-run extraction on the FULL conversation history for existing reservation
 * rows that have no route (blank map), now that the engine reads the whole
 * thread. Only fills rows that gain both addresses; never regresses a good row.
 * Idempotent.
 *
 * Run: docker exec landjet-backend npx tsx /app/src/scripts/backfillReservationRoutes.ts
 */
import './../config/environment';
import { getSequelize } from '../config/database';
import { initModels } from '../models';
import { reprocessMissingRoutes } from '../services/reservationQuoteService';

async function main(): Promise<void> {
  initModels(getSequelize());
  const limit = Number(process.env.BACKFILL_LIMIT) || 200;
  console.log(`Reprocessing up to ${limit} rows from full conversation history...`);
  const r = await reprocessMissingRoutes({ limit });
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
}

main().catch((e) => { console.error('backfillReservationRoutes FAILED:', e); process.exit(1); });
