/**
 * Run the communication intelligence pipeline directly.
 * Usage: npx ts-node scripts/run-comm-pipeline.ts [lookback_hours]
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { getSequelize } from '../src/config/database';
import { initModels } from '../src/models';

async function main() {
  const lookbackHours = parseInt(process.argv[2] || '720', 10);
  console.log(`\n=== Communication Intelligence Pipeline ===`);
  console.log(`Lookback: ${lookbackHours} hours (${Math.round(lookbackHours / 24)} days)\n`);

  // Initialize database
  const sequelize = getSequelize();
  await sequelize.authenticate();
  initModels(sequelize);
  console.log('Database connected.\n');

  // Import after models are initialized
  const { runPipeline } = await import('../src/services/communicationOrchestratorService');

  const result = await runPipeline(lookbackHours);

  console.log('\n=== Pipeline Results ===');
  console.log(`Fetched: ${result.fetched} emails`);
  console.log(`New: ${result.new_emails} emails`);
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
  console.error('Pipeline failed:', err);
  process.exit(1);
});
