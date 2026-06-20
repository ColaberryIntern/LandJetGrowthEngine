import '../config/environment';
import { Op } from 'sequelize';
import { getSequelize } from '../config/database';
import { initModels, Lead } from '../models';
import { stateFromAreaCode, stateFromCompanyLLM } from '../services/leadLocation';

/**
 * backfillLeadLocations.ts
 * Populate leads.state (and city when available) for the legacy rows that have
 * no location, so territory scoping + the territory map have data.
 *
 *   npx tsx src/scripts/backfillLeadLocations.ts                 -> DRY RUN, area-code pass only
 *   npx tsx src/scripts/backfillLeadLocations.ts --apply         -> persist area-code pass
 *   npx tsx src/scripts/backfillLeadLocations.ts --apply --llm --limit 300
 *        -> after area code, resolve remaining via company LLM (capped at --limit)
 *   --refresh -> also re-resolve leads that already have a state (default: skip them)
 *
 * Idempotent: re-running reports already-set leads as "kept". Stamps provenance
 * in notes.location = { state, city, source, confidence, at } so we never lose
 * how a value was derived.
 */
const APPLY = process.argv.includes('--apply');
const USE_LLM = process.argv.includes('--llm');
const REFRESH = process.argv.includes('--refresh');
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i >= 0 ? parseInt(process.argv[i + 1] || '0', 10) || 0 : 0;
})();

function domainFromEmail(email: string | null): string | null {
  if (!email || !email.includes('@')) return null;
  return email.split('@')[1]?.toLowerCase() || null;
}

async function main() {
  const sequelize = getSequelize();
  initModels(sequelize);

  const where = REFRESH ? {} : { [Op.or]: [{ state: null }, { state: '' }] };
  const leads = await Lead.findAll({ where, attributes: ['id', 'phone', 'company', 'email', 'state', 'city', 'notes'] });
  console.log(`=== BACKFILL LEAD LOCATIONS ${APPLY ? '(APPLY)' : '(DRY RUN)'} ${USE_LLM ? '+LLM' : ''} ===`);
  console.log(`candidates (missing state${REFRESH ? ' / refresh all' : ''}): ${leads.length}`);

  let area = 0, llm = 0, kept = 0, unresolved = 0, llmCalls = 0;

  for (const lead of leads) {
    if (!REFRESH && lead.state) { kept++; continue; }

    let state = stateFromAreaCode(lead.phone);
    let city: string | null = null;
    let source = state ? 'area_code' : 'none';
    let confidence = state ? 0.7 : 0;

    if (!state && USE_LLM && (LIMIT === 0 || llmCalls < LIMIT)) {
      llmCalls++;
      const r = await stateFromCompanyLLM(lead.company, domainFromEmail(lead.email));
      if (r) { state = r.state; city = r.city; source = 'company_llm'; confidence = 0.6; }
    }

    if (!state) { unresolved++; continue; }
    if (source === 'area_code') area++; else llm++;

    if (APPLY) {
      const notes = { ...((lead.notes as Record<string, unknown>) || {}) };
      notes.location = { state, city, source, confidence, at: new Date().toISOString() };
      const patch: Record<string, unknown> = { state, notes };
      if (city && !lead.city) patch.city = city;
      await lead.update(patch as any);
    }
  }

  console.log('---------------------------------------------');
  console.log(`  area-code resolved: ${area}`);
  console.log(`  company-LLM resolved: ${llm} (LLM calls: ${llmCalls})`);
  console.log(`  already had state (kept): ${kept}`);
  console.log(`  still unresolved: ${unresolved}`);
  console.log(`  ${APPLY ? 'PERSISTED' : 'DRY RUN - no writes'}`);
  console.log('---------------------------------------------');
  await sequelize.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
