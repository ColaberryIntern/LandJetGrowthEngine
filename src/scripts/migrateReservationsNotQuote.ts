/**
 * migrateReservationsNotQuote.ts
 * Idempotent: add deleted_at (soft delete). The not_quote lifecycle needs no
 * schema change (lifecycle is TEXT). Also backfills obvious non-quote rows that
 * are currently sitting in needs_reply into the not_quote bucket.
 * Run: docker exec landjet-backend npx tsx /app/src/scripts/migrateReservationsNotQuote.ts
 */
import './../config/environment';
import { getSequelize } from '../config/database';
import { initModels } from '../models';

async function main(): Promise<void> {
  const seq = getSequelize();
  initModels(seq);
  await seq.query(`ALTER TABLE reservation_quotes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);

  // Backfill: reclassify existing noise rows (still in an active state, no quote)
  // into not_quote using the same heuristic the ingest now applies.
  const { ReservationQuote } = await import('../models/ReservationQuote');
  const { isNonQuoteEmail } = await import('../services/reservationClassify');
  const { Op } = await import('sequelize');
  const rows = await ReservationQuote.findAll({
    where: { lifecycle: { [Op.in]: ['needs_reply', 'awaiting_customer'] }, quote_total: null, deleted_at: null } as any,
  });
  let moved = 0;
  for (const rq of rows) {
    const r = (rq.result || {}) as { trip?: any; mode?: string };
    const hasTrip = Boolean(r.trip?.pickup_address || r.trip?.dropoff_address);
    if (hasTrip) continue; // a real (if incomplete) request -> leave it
    if (isNonQuoteEmail(rq.from_email, rq.subject, rq.raw_body)) {
      await rq.update({ lifecycle: 'not_quote' } as any);
      moved++;
    }
  }
  console.log(`backfill: moved ${moved} noise rows to not_quote (scanned ${rows.length}).`);
  console.log('migrateReservationsNotQuote complete.');
  process.exit(0);
}

main().catch((e) => { console.error('migrateReservationsNotQuote FAILED:', e); process.exit(1); });
