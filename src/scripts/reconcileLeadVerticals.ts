/**
 * Reconcile every lead's vertical + campaign against its REAL industry.
 *
 * This is the backstop for the deterministic categorization fix (Ali decision
 * 2026-06-19). Ingestion auto-routes new leads, but this sweep repairs the
 * existing backlog and catches drift, so the wrong-category problem Ryan keeps
 * flagging cannot accumulate again. Safe to run on a schedule.
 *
 * For each active lead it runs the same pure routing logic used at ingestion:
 *   - routed       : moved to the campaign matching its industry
 *   - kept         : already in the right campaign
 *   - flagged      : industry maps to a vertical with NO active campaign
 *   - unclassified : industry does not map to any known vertical
 *   - manual_skip  : operator categorized it by hand (left untouched)
 *
 * Idempotent: the classifier is pure and routing is stable, so a second run
 * with no new data reports every lead as 'kept'/'manual_skip' and writes
 * nothing new.
 *
 * Run modes:
 *   - dry run (default): prints what WOULD change, makes no DB writes.
 *   - apply (--apply):   persists the routing + badge corrections.
 *
 * Run from inside the backend container:
 *   docker exec landjet-backend npx tsx /app/src/scripts/reconcileLeadVerticals.ts
 *   docker exec landjet-backend npx tsx /app/src/scripts/reconcileLeadVerticals.ts --apply
 */

import { getSequelize } from '../config/database';
import { initModels } from '../models';
import { Lead } from '../models/Lead';
import { buildVerticalCampaignMap, routeLeadToCorrectCampaign, RouteAction } from '../services/leadRoutingService';

const APPLY = process.argv.includes('--apply');

(async () => {
  const sequelize = getSequelize();
  initModels(sequelize);
  await sequelize.authenticate();

  console.log(`Reconcile lead verticals -- mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log('');

  const campaignMap = await buildVerticalCampaignMap();
  console.log(`Active campaigns by vertical: ${[...campaignMap.keys()].join(', ') || '(none)'}`);
  console.log('');

  const leads = await Lead.findAll({
    where: { status: 'active' },
    attributes: ['id', 'first_name', 'last_name', 'company', 'industry', 'vertical', 'campaign_id', 'notes', 'sequence_stage'],
  });

  const tally: Record<RouteAction, number> = {
    routed: 0, kept: 0, flagged: 0, unclassified: 0, manual_skip: 0,
  };
  const needsAttention: string[] = [];

  for (const lead of leads) {
    // persist only on --apply; dry run mutates in-memory copies and discards them.
    const result = await routeLeadToCorrectCampaign(lead, { campaignMap, persist: APPLY });
    tally[result.action]++;
    if (result.action === 'routed') {
      console.log(`  routed   #${lead.id} ${lead.company ?? ''} -> ${result.leadVertical} (${result.reason})`);
    }
    if (result.action === 'flagged' || result.action === 'unclassified') {
      needsAttention.push(`  ${result.action.padEnd(12)} #${lead.id} ${lead.company ?? ''} | industry="${lead.industry ?? '(none)'}" | ${result.reason}`);
    }
  }

  console.log('');
  console.log('Summary:');
  console.log(`  total active leads : ${leads.length}`);
  console.log(`  routed             : ${tally.routed}`);
  console.log(`  kept (already ok)  : ${tally.kept}`);
  console.log(`  manual (skipped)   : ${tally.manual_skip}`);
  console.log(`  flagged (no campgn): ${tally.flagged}`);
  console.log(`  unclassified       : ${tally.unclassified}`);

  if (needsAttention.length > 0) {
    console.log('');
    console.log('Needs attention (left in place, flagged for review):');
    needsAttention.forEach((l) => console.log(l));
  }

  if (!APPLY && (tally.routed > 0)) {
    console.log('');
    console.log(`Dry run only. Re-run with --apply to persist ${tally.routed} routing change(s).`);
  }

  await sequelize.close();
})().catch((e) => { console.error('ERR', e); process.exit(1); });
