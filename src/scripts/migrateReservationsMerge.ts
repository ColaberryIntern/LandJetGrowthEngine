/**
 * migrateReservationsMerge.ts
 * Idempotent: add the merged_into column used by manual reservation merging.
 * Run: docker exec landjet-backend npx tsx /app/src/scripts/migrateReservationsMerge.ts
 */
import './../config/environment';
import { getSequelize } from '../config/database';

async function main(): Promise<void> {
  const seq = getSequelize();
  await seq.query(`ALTER TABLE reservation_quotes ADD COLUMN IF NOT EXISTS merged_into INTEGER`);
  const [cols] = await seq.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='reservation_quotes' AND column_name='merged_into'`,
  );
  console.log('merged_into present:', (cols as any[]).length === 1);
  console.log('migrateReservationsMerge complete.');
  process.exit(0);
}

main().catch((e) => { console.error('migrateReservationsMerge FAILED:', e); process.exit(1); });
