/**
 * migrateReservationsManualLifecycle.ts
 * Idempotent: add manual_lifecycle_at so an operator's hand-set status sticks
 * (the reconcile respects it until new activity arrives).
 * Run: docker exec landjet-backend npx tsx /app/src/scripts/migrateReservationsManualLifecycle.ts
 */
import './../config/environment';
import { getSequelize } from '../config/database';

async function main(): Promise<void> {
  const seq = getSequelize();
  await seq.query(`ALTER TABLE reservation_quotes ADD COLUMN IF NOT EXISTS manual_lifecycle_at TIMESTAMPTZ`);
  const [cols] = await seq.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='reservation_quotes' AND column_name='manual_lifecycle_at'`,
  );
  console.log('manual_lifecycle_at present:', (cols as any[]).length === 1);
  console.log('migrateReservationsManualLifecycle complete.');
  process.exit(0);
}

main().catch((e) => { console.error('migrateReservationsManualLifecycle FAILED:', e); process.exit(1); });
