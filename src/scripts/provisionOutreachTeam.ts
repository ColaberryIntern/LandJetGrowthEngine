import '../config/environment';
import bcrypt from 'bcrypt';
import { getSequelize } from '../config/database';
import { initModels, User } from '../models';
import { SystemSetting } from '../models/SystemSetting';
import { getOutreachSettings } from '../services/outreachQueryService';
import {
  DEFAULT_SENDER_PROFILES,
  DEFAULT_SIGNATURE_TEMPLATE,
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
  role: 'admin' | 'manager' | 'account_manager';
  states: string[];
}

// Roles grant app permissions; AREA scope (states) is enforced separately and
// role-agnostically (see leadScope.ts), so Percy being admin still only sees TX.
// Grant is `manager` (NOT account_manager): the outreach send route requires
// `campaigns:write`, which account_manager lacks -- account_manager could read
// his leads but never SEND. `manager` has leads:read + campaigns:write, which
// is exactly what a sending rep needs (no admin/user-management powers).
const TEAM: SeedUser[] = [
  { email: 'rlandry@landjet.com', first_name: 'Ryan', last_name: 'Landry', role: 'admin', states: [] },
  { email: 'percy@landjet.com', first_name: 'Percy', last_name: 'Kapadia', role: 'admin', states: ['TX'] },
  { email: 'gnecker@landjet.com', first_name: 'Grant', last_name: 'Necker', role: 'manager', states: ['IA'] },
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
    if (existing.role !== seed.role) changes.push(`role ${existing.role}->${seed.role}`);
    const curStates = JSON.stringify((existing.default_filters as { states?: unknown })?.states ?? null);
    if (curStates !== JSON.stringify(seed.states)) changes.push(`states ${curStates}->${JSON.stringify(seed.states)}`);

    if (changes.length === 0) {
      console.log(`OK     ${seed.email}  (active, role ${seed.role}, states already ${JSON.stringify(seed.states)})`);
      continue;
    }
    console.log(`UPDATE ${seed.email}  ${changes.join(', ')}`);
    if (apply) {
      await existing.update({
        status: 'active',
        role: seed.role as any,
        default_filters: { ...(existing.default_filters as object), states: seed.states },
      });
    }
  }
}

/**
 * Seed the per-sender profiles.
 *
 * IMPORTANT: a person's existing signature cannot be auto-reused for everyone --
 * Ryan's stored signature embeds HIS personal mobile, HIS Calendly link, and
 * his spelled-out title ("Chief Executive Officer"). Tokenizing it for the team
 * would put Ryan's cell phone + booking link under Percy's and Grant's names.
 * So:
 *   - Ryan keeps his EXACT existing signature (it is his) via signature_override.
 *   - Percy + Grant use the clean shared branded template (their name, correct
 *     title, their own email, landjet.com) -- no leaked personal contact info.
 *     They can paste their own richer signature in Settings later.
 */
async function provisionSenders(apply: boolean): Promise<void> {
  console.log('=== Sender profiles =======================================');
  const settings = await getOutreachSettings();
  const ryanSig = (settings.email_signature || '').trim();
  const template = DEFAULT_SIGNATURE_TEMPLATE;

  const profiles: Record<string, SenderProfile> = {};
  for (const [k, v] of Object.entries(DEFAULT_SENDER_PROFILES)) profiles[k] = { ...v };

  if (ryanSig) {
    profiles['rlandry@landjet.com'].signature_override = ryanSig;
    console.log('Ryan keeps his exact existing signature (signature_override).');
  } else {
    console.log('No stored Ryan signature found; Ryan uses the shared template.');
  }
  console.log('Percy + Grant use the clean shared branded template (own name/title/email; no leaked personal data).');

  for (const p of Object.values(profiles)) {
    const sig = p.signature_override ? 'own signature' : 'shared template';
    console.log(`  ${p.email}  ->  ${p.name}, ${p.title}  area=${JSON.stringify(p.area)}  [${sig}]`);
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
