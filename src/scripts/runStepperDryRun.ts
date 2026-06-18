/**
 * Sequence stepper dry-run CLI.
 *
 * Run from inside the backend container with PIPELINE_ENABLE_STEPPER unset
 * (or set to false) to surface what the stepper WOULD do without writing.
 *
 *   docker exec landjet-backend node /app/dist/scripts/runStepperDryRun.js
 *
 * To run live (actually create ScheduledEmail rows), set PIPELINE_ENABLE_STEPPER=true
 * and pass --live. Even then, limit defaults to 10/cycle.
 */

import { runStepperCycle } from '../services/sequenceStepperService';

(async () => {
  const args = process.argv.slice(2);
  const live = args.includes('--live');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 25;

  const result = await runStepperCycle({ dryRun: !live, limit });

  console.log('\n=== Sequence Stepper ' + (result.dry_run ? 'DRY-RUN' : 'LIVE') + ' ===');
  console.log('Cycle started:    ', result.cycle_started_at);
  console.log('Total overdue:    ', result.total_overdue);
  console.log('Considered:       ', result.considered, '(batch limit ' + limit + ')');
  console.log('Would queue:      ', result.dry_run ? (result.considered - result.skipped) : result.queued);
  console.log('Skipped:          ', result.skipped);
  console.log('Errors:           ', result.errors.length);
  if (result.errors.length > 0) {
    console.log('  ' + result.errors.slice(0, 5).join('\n  '));
  }

  console.log('\n--- Per-lead previews (first 25) ---');
  for (const p of result.previews.slice(0, 25)) {
    const prefix = p.reason_skipped ? '[SKIP] ' : '[QUEUE] ';
    const right = p.reason_skipped
      ? `reason: ${p.reason_skipped}`
      : `step ${p.next_step_index} (${p.next_step_channel}) -> next_action_at = ${p.next_action_at_new}`;
    console.log(`${prefix}#${p.lead_id} ${p.lead_name.padEnd(28)} | ${p.campaign_name.padEnd(38)} | ${p.days_overdue}d overdue | ${right}`);
  }

  // Per-campaign breakdown of overdue (not just the batch)
  console.log('\n--- Skip-reason breakdown across this batch ---');
  const reasonCounts = new Map<string, number>();
  for (const p of result.previews) {
    const key = p.reason_skipped || 'WOULD-QUEUE';
    reasonCounts.set(key, (reasonCounts.get(key) || 0) + 1);
  }
  for (const [k, v] of reasonCounts) console.log(`  ${v.toString().padStart(3)}  ${k}`);

  process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
