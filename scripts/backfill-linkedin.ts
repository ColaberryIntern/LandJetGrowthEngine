import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { getSequelize } from '../src/config/database';
import { initModels } from '../src/models';
import { Lead } from '../src/models/Lead';

async function main() {
  console.log('=== Backfill LinkedIn URLs ===\n');

  const sequelize = getSequelize();
  await sequelize.authenticate();
  initModels(sequelize);

  const XLSX = await import('xlsx');
  const emailToLinkedIn: Record<string, string> = {};

  // Top 200
  const wb1 = XLSX.readFile(path.resolve(__dirname, '..', 'data/investor-targets/extracted/LandJet_Top200_Investor_Prospects - Michael A.xlsx'));
  const rows1: any[] = XLSX.utils.sheet_to_json(wb1.Sheets[wb1.SheetNames[0]]);
  for (const r of rows1) {
    const email = (r['Email'] || '').trim().toLowerCase();
    let li = (r['LinkedIn URL'] || '').trim();
    if (email && li) {
      if (!li.startsWith('http')) li = 'https://' + li;
      emailToLinkedIn[email] = li;
    }
  }
  console.log(`Top 200: ${Object.keys(emailToLinkedIn).length} URLs`);

  // Michael A
  const wb2 = XLSX.readFile(path.resolve(__dirname, '..', 'data/investor-targets/extracted/LandJet - Michael A.xlsx'));
  const rows2: any[] = XLSX.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]]);
  let added = 0;
  for (const r of rows2) {
    const email = (r['Email'] || '').trim().toLowerCase();
    let li = (r['linkedIn'] || '').trim();
    if (email && li && !emailToLinkedIn[email]) {
      if (!li.startsWith('http')) li = 'https://' + li;
      emailToLinkedIn[email] = li;
      added++;
    }
  }
  console.log(`Michael A: +${added} URLs`);

  // Capital Navigator
  const wb3 = XLSX.readFile(path.resolve(__dirname, '..', 'data/investor-targets/extracted/Capital Navigator - Structured Output - Land Jet_CONTACTS_UPDATED_v2.xlsx'));
  const rows3: any[] = XLSX.utils.sheet_to_json(wb3.Sheets['INVESTORS']);
  added = 0;
  for (const r of rows3) {
    const email = (r['Email'] || '').trim().toLowerCase();
    let li = (r['LinkedIn'] || '').trim();
    if (email && li && !emailToLinkedIn[email]) {
      if (!li.startsWith('http')) li = 'https://' + li;
      emailToLinkedIn[email] = li;
      added++;
    }
  }
  console.log(`Capital Nav: +${added} URLs`);

  console.log(`\nTotal mappings: ${Object.keys(emailToLinkedIn).length}`);
  console.log('Updating leads...\n');

  let updated = 0;
  for (const [email, linkedinUrl] of Object.entries(emailToLinkedIn)) {
    const [count] = await Lead.update(
      { linkedin_url: linkedinUrl },
      { where: { email, linkedin_url: null } },
    );
    if (count > 0) updated++;
  }

  const total = await Lead.count({ where: { linkedin_url: { [require('sequelize').Op.ne]: null } } });

  console.log('=== Results ===');
  console.log(`Updated: ${updated}`);
  console.log(`Total leads with LinkedIn: ${total}`);

  await sequelize.close();
  process.exit(0);
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });
