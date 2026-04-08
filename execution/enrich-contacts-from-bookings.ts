/**
 * Enrich contacts with company data from booking XLSX files.
 *
 * Usage: npx ts-node execution/enrich-contacts-from-bookings.ts
 *
 * Cross-references ClientEmail + CompanyName from booking data
 * against the contacts table. Updates company field where matched.
 * Then runs tier 1 keyword tagging on enriched contacts.
 *
 * Deterministic. Safe to rerun.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { getSequelize } from '../src/config/database';
import { initModels } from '../src/models';
import { Contact } from '../src/models/Contact';

const XLSX_DIR = path.resolve(__dirname, '..', 'data', 'ryan-attachments');
const XLSX_FILES = ['Corporate.xlsx', 'Dallas.xlsx', 'KansasCity.xlsx', 'Austin.xlsx', 'Omaha.xlsx'];

const VERTICAL_KEYWORDS: Record<string, string[]> = {
  MANUFACTURING: ['manufacturing', 'industrial', 'logistics', 'equipment', 'deere', 'caterpillar', 'arconic', 'positioner', 'van meter', 'findorff', 'bush construction', 'russell construction'],
  INSURANCE: ['insurance', 'broker', 'risk', 'benefits', 'lockton', 'marsh', 'aon', 'gallagher', 'acrisure'],
  HEALTHCARE: ['medical', 'health', 'clinic', 'cardiology', 'hospital', 'mid-america cardiology', 'ku medical'],
  SPORTS_EVENTS: ['bears', 'basketball', 'big ten', 'formula 1', 'wolves', 'wwe', 'athletic'],
  TECHNOLOGY: ['tech', 'software', 'fetch rewards', 'commlink', 'ecco select', 'aisle rocket'],
  BANKING: ['bank', 'financial', 'qcr holdings', 'renaissance financial', 'wealth management', 'mcgill junge'],
  LEGAL: ['law firm', 'weinhardt', 'polsinelli', 'jones day', 'attorney'],
  CONSTRUCTION: ['construction', 'engineering', 'findorff', 'russell construction', 'bush construction'],
};

const TIER_MAP: Record<string, number> = {
  MANUFACTURING: 1,
  INSURANCE: 1,
  HEALTHCARE: 1,
  SPORTS_EVENTS: 2,
  TECHNOLOGY: 2,
  BANKING: 2,
  LEGAL: 2,
  CONSTRUCTION: 3,
};

function matchVertical(company: string): { vertical: string; tier: number } | null {
  const lower = company.toLowerCase();
  for (const [vertical, keywords] of Object.entries(VERTICAL_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return { vertical, tier: TIER_MAP[vertical] };
      }
    }
  }
  return null;
}

async function loadBookingCompanies(): Promise<Map<string, string>> {
  // Dynamic import to avoid adding dependency to tsconfig
  const XLSX = await import('xlsx');
  const emailToCompany = new Map<string, string>();

  for (const file of XLSX_FILES) {
    const filePath = path.join(XLSX_DIR, file);
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { range: 1 });

    for (const row of rows) {
      const email = (row.ClientEmail || '').toString().trim().toLowerCase();
      const company = (row.CompanyName || '').toString().trim();
      if (email && company && email.includes('@')) {
        emailToCompany.set(email, company);
      }
    }
  }

  return emailToCompany;
}

async function main() {
  console.log('=== Enrich Contacts from Booking Data ===\n');

  const sequelize = getSequelize();
  await sequelize.authenticate();
  initModels(sequelize);

  // Load company mappings from XLSX
  console.log('Loading booking data...');
  const emailToCompany = await loadBookingCompanies();
  console.log(`Found ${emailToCompany.size} unique email-to-company mappings.\n`);

  // Get all contacts
  const contacts = await Contact.findAll();
  console.log(`Total contacts in DB: ${contacts.length}\n`);

  let companyUpdated = 0;
  let verticalUpdated = 0;
  const verticalCounts: Record<string, number> = {};

  for (const contact of contacts) {
    const company = emailToCompany.get(contact.email.toLowerCase());
    let changed = false;

    // Update company if we have data and contact doesn't have one
    if (company && !contact.company) {
      contact.company = company;
      changed = true;
      companyUpdated++;
    }

    // Tag vertical/tier based on company name (use existing or newly set)
    const companyName = contact.company;
    if (companyName && contact.tier === null) {
      const match = matchVertical(companyName);
      if (match) {
        contact.vertical = match.vertical;
        contact.tier = match.tier;
        verticalCounts[match.vertical] = (verticalCounts[match.vertical] || 0) + 1;
        verticalUpdated++;
        changed = true;
      }
    }

    if (changed) {
      await contact.save();
    }
  }

  console.log('=== Results ===');
  console.log(`Company enriched:   ${companyUpdated}`);
  console.log(`Vertical/tier set:  ${verticalUpdated}`);
  console.log('\nBreakdown by vertical:');
  for (const [vertical, count] of Object.entries(verticalCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${vertical}: ${count}`);
  }

  await sequelize.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
