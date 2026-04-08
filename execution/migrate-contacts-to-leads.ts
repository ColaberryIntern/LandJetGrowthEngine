/**
 * Migrate contacts to leads table.
 * One-time script. Safe to rerun (skips existing emails).
 *
 * Usage: npx ts-node execution/migrate-contacts-to-leads.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { getSequelize } from '../src/config/database';
import { initModels } from '../src/models';
import { Contact } from '../src/models/Contact';
import { Lead } from '../src/models/Lead';
import { CampaignLead } from '../src/models/CampaignLead';

async function main() {
  console.log('=== Migrate Contacts to Leads ===\n');

  const sequelize = getSequelize();
  await sequelize.authenticate();
  initModels(sequelize);

  const contacts = await Contact.findAll({ order: [['created_at', 'ASC']] });
  console.log(`Contacts to migrate: ${contacts.length}\n`);

  let created = 0;
  let skipped = 0;
  let campaignLinked = 0;
  let errors = 0;

  for (const contact of contacts) {
    try {
      // Split name into first/last
      const nameParts = (contact.name || '').trim().split(/\s+/);
      const firstName = nameParts[0] || contact.email;
      const lastName = nameParts.slice(1).join(' ') || '';

      // Check if lead already exists with this email
      const existing = await Lead.findOne({ where: { email: contact.email } });

      let leadId: number;

      if (existing) {
        leadId = existing.id;
        // Update vertical/tier if not already set
        if (!existing.vertical && contact.vertical) {
          existing.vertical = contact.vertical;
          existing.tier = contact.tier;
          await existing.save();
        }
        skipped++;
      } else {
        const lead = await Lead.create({
          first_name: firstName,
          last_name: lastName,
          email: contact.email,
          phone: contact.phone,
          company: contact.company,
          title: null,
          industry: null,
          company_size: null,
          annual_revenue: null,
          linkedin_url: null,
          lead_source: 'past_client',
          lead_source_type: 'warm',
          temperature: 'warm',
          pipeline_stage: 'new_lead',
          lifecycle_stage: null,
          notes: null,
          technology_stack: null,
          utm_source: null,
          interest_area: null,
          vertical: contact.vertical,
          tier: contact.tier,
          status: 'active',
        });
        leadId = lead.id;
        created++;
      }

      // If contact was assigned to a campaign, create CampaignLead
      if (contact.campaign_id) {
        const existingLink = await CampaignLead.findOne({
          where: { campaign_id: contact.campaign_id, lead_id: leadId },
        });

        if (!existingLink) {
          await CampaignLead.create({
            campaign_id: contact.campaign_id,
            lead_id: leadId,
            status: contact.status === 'COMPLETED' ? 'completed' : 'active',
            lifecycle_status: 'active',
            enrolled_at: contact.created_at,
            current_step_index: contact.sequence_stage - 1,
            total_steps: 3,
            last_activity_at: contact.last_contacted_at,
            next_action_at: contact.next_action_at,
          } as any);
          campaignLinked++;
        }
      }
    } catch (err) {
      errors++;
      if (errors <= 5) {
        console.error(`  Error (${contact.email}): ${(err as Error).message}`);
      }
    }
  }

  console.log('=== Results ===');
  console.log(`Created:         ${created}`);
  console.log(`Skipped (exist): ${skipped}`);
  console.log(`Campaign linked: ${campaignLinked}`);
  console.log(`Errors:          ${errors}`);
  console.log(`Total:           ${contacts.length}`);

  await sequelize.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
