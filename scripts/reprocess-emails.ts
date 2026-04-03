/**
 * Reset and reprocess all emails with AI classification.
 * Usage: npx ts-node scripts/reprocess-emails.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { getSequelize } from '../src/config/database';
import { initModels } from '../src/models';
import { EmailThread } from '../src/models/EmailThread';

async function main() {
  console.log('\n=== Reprocessing Emails with AI Classification ===\n');

  const sequelize = getSequelize();
  await sequelize.authenticate();
  initModels(sequelize);

  // Reset all emails to unprocessed
  const [count] = await EmailThread.update(
    { processed: false, skipped: false, classified_data: null, priority_score: null },
    { where: {} },
  );
  console.log(`Reset ${count} emails for reprocessing.\n`);

  const { processEmails } = await import('../src/services/communicationOrchestratorService');
  const result = await processEmails();

  console.log('\n=== Results ===');
  console.log(`Processed: ${result.processed}`);
  console.log(`Skipped: ${result.skipped}`);
  console.log(`Errors: ${result.errors}`);

  if (result.details.length > 0) {
    console.log('\nDetails:');
    for (const d of result.details) {
      console.log(`  [${d.action}] ${d.subject}${d.error ? ` - ERROR: ${d.error}` : ''}`);
    }
  }

  console.log('\nDone.');
  await sequelize.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
