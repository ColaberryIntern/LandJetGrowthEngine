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
  const { isNonQuoteEmail, isPostBookingEmail } = await import('../services/reservationClassify');
  const { Op } = await import('sequelize');
  const rows = await ReservationQuote.findAll({
    where: { lifecycle: { [Op.in]: ['needs_reply', 'awaiting_customer'] }, deleted_at: null } as any,
  });
  let moved = 0;
  for (const rq of rows) {
    const r = (rq.result || {}) as { trip?: any; mode?: string };
    const hasTrip = Boolean(r.trip?.pickup_address || r.trip?.dropoff_address);
    // Post-booking notices (invoice/receipt/confirmation) are not_quote even with
    // a stray parsed trip. Other noise only when there is no real trip.
    const isNoise = isPostBookingEmail(rq.subject, rq.raw_body) ||
      (!hasTrip && rq.quote_total == null && isNonQuoteEmail(rq.from_email, rq.subject, rq.raw_body));
    if (isNoise) {
      await rq.update({ lifecycle: 'not_quote' } as any);
      moved++;
    }
  }
  console.log(`backfill: moved ${moved} noise rows to not_quote (scanned ${rows.length}).`);

  // Reverse direction: fix FALSE POSITIVES -- rows sitting in not_quote that are
  // not actually noise (real quote requests previously mis-filed). Restore them.
  const filed = await ReservationQuote.findAll({ where: { lifecycle: 'not_quote', deleted_at: null } as any });
  let restored = 0;
  for (const rq of filed) {
    if (!isNonQuoteEmail(rq.from_email, rq.subject, rq.raw_body)) {
      await rq.update({ lifecycle: 'needs_reply', resolved_at: null } as any);
      restored++;
    }
  }
  console.log(`backfill: restored ${restored} mis-filed rows from not_quote to needs_reply (scanned ${filed.length}).`);
  console.log('migrateReservationsNotQuote complete.');
  process.exit(0);
}

main().catch((e) => { console.error('migrateReservationsNotQuote FAILED:', e); process.exit(1); });
