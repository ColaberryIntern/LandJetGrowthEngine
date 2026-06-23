import '../config/environment';
import bcrypt from 'bcrypt';
import { getSequelize } from '../config/database';
import { initModels, User } from '../models';
import { SystemSetting } from '../models/SystemSetting';
import { getOutreachSettings } from '../services/outreachQueryService';
import {
  DEFAULT_SENDER_PROFILES,
  DEFAULT_SIGNATURE_TEMPLATE,
  tokenizeSignature,
  saveSendersConfig,
  type SenderProfile,
} from '../services/senderProfileService';

/**
 * provisionOutreachTeam.ts
 * Make the outreach team release-ready in one idempotent pass:
 *   1. Ensure Ryan / Percy / Grant each have an ACTIVE login scoped to their
 *      area (Ryan = all, Percy = TX, Grant = IA).
 *   2. Seed the per-sender identity config (outreach.senders) so each person's
 *      mail leaves with THEIR name, title, and signature -- modeled on Ryan's
 *      existing stored signature (tokenized so the look is shared).
 *
 *   npx tsx src/scripts/provisionOutreachTeam.ts            -> DRY RUN (no writes)
 *   APPLY=1 npx tsx src/scripts/provisionOutreachTeam.ts    -> apply
 *
 * Idempotent + non-destructive:
 *   - Never resets an EXISTING user's password (no lockout). A freshly created
 *     user gets a temp password printed once for out-of-band delivery.
 *   - Sets status=active and area states authoritatively (Ali's chosen mapping).
 *   - Does not downgrade an existing role; only sets a role on create.
 */

const TEMP_PASSWORD = process.env.PROVISION_TEMP_PASSWORD || 'LandJet2026!';

interface SeedUser {
  email: string;
  first_name: string;
  last_name: string;
  role: 'admin' | 'account_manager';
  states: string[];
}

// Roles grant app permissions; AREA scope (states) is enforced separately and
// role-agnostically (see leadScope.ts), so Percy being admin still only sees TX.
const TEAM: SeedUser[] = [
  { email: 'rlandry@landjet.com', first_name: 'Ryan', last_name: 'Landry', role: 'admin', states: [] },
  { email: 'percy@landjet.com', first_name: 'Percy', last_name: 'Kapadia', role: 'admin', states: ['TX'] },
  { email: 'gnecker@landjet.com', first_name: 'Grant', last_name: 'Necker', role: 'account_manager', states: ['IA'] },
];

async function provisionUsers(apply: boolean): Promise<void> {
  console.log('=== Users ==================================================');
  for (const seed of TEAM) {
    const existing = await User.findOne({ where: { email: seed.email } });
    const wantFilters = { states: seed.states };

    if (!existing) {
      console.log(`CREATE ${seed.email}  role=${seed.role}  states=${JSON.stringify(seed.states)}  (temp pw: ${TEMP_PASSWORD})`);
      if (apply) {
        const hash = await bcrypt.hash(TEMP_PASSWORD, 12);
        await User.create({
          email: seed.email,
          password_hash: hash,
          first_name: seed.first_name,
          last_name: seed.last_name,
          role: seed.role as any,
          status: 'active',
          default_filters: wantFilters,
        });
      }
      continue;
    }

    const changes: string[] = [];
    if (existing.status !== 'active') changes.push(`status ${existing.status}->active`);
    const curStates = JSON.stringify((existing.default_filters as { states?: unknown })?.states ?? null);
    if (curStates !== JSON.stringify(seed.states)) changes.push(`states ${curStates}->${JSON.stringify(seed.states)}`);

    if (changes.length === 0) {
      console.log(`OK     ${seed.email}  (active, states already ${JSON.stringify(seed.states)})`);
      continue;
    }
    console.log(`UPDATE ${seed.email}  ${changes.join(', ')}`);
    if (apply) {
      await existing.update({
        status: 'active',
        default_filters: { ...(existing.default_filters as object), states: seed.states },
      });
    }
  }
}

/** Derive a shared template from Ryan's existing signature so the team inherits
 *  his exact look. Falls back to the built-in template if Ryan has no stored
 *  signature or if tokenizing left his name behind (we must never ship a
 *  template that hardcodes one person for everyone). */
async function buildTemplate(): Promise<string> {
  const settings = await getOutreachSettings();
  const ryanSig = (settings.email_signature || '').trim();
  const ryanTitle = (settings.sender_role || 'CEO').split(',')[0].trim() || 'CEO';
  if (!ryanSig) {
    console.log('No stored Ryan signature found; using the built-in default template.');
    return DEFAULT_SIGNATURE_TEMPLATE;
  }
  const tokenized = tokenizeSignature(ryanSig, { name: 'Ryan Landry', title: ryanTitle });
  if (!tokenized.includes('{{sender_name}}') || /Ryan\s+Landry/.test(tokenized)) {
    console.log('Could not cleanly tokenize Ryan\'s signature; using the built-in default template.');
    return DEFAULT_SIGNATURE_TEMPLATE;
  }
  console.log('Derived shared signature template from Ryan\'s stored signature.');
  return tokenized;
}

async function provisionSenders(apply: boolean): Promise<void> {
  console.log('=== Sender profiles =======================================');
  const template = await buildTemplate();
  const profiles: Record<string, SenderProfile> = {};
  for (const [k, v] of Object.entries(DEFAULT_SENDER_PROFILES)) profiles[k] = { ...v };

  for (const p of Object.values(profiles)) {
    console.log(`  ${p.email}  ->  ${p.name}, ${p.title}  area=${JSON.stringify(p.area)}`);
  }
  if (apply) {
    await saveSendersConfig({ template, profiles });
    console.log('Saved outreach.senders.');
  }
}

async function main() {
  const apply = process.env.APPLY === '1';
  const sequelize = getSequelize();
  initModels(sequelize);
  // SystemSetting is used indirectly by getOutreachSettings/saveSendersConfig.
  void SystemSetting;

  console.log(apply ? '*** APPLY MODE (writing changes) ***\n' : '*** DRY RUN (no writes; set APPLY=1 to apply) ***\n');
  await provisionUsers(apply);
  console.log('');
  await provisionSenders(apply);
  console.log(`\n${apply ? 'DONE.' : 'Dry run complete. Re-run with APPLY=1 to apply.'}`);
  await sequelize.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
