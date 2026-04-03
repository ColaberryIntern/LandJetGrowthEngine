/**
 * Tag contacts as Tier 1 based on keyword matching in company name.
 *
 * Usage: npx ts-node execution/tag-tier1-contacts.ts
 *
 * Rules:
 *   - Only scans contacts where tier IS NULL (does not overwrite existing)
 *   - Only scans contacts where company IS NOT NULL
 *   - Processes in batches of 500 to avoid memory issues
 *   - First keyword match wins (deterministic)
 *   - Safe to rerun
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { getSequelize } from '../src/config/database';
import { initModels } from '../src/models';
import { Contact } from '../src/models/Contact';
import { Op } from 'sequelize';

const BATCH_SIZE = 500;

const VERTICAL_KEYWORDS: Record<string, string[]> = {
  MANUFACTURING: ['manufacturing', 'industrial', 'logistics', 'equipment'],
  INSURANCE: ['insurance', 'broker', 'risk', 'benefits'],
  HEALTHCARE: ['medical', 'health', 'clinic', 'cardiology', 'hospital'],
};

/**
 * Match company name against keyword lists.
 * Returns first matching vertical or null.
 */
function matchVertical(company: string): string | null {
  const lower = company.toLowerCase();
  for (const [vertical, keywords] of Object.entries(VERTICAL_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return vertical;
      }
    }
  }
  return null;
}

async function main() {
  console.log('=== Tag Tier 1 Contacts ===\n');

  const sequelize = getSequelize();
  await sequelize.authenticate();
  initModels(sequelize);

  let offset = 0;
  let totalScanned = 0;
  let totalUpdated = 0;
  const counts: Record<string, number> = {
    MANUFACTURING: 0,
    INSURANCE: 0,
    HEALTHCARE: 0,
  };

  while (true) {
    const batch = await Contact.findAll({
      where: {
        tier: { [Op.is]: null as any },
        company: { [Op.ne]: null },
      },
      limit: BATCH_SIZE,
      offset,
      order: [['created_at', 'ASC']],
    });

    if (batch.length === 0) break;

    for (const contact of batch) {
      totalScanned++;
      if (!contact.company) continue;

      const vertical = matchVertical(contact.company);
      if (vertical) {
        contact.tier = 1;
        contact.vertical = vertical;
        await contact.save();
        counts[vertical]++;
        totalUpdated++;
      }
    }

    offset += BATCH_SIZE;
  }

  console.log('=== Results ===');
  console.log(`Total scanned:  ${totalScanned}`);
  console.log(`Total updated:  ${totalUpdated}`);
  console.log('\nBreakdown by vertical:');
  console.log(`  MANUFACTURING: ${counts.MANUFACTURING}`);
  console.log(`  INSURANCE:     ${counts.INSURANCE}`);
  console.log(`  HEALTHCARE:    ${counts.HEALTHCARE}`);

  if (totalScanned === 0) {
    console.log('\nNo contacts to scan (all have tier set, or no company data).');
  }

  await sequelize.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
