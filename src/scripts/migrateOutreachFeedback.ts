/**
 * migrateOutreachFeedback.ts
 * Idempotent: creates the table backing the Outreach "Report an issue" loop --
 * one row per piece of operator feedback, with the LLM triage, the chosen
 * action, what was applied, and the status. Audit trail + training data.
 * Run: docker exec landjet-backend npx tsx /app/src/scripts/migrateOutreachFeedback.ts
 */
import './../config/environment';
import { getSequelize } from '../config/database';

async function main(): Promise<void> {
  const seq = getSequelize();
  await seq.query(`CREATE TABLE IF NOT EXISTS outreach_feedback (
    id SERIAL PRIMARY KEY,
    contact_id TEXT,                 -- outreach contact/lead id, if reported from a card
    category TEXT NOT NULL,
    comment TEXT,
    triage JSONB,                    -- raw LLM assessment { action, params, summary, confidence }
    action TEXT,                     -- bounded action chosen (add_guardrail, update_setting, ...)
    applied TEXT,                    -- plain-language summary of what changed / why it was held
    status TEXT NOT NULL DEFAULT 'needs_review',  -- applied | needs_review | failed
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await seq.query(`CREATE INDEX IF NOT EXISTS idx_outreach_feedback_status ON outreach_feedback (status)`);
  await seq.query(`CREATE INDEX IF NOT EXISTS idx_outreach_feedback_created ON outreach_feedback (created_at DESC)`);

  const [t] = await seq.query(
    `SELECT table_name FROM information_schema.tables WHERE table_name = 'outreach_feedback'`,
  );
  console.log('tables:', (t as any[]).map((x) => x.table_name).join(', ') || '(none)');
  console.log('migrateOutreachFeedback complete.');
  process.exit(0);
}

main().catch((e) => { console.error('migrateOutreachFeedback FAILED:', e); process.exit(1); });
