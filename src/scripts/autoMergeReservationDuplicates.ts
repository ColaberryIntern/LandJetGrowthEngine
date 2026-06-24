/**
 * autoMergeReservationDuplicates.ts
 * One-off: persistently merge existing same-request duplicate rows (e.g. an
 * internal "FW: June 30th" forward of the same request). Idempotent.
 * Run: docker exec landjet-backend npx tsx /app/src/scripts/autoMergeReservationDuplicates.ts
 */
import './../config/environment';
import { getSequelize } from '../config/database';
import { initModels } from '../models';
import { autoMergeDuplicates } from '../services/reservationQuoteService';

async function main(): Promise<void> {
  initModels(getSequelize());
  const r = await autoMergeDuplicates({ windowDays: 120 });
  console.log(JSON.stringify(r));
  console.log('autoMergeReservationDuplicates complete.');
  process.exit(0);
}

main().catch((e) => { console.error('autoMergeReservationDuplicates FAILED:', e); process.exit(1); });
