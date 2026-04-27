/**
 * Enriches existing cold outreach leads with multi-location data from Apollo.
 * Stores results in Lead.notes JSONB field. Costs 1 Apollo credit per company.
 *
 * Usage: node scripts/enrich-leads-locations.js [--limit N] [--campaign-id ID]
 */
require('dotenv').config();

const APOLLO_KEY = process.env.APOLLO_API_KEY || '_c7nRFu5KRI30lii8_iwSQ';
const BASE = 'http://95.216.199.47:3011/api';

async function login() {
  const r = await fetch(BASE + '/auth/login', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({email:'admin@landjet.com', password:'Admin123!'})
  });
  return (await r.json()).token;
}

async function enrichOrg(domain) {
  if (!domain) return null;
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  try {
    const r = await fetch('https://api.apollo.io/api/v1/organizations/enrich', {
      method: 'POST',
      headers: {'Content-Type':'application/json', 'x-api-key': APOLLO_KEY},
      body: JSON.stringify({ domain: cleanDomain }),
    });
    const d = await r.json();
    return d.organization || null;
  } catch { return null; }
}

async function getCampaign(token, name) {
  const r = await fetch(BASE + '/admin/campaigns?limit=25', {
    headers: {Authorization: 'Bearer ' + token}
  });
  const d = await r.json();
  return d.campaigns.find(c => c.name === name);
}

async function getLeadsForCampaign(token, campaignId, limit) {
  // Fetch all leads then filter by campaign_id (server filter not working reliably)
  const all = [];
  let offset = 0;
  while (offset < 10000) {
    const r = await fetch(BASE + `/admin/leads?limit=500&offset=${offset}`, {
      headers: {Authorization: 'Bearer ' + token}
    });
    const d = await r.json();
    if (!d.leads || d.leads.length === 0) break;
    all.push(...d.leads.filter(l => l.campaign_id === campaignId));
    offset += d.leads.length;
    if (d.leads.length < 500) break;
    if (all.length >= limit) break;
  }
  return all.slice(0, limit);
}

async function updateLead(token, leadId, updates) {
  const r = await fetch(BASE + `/admin/leads/${leadId}`, {
    method: 'PATCH',
    headers: {Authorization: 'Bearer ' + token, 'Content-Type':'application/json'},
    body: JSON.stringify(updates),
  });
  return r.status < 400;
}

function extractDomain(email) {
  if (!email || !email.includes('@')) return null;
  return email.split('@')[1];
}

async function run() {
  const args = process.argv.slice(2);
  const limit = parseInt(args[args.indexOf('--limit') + 1]) || 9999;

  const token = await login();
  console.log('Logged in. Enriching cold outreach leads...\n');

  const coldCampaigns = [
    'Cold Outreach - Manufacturing',
    'Cold Outreach - Insurance',
    'Cold Outreach - Banking & Finance',
    'Cold Outreach - Sports & Events',
    'Cold Outreach - Legal',
    'Cold Outreach - Healthcare',
  ];

  let totalEnriched = 0;
  let totalSkipped = 0;
  let creditsUsed = 0;
  const seenDomains = new Map();

  for (const campName of coldCampaigns) {
    const camp = await getCampaign(token, campName);
    if (!camp) { console.log(`Campaign not found: ${campName}`); continue; }

    const leads = await getLeadsForCampaign(token, camp.id, limit);
    console.log(`${campName}: ${leads.length} leads`);

    for (const lead of leads) {
      const domain = extractDomain(lead.email);
      if (!domain) { totalSkipped++; continue; }

      const existingNotes = lead.notes || {};
      if (existingNotes.num_suborganizations !== undefined) {
        // Already enriched
        totalSkipped++;
        continue;
      }

      let org = seenDomains.get(domain);
      if (!org) {
        org = await enrichOrg(domain);
        seenDomains.set(domain, org);
        if (org) creditsUsed++;
      }

      if (!org) { totalSkipped++; continue; }

      const newNotes = {
        ...existingNotes,
        num_suborganizations: org.num_suborganizations || 0,
        retail_location_count: org.retail_location_count || 0,
        company_industry: org.industry || null,
        company_revenue: org.annual_revenue || null,
        enriched_at: new Date().toISOString(),
      };

      const ok = await updateLead(token, lead.id, {
        notes: newNotes,
        company_size: lead.company_size || org.estimated_num_employees || null,
        annual_revenue: lead.annual_revenue || org.annual_revenue || null,
      });

      if (ok) {
        totalEnriched++;
        const tag = (org.num_suborganizations >= 3 || org.retail_location_count >= 5) ? '★ MULTI-LOC' : '';
        if (tag) console.log(`  ${tag} ${lead.first_name} ${lead.last_name} @ ${lead.company} (${org.num_suborganizations} sub-orgs, ${org.retail_location_count} retail)`);
      }
    }
  }

  console.log('\n=== DONE ===');
  console.log(`Enriched: ${totalEnriched}`);
  console.log(`Skipped: ${totalSkipped}`);
  console.log(`Apollo credits used: ${creditsUsed}`);
  console.log(`Unique domains looked up: ${seenDomains.size}`);
}

run().catch(e => console.error('Error:', e.message));
