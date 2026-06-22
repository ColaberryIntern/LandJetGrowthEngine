/**
 * migrateReservationsV2.ts
 * Idempotent schema migration for the Reservations live-console upgrade.
 * Adds lifecycle + AI-draft columns to reservation_quotes and creates the two
 * learning tables. Safe to run multiple times (IF NOT EXISTS everywhere).
 *
 * Run: docker exec landjet-backend npx tsx /app/src/scripts/migrateReservationsV2.ts
 */
import './../config/environment';
import { getSequelize } from '../config/database';

async function main(): Promise<void> {
  const seq = getSequelize();
  const stmts: string[] = [
    `ALTER TABLE reservation_quotes ADD COLUMN IF NOT EXISTS lifecycle TEXT NOT NULL DEFAULT 'needs_reply'`,
    `ALTER TABLE reservation_quotes ADD COLUMN IF NOT EXISTS ai_draft JSONB`,
    `ALTER TABLE reservation_quotes ADD COLUMN IF NOT EXISTS our_reply_at TIMESTAMPTZ`,
    `ALTER TABLE reservation_quotes ADD COLUMN IF NOT EXISTS reply_from TEXT`,
    // Backfill lifecycle for existing rows: if we already sent/prepared, treat as
    // awaiting; otherwise needs_reply. (result->>'sent' implies we replied.)
    `UPDATE reservation_quotes SET lifecycle = 'awaiting_customer'
       WHERE lifecycle = 'needs_reply' AND (result ? 'sent')`,
    `CREATE TABLE IF NOT EXISTS reservation_reply_exemplars (
       id SERIAL PRIMARY KEY,
       mailbox TEXT NOT NULL,
       source_message_id TEXT NOT NULL UNIQUE,
       conversation_id TEXT,
       inbound_subject TEXT,
       inbound_excerpt TEXT,
       reply_excerpt TEXT NOT NULL,
       sent_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_reply_exemplars_mailbox ON reservation_reply_exemplars (mailbox)`,
    `CREATE TABLE IF NOT EXISTS reservation_tone_profiles (
       mailbox TEXT PRIMARY KEY,
       greeting TEXT,
       signoff TEXT,
       avg_length INTEGER,
       formality TEXT,
       guidance TEXT,
       sample_count INTEGER NOT NULL DEFAULT 0,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  ];

  for (const sql of stmts) {
    await seq.query(sql);
    console.log('OK:', sql.split('\n')[0].slice(0, 80));
  }

  const [cols] = await seq.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='reservation_quotes' AND column_name IN ('lifecycle','ai_draft','our_reply_at','reply_from') ORDER BY column_name`,
  );
  console.log('reservation_quotes new columns:', (cols as any[]).map((c) => c.column_name).join(', '));
  const [tabs] = await seq.query(
    `SELECT table_name FROM information_schema.tables WHERE table_name IN ('reservation_reply_exemplars','reservation_tone_profiles') ORDER BY table_name`,
  );
  console.log('learning tables:', (tabs as any[]).map((t) => t.table_name).join(', '));
  console.log('migrateReservationsV2 complete.');
  process.exit(0);
}

main().catch((e) => { console.error('migrateReservationsV2 FAILED:', e); process.exit(1); });
