import { runReleaseChecks } from '../services/outreachReleaseChecks';

/**
 * verifyOutreachRelease.ts
 * Human-readable run of the 20-check x 5-scenario release matrix. Prints a
 * PASS/FAIL grid and exits non-zero if any applicable cell fails -- the "hard
 * gate" of the loop, runnable on demand as release evidence.
 *
 *   npx tsx src/scripts/verifyOutreachRelease.ts
 *
 * Pure (no DB / no network): it verifies the production logic deterministically.
 */
function cell(c: { applicable: boolean; pass: boolean }): string {
  if (!c.applicable) return ' -- ';
  return c.pass ? ' PASS' : ' FAIL';
}

function main() {
  const m = runReleaseChecks();

  console.log('\nOutreach Release Readiness Matrix');
  console.log('=================================\n');
  console.log('Scenarios:');
  for (const s of m.scenarios) console.log(`  ${s.id}  ${s.label}`);
  console.log('');

  const header = ['Check'.padEnd(56), ...m.scenarios.map(s => s.id.padStart(5))].join(' |');
  console.log(header);
  console.log('-'.repeat(header.length));
  for (const c of m.checks) {
    const row = [`${c.id} ${c.label}`.slice(0, 56).padEnd(56), ...m.scenarios.map(s => cell(m.cells[c.id][s.id]).padStart(5))].join(' |');
    console.log(row);
  }

  console.log('');
  if (m.allPass) {
    console.log('RESULT: ALL APPLICABLE CHECKS PASS -- release-ready.');
    process.exit(0);
  }
  console.log(`RESULT: ${m.failures.length} FAILURE(S):`);
  for (const f of m.failures) console.log(`  ${f.checkId} @ ${f.scenarioId}: ${f.detail}`);
  process.exit(1);
}

main();
