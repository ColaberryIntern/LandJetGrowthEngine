import '../config/environment';
import bcrypt from 'bcrypt';
import { getSequelize } from '../config/database';
import { initModels, User } from '../models';

/**
 * createPercyDemoUser.ts
 * One-off demo helper: stand up a temporary login that mirrors Percy's EXACT
 * role + state scope so Ali can show "what Percy will see" without touching
 * Percy's real account or password.
 *
 *   npx tsx src/scripts/createPercyDemoUser.ts            -> create / reset the demo login
 *   CLEANUP=1 npx tsx src/scripts/createPercyDemoUser.ts  -> remove the demo login
 *
 * Idempotent. Reads Percy's live role + default_filters and copies them onto
 * the demo account, falling back to account_manager + TX-only if Percy is not
 * found.
 */
const DEMO_EMAIL = 'tx-demo@landjet.com';
const DEMO_PASSWORD = 'TexasDemo2026!';
const PERCY_EMAIL = 'pkapadia@landjet.com';

async function main() {
  const sequelize = getSequelize();
  initModels(sequelize);

  if (process.env.CLEANUP === '1') {
    const n = await User.destroy({ where: { email: DEMO_EMAIL } });
    console.log(n ? `Removed demo login ${DEMO_EMAIL}` : `No demo login ${DEMO_EMAIL} to remove`);
    await sequelize.close();
    return;
  }

  const percy = await User.findOne({ where: { email: PERCY_EMAIL } });
  const role = (percy?.role as string) || 'account_manager';
  const default_filters =
    (percy?.default_filters && Object.keys(percy.default_filters as object).length)
      ? (percy.default_filters as Record<string, unknown>)
      : { states: ['TX'] };

  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const existing = await User.findOne({ where: { email: DEMO_EMAIL } });

  if (existing) {
    await existing.update({ password_hash: hash, role: role as any, status: 'active', default_filters });
    console.log('Demo login RESET.');
  } else {
    await User.create({
      email: DEMO_EMAIL,
      password_hash: hash,
      first_name: 'Texas',
      last_name: 'Demo',
      role: role as any,
      status: 'active',
      default_filters,
    });
    console.log('Demo login CREATED.');
  }

  console.log('---------------------------------------------');
  console.log(`  URL:      https://growth.landjet.com/login`);
  console.log(`  Email:    ${DEMO_EMAIL}`);
  console.log(`  Password: ${DEMO_PASSWORD}`);
  console.log(`  Mirrors:  role=${role}, filters=${JSON.stringify(default_filters)} (copied from Percy${percy ? '' : ' DEFAULTS - Percy not found'})`);
  console.log('---------------------------------------------');
  await sequelize.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
