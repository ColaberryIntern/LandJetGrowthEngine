import '../config/environment';
import { getSequelize } from '../config/database';
import { initModels, Lead } from '../models';
import { validateBatch } from '../services/emailValidationService';
import { blockLead } from '../services/outreachQueryService';

/**
 * validateActiveLeadEmails.ts
 * Proactively validate the email of every lead still eligible for outreach, so
 * the engine stops trying to send to dead domains (Ryan WhatsApp 2026-06-22:
 * "could you have an email validation tool make sure the emails are legitimate
 * before they get sent anything?").
 *
 * Validation is format + MX (src/services/emailValidationService). This catches
 * malformed addresses and domains with no mail exchanger. It does NOT catch a
 * valid domain with a dead mailbox (a person who left the job) -- that needs
 * SMTP/paid verification and is handled post-send by the bounce processor.
 *
 *   npx tsx src/scripts/validateActiveLeadEmails.ts          -> DRY RUN (read-only report)
 *   APPLY=1 npx tsx src/scripts/validateActiveLeadEmails.ts  -> block definitively-invalid leads
 *
 * "Definitively invalid" = empty / invalid_format / no_mx_records. Leads whose
 * MX lookup was merely UNAVAILABLE (transient DNS failure) are reported but
 * NEVER blocked, so a flaky resolver can't archive good leads.
 *
 * Idempotent: blockLead() archives the lead (status='archived'), and this script
 * only selects status='active', so a second run re-validates only what remains.
 */
async function main() {
  const apply = process.env.APPLY === '1';
  const sequelize = getSequelize();
  initModels(sequelize);

  const leads = await Lead.findAll({
    where: { outreach_status: 'ACTIVE', status: 'active' },
    attributes: ['id', 'email', 'company'],
  });

  console.log(`Validating ${leads.length} active leads (${apply ? 'APPLY' : 'DRY RUN'})...`);

  const emails = leads.map((l) => l.email);
  const results = await validateBatch(emails);

  // Index results by email (validateBatch preserves the input email on each row).
  const byEmail = new Map(results.map((r) => [r.email, r]));

  const invalid: { lead: Lead; reason: string }[] = [];
  let transientCount = 0;
  let validCount = 0;

  for (const lead of leads) {
    const r = byEmail.get(lead.email);
    if (!r) continue;
    if (r.valid) {
      if (r.transient) transientCount++;
      else validCount++;
      continue;
    }
    invalid.push({ lead, reason: r.reason || 'unknown' });
  }

  const byReason = invalid.reduce<Record<string, number>>((acc, x) => {
    acc[x.reason] = (acc[x.reason] || 0) + 1;
    return acc;
  }, {});

  console.log('--- Summary ------------------------------------------------');
  console.log(`  valid (MX confirmed):        ${validCount}`);
  console.log(`  undetermined (transient DNS): ${transientCount}  (never blocked)`);
  console.log(`  definitively invalid:        ${invalid.length}`);
  for (const [reason, n] of Object.entries(byReason)) {
    console.log(`     - ${reason}: ${n}`);
  }
  console.log('------------------------------------------------------------');

  if (invalid.length > 0) {
    console.log('Invalid leads (first 50):');
    for (const { lead, reason } of invalid.slice(0, 50)) {
      console.log(`  #${lead.id}  ${lead.email}  [${reason}]  ${lead.company || ''}`);
    }
  }

  if (!apply) {
    console.log(`\n(DRY RUN. Re-run with APPLY=1 to block the ${invalid.length} definitively-invalid leads.)`);
    await sequelize.close();
    return;
  }

  let blocked = 0;
  for (const { lead, reason } of invalid) {
    const res = await blockLead(String(lead.id), `email_validation:${reason}`);
    if (res) blocked++;
  }
  console.log(`\nBlocked ${blocked}/${invalid.length} leads (archived + added to do-not-contact).`);

  await sequelize.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
