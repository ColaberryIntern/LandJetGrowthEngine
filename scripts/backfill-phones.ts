import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { getSequelize } from '../src/config/database';
import { initModels } from '../src/models';
import { Lead } from '../src/models/Lead';

async function main() {
  console.log('=== Backfill Phone Numbers ===\n');

  const sequelize = getSequelize();
  await sequelize.authenticate();
  initModels(sequelize);

  const XLSX = await import('xlsx');
  const emailToPhone: Record<string, string> = {};

  const files = ['Corporate.xlsx', 'Dallas.xlsx', 'KansasCity.xlsx', 'Austin.xlsx', 'Omaha.xlsx'];
  const base = path.resolve(__dirname, '..', 'data', 'ryan-attachments');

  for (const file of files) {
    const wb = XLSX.readFile(path.join(base, file));
    const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { range: 1 });
    for (const r of rows) {
      const email = (r.ClientEmail || '').toString().trim().toLowerCase();
      let phone = (r.ClientPhone || '').toString().trim();
      if (!email || !phone || phone === '0') continue;
      phone = phone.replace('.0', '');
      const digits = phone.replace(/[^0-9]/g, '');
      if (digits.length >= 10) {
        const normalized = digits.length === 10 ? '1' + digits : digits;
        emailToPhone[email] = normalized;
      }
    }
  }

  console.log(`Phone mappings found: ${Object.keys(emailToPhone).length}`);

  let updated = 0;
  for (const [email, phone] of Object.entries(emailToPhone)) {
    const [count] = await Lead.update(
      { phone },
      { where: { email, phone: null } },
    );
    if (count > 0) updated++;
  }

  const total = await Lead.count({ where: { phone: { [require('sequelize').Op.ne]: null } } });

  console.log(`\n=== Results ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Total leads with phone: ${total}`);

  // Breakdown by campaign
  const results = await sequelize.query(`
    SELECT
      CASE WHEN campaign_id IS NOT NULL THEN (SELECT name FROM campaigns WHERE id = campaign_id) ELSE 'Unassigned' END as campaign,
      COUNT(*) as total,
      COUNT(phone) FILTER (WHERE phone IS NOT NULL AND phone != '') as has_phone
    FROM leads GROUP BY campaign_id ORDER BY has_phone DESC
  `) as any;
  console.log('\nBy campaign:');
  for (const r of results[0]) {
    console.log(`  ${r.campaign}: ${r.has_phone}/${r.total}`);
  }

  await sequelize.close();
  process.exit(0);
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });
