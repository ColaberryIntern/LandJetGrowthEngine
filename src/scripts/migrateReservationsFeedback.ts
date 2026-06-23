/**
 * migrateReservationsFeedback.ts
 * Idempotent: tables for per-reservation feedback and the learned classifier
 * rules derived from corrections, so the system improves as the team uses it.
 * Run: docker exec landjet-backend npx tsx /app/src/scripts/migrateReservationsFeedback.ts
 */
import './../config/environment';
import { getSequelize } from '../config/database';

async function main(): Promise<void> {
  const seq = getSequelize();
  await seq.query(`CREATE TABLE IF NOT EXISTS reservation_feedback (
    id SERIAL PRIMARY KEY,
    reservation_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    comment TEXT,
    action TEXT,                    -- structured correction applied (e.g. set_not_quote)
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await seq.query(`CREATE INDEX IF NOT EXISTS idx_resv_feedback_resid ON reservation_feedback (reservation_id)`);

  // Learned classifier rules: a sender (domain or exact email) the team has told
  // us is always / never a quote. Consulted before the heuristic on ingest.
  await seq.query(`CREATE TABLE IF NOT EXISTS reservation_classifier_rules (
    id SERIAL PRIMARY KEY,
    pattern_type TEXT NOT NULL,      -- 'sender_domain' | 'sender_email'
    pattern_value TEXT NOT NULL,
    decision TEXT NOT NULL,          -- 'not_quote' | 'quote'
    source TEXT,                     -- 'reclassify' | 'feedback'
    hit_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (pattern_type, pattern_value)
  )`);

  const [t] = await seq.query(
    `SELECT table_name FROM information_schema.tables WHERE table_name IN ('reservation_feedback','reservation_classifier_rules') ORDER BY 1`,
  );
  console.log('tables:', (t as any[]).map((x) => x.table_name).join(', '));
  console.log('migrateReservationsFeedback complete.');
  process.exit(0);
}

main().catch((e) => { console.error('migrateReservationsFeedback FAILED:', e); process.exit(1); });
