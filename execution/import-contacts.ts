/**
 * Import contacts from CSV into the contacts table.
 *
 * Usage: npx ts-node execution/import-contacts.ts
 *
 * Reads: data/ryan-attachments/all contacts 3-26-26.csv
 * Deduplicates by email. Safe to rerun (idempotent).
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { getSequelize } from '../src/config/database';
import { initModels } from '../src/models';
import { Contact } from '../src/models/Contact';

const CSV_PATH = path.resolve(__dirname, '..', 'data', 'ryan-attachments', 'all contacts 3-26-26.csv');

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

async function main() {
  console.log('=== Contact Import ===\n');

  // Initialize DB
  const sequelize = getSequelize();
  await sequelize.authenticate();
  initModels(sequelize);
  console.log('Database connected.\n');

  // Read CSV
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found: ${CSV_PATH}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = raw.split('\n').filter(line => line.trim().length > 0);

  if (lines.length < 2) {
    console.error('CSV has no data rows.');
    process.exit(1);
  }

  // Parse header
  const headers = parseCsvLine(lines[0]);
  const emailIdx = headers.indexOf('EMAIL');
  const firstNameIdx = headers.indexOf('FIRST_NAME');
  const lastNameIdx = headers.indexOf('LAST_NAME');
  const phoneIdx = headers.indexOf('PHONE_NUMBER');

  if (emailIdx === -1) {
    console.error('EMAIL column not found in CSV.');
    process.exit(1);
  }

  console.log(`CSV loaded: ${lines.length - 1} data rows.\n`);

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const email = (fields[emailIdx] || '').trim().toLowerCase();

    if (!email || !email.includes('@')) {
      skipped++;
      continue;
    }

    const firstName = (fields[firstNameIdx] || '').trim();
    const lastName = (fields[lastNameIdx] || '').trim();
    const name = [firstName, lastName].filter(Boolean).join(' ') || email;
    const phone = (fields[phoneIdx] || '').trim() || null;

    try {
      const [, created] = await Contact.findOrCreate({
        where: { email },
        defaults: {
          name,
          email,
          phone,
          company: null,
          last_contacted_at: null,
          next_action_at: null,
        },
      });

      if (created) {
        inserted++;
      } else {
        skipped++;
      }
    } catch (err) {
      errors++;
      if (errors <= 5) {
        console.error(`  Row ${i} error (${email}): ${(err as Error).message}`);
      }
    }
  }

  console.log('=== Results ===');
  console.log(`Inserted: ${inserted}`);
  console.log(`Skipped:  ${skipped}`);
  console.log(`Errors:   ${errors}`);
  console.log(`Total:    ${lines.length - 1}`);

  await sequelize.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Import failed:', err.message);
  process.exit(1);
});
