import '../config/environment';
import { getSequelize } from '../config/database';
import { initModels } from '../models';
import { ingestReservationQuotes } from '../services/reservationQuoteService';

/**
 * Manually run the reservation-mailbox auto-quote ingest.
 *   LOOKBACK_HOURS=168 npx tsx src/scripts/ingestReservationQuotes.ts
 * Idempotent: re-running skips emails already priced (dedup by Graph message id).
 */
(async () => {
  initModels(getSequelize());
  const lookbackHours = Number(process.env.LOOKBACK_HOURS) || 168;
  const result = await ingestReservationQuotes({ lookbackHours });
  console.log('RESERVATION INGEST:', JSON.stringify(result, null, 2));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
