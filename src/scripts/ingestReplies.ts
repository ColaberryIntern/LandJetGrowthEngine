/**
 * Detect + validate + record replies to our outreach, advancing replied leads
 * from 'contacted' to 'replied'. See replyIngestionService for the validation
 * rules (thread we-reached-first + internal/vendor deny list).
 *
 * Dry run (default) prints what WOULD be recorded; --apply persists inbound
 * communication_logs rows and advances pipeline stages. Idempotent.
 *
 *   docker exec landjet-backend npx tsx /app/src/scripts/ingestReplies.ts
 *   docker exec landjet-backend npx tsx /app/src/scripts/ingestReplies.ts --apply
 */

import { getSequelize } from '../config/database';
import { initModels } from '../models';
import { ingestReplies } from '../services/replyIngestionService';

const APPLY = process.argv.includes('--apply');

(async () => {
  const sequelize = getSequelize();
  initModels(sequelize);
  await sequelize.authenticate();

  console.log(`Reply ingestion -- mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  const r = await ingestReplies({ persist: APPLY });

  console.log('');
  console.log(`  inbox scanned     : ${r.scanned}`);
  console.log(`  lead candidates   : ${r.candidates}`);
  console.log(`  VALIDATED replies : ${r.validated}  (thread we-reached-first, vendor/internal excluded)`);
  console.log(`  new (deduped)     : ${r.newReplies}`);
  console.log(`  leads -> replied  : ${r.advanced}`);
  console.log(`  errors            : ${r.errors}`);
  console.log('');
  for (const d of r.details) {
    console.log(`  ${d.advanced ? '>>' : '  '} #${d.leadId} ${d.email} :: ${d.subject}${d.persisted ? '' : (APPLY ? ' (dup)' : '')}`);
  }
  if (!APPLY) console.log(`\nDry run only. Re-run with --apply to persist ${r.newReplies} reply row(s) and advance ${r.advanced} lead(s).`);

  await sequelize.close();
})().catch((e) => { console.error('ERR', e); process.exit(1); });
