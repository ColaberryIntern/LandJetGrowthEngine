/**
 * migrateReservationsIntent.ts
 * Idempotent: add last_inbound_intent + resolved_at columns for smart-tag /
 * auto-resolve support.
 * Run: docker exec landjet-backend npx tsx /app/src/scripts/migrateReservationsIntent.ts
 */
import './../config/environment';
import { getSequelize } from '../config/database';

async function main(): Promise<void> {
  const seq = getSequelize();
  await seq.query(`ALTER TABLE reservation_quotes ADD COLUMN IF NOT EXISTS last_inbound_intent TEXT`);
  await seq.query(`ALTER TABLE reservation_quotes ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ`);
  // Backfill resolved_at for rows already resolved, so the Resolved bucket has a
  // sensible newest-first order on day one (use updated_at as a proxy).
  await seq.query(`UPDATE reservation_quotes SET resolved_at = updated_at WHERE lifecycle IN ('booked','closed','completed') AND resolved_at IS NULL`);
  const [cols] = await seq.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='reservation_quotes' AND column_name IN ('last_inbound_intent','resolved_at') ORDER BY column_name`,
  );
  console.log('new columns:', (cols as any[]).map((c) => c.column_name).join(', '));
  console.log('migrateReservationsIntent complete.');
  process.exit(0);
}

main().catch((e) => { console.error('migrateReservationsIntent FAILED:', e); process.exit(1); });
