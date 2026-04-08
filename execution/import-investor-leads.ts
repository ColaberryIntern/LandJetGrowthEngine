/**
 * Import investor targets from downloaded XLSX files into the Investor Outreach campaign.
 *
 * Sources:
 * 1. Top 200 Investor Prospects (prioritized, scored)
 * 2. Capital Navigator Contacts (999 investors with check sizes)
 * 3. Michael A. contact list (858 contacts)
 *
 * Deduplicates by email. Assigns all to the Investor Outreach campaign.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { getSequelize } from '../src/config/database';
import { initModels } from '../src/models';
import { Lead } from '../src/models/Lead';

const INVESTOR_CAMPAIGN_ID = '6c18c01a-5d54-4946-aa83-2c92aeabe758';
const DATA_DIR = path.resolve(__dirname, '..', 'data', 'investor-targets', 'extracted');

async function main() {
  console.log('=== Import Investor Leads ===\n');

  const sequelize = getSequelize();
  await sequelize.authenticate();
  initModels(sequelize);

  const XLSX = await import('xlsx');

  let created = 0;
  let skipped = 0;
  let errors = 0;
  const seen = new Set<string>();

  async function importRow(email: string, firstName: string, lastName: string, company: string | null, title: string | null) {
    email = (email || '').trim().toLowerCase();
    if (!email || !email.includes('@') || seen.has(email)) {
      skipped++;
      return;
    }
    seen.add(email);

    try {
      const existing = await Lead.findOne({ where: { email } });
      if (existing) {
        // Update campaign assignment if not already assigned
        if (!existing.campaign_id) {
          existing.campaign_id = INVESTOR_CAMPAIGN_ID;
          existing.vertical = 'INVESTOR';
          existing.tier = 1;
          await existing.save();
          created++;
        } else {
          skipped++;
        }
        return;
      }

      await Lead.create({
        first_name: firstName || email.split('@')[0],
        last_name: lastName || '',
        email,
        phone: null,
        company: company || null,
        title: title || null,
        industry: 'Investment',
        company_size: null,
        annual_revenue: null,
        linkedin_url: null,
        lead_source: 'investor_database',
        lead_source_type: 'cold',
        temperature: 'cold',
        pipeline_stage: 'new_lead',
        lifecycle_stage: null,
        notes: null,
        technology_stack: null,
        utm_source: null,
        interest_area: 'investment',
        vertical: 'INVESTOR',
        tier: 1,
        campaign_id: INVESTOR_CAMPAIGN_ID,
        outreach_status: 'ACTIVE',
        status: 'active',
      });
      created++;
    } catch (err) {
      errors++;
      if (errors <= 3) console.error(`  Error (${email}): ${(err as Error).message}`);
    }
  }

  // Source 1: Top 200 Investor Prospects
  console.log('Importing Top 200 Investor Prospects...');
  const wb1 = XLSX.readFile(path.join(DATA_DIR, 'LandJet_Top200_Investor_Prospects - Michael A.xlsx'));
  const rows1: any[] = XLSX.utils.sheet_to_json(wb1.Sheets[wb1.SheetNames[0]]);
  for (const r of rows1) {
    await importRow(r['Email'], r['First Name'], r['Last Name'], r['Company'], r['Job Title']);
  }
  console.log(`  After Top 200: ${created} created, ${skipped} skipped\n`);

  // Source 2: Capital Navigator Contacts
  console.log('Importing Capital Navigator Contacts...');
  const wb2 = XLSX.readFile(path.join(DATA_DIR, 'Capital Navigator - Structured Output - Land Jet_CONTACTS_UPDATED_v2.xlsx'));
  const rows2: any[] = XLSX.utils.sheet_to_json(wb2.Sheets['INVESTORS']);
  for (const r of rows2) {
    const contactName = (r['Contact Name'] || '').toString().trim();
    if (contactName === 'General Inquiries' || contactName === 'N/A' || !contactName) continue;
    const nameParts = contactName.split(/\s+/);
    await importRow(r['Email'], nameParts[0], nameParts.slice(1).join(' '), r['Investor'], null);
  }
  console.log(`  After Capital Navigator: ${created} created, ${skipped} skipped\n`);

  // Source 3: Michael A. contact list
  console.log('Importing Michael A. Contacts...');
  const wb3 = XLSX.readFile(path.join(DATA_DIR, 'LandJet - Michael A.xlsx'));
  const rows3: any[] = XLSX.utils.sheet_to_json(wb3.Sheets[wb3.SheetNames[0]]);
  for (const r of rows3) {
    await importRow(r['Email'], r['First Name'], r['Last Name'], r['companyName'], null);
  }
  console.log(`  After Michael A.: ${created} created, ${skipped} skipped\n`);

  // Source 4: Tier 1 Outreach Playbook (103 investors with pre-written emails)
  console.log('Importing Tier 1 Playbook Contacts...');
  const wb4 = XLSX.readFile(path.join(DATA_DIR, 'LandJet_Tier1_Outreach_Playbook (1).xlsx'));
  const rows4: any[] = XLSX.utils.sheet_to_json(wb4.Sheets['Outreach Dashboard']);
  for (const r of rows4) {
    const contactName = (r['Contact'] || '').toString().trim();
    const nameParts = contactName.split(/\s+/);
    await importRow(r['Email'], nameParts[0], nameParts.slice(1).join(' '), r['Firm'], r['Title']);
  }
  console.log(`  After Playbook: ${created} created, ${skipped} skipped\n`);

  console.log('=== Results ===');
  console.log(`Created:  ${created}`);
  console.log(`Skipped:  ${skipped}`);
  console.log(`Errors:   ${errors}`);
  console.log(`Total unique emails processed: ${seen.size}`);

  await sequelize.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Import failed:', err.message);
  process.exit(1);
});
