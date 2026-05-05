/**
 * Pull 50 leads each into the new Construction & Engineering and Technology & Staffing
 * cold outreach campaigns. Uses Apollo's industry filters + Ryan's target markets.
 */
require('dotenv').config();

const APOLLO_KEY = process.env.APOLLO_API_KEY || '_c7nRFu5KRI30lii8_iwSQ';
const BASE = 'http://95.216.199.47:3011/api';

const TARGETS = [
  {
    campaignName: 'Cold Outreach - Construction & Engineering',
    industries: ['construction', 'civil engineering', 'architecture & planning', 'mechanical or industrial engineering'],
    titles: ['CEO', 'COO', 'President', 'Owner', 'VP Operations', 'Project Director', 'Regional Manager', 'Travel Coordinator', 'Managing Director'],
    employeeRanges: ['50,1000'],
  },
  {
    campaignName: 'Cold Outreach - Technology & Staffing',
    industries: ['information technology and services', 'computer software', 'staffing and recruiting', 'human resources', 'management consulting'],
    titles: ['CEO', 'COO', 'President', 'Owner', 'VP Sales', 'Managing Director', 'Regional Director', 'Partner', 'Travel Coordinator'],
    employeeRanges: ['50,1000'],
  },
];

const MARKETS = [
  // Iowa + Quad Cities
  { name: 'Iowa', person_locations: ['Iowa, United States'], take: 17 },
  // Dallas MSA
  { name: 'Dallas', person_locations: ['Dallas, Texas, United States', 'Fort Worth, Texas, United States', 'Plano, Texas, United States', 'Frisco, Texas, United States', 'Arlington, Texas, United States', 'Irving, Texas, United States'], take: 17 },
  // San Antonio MSA
  { name: 'San Antonio', person_locations: ['San Antonio, Texas, United States', 'New Braunfels, Texas, United States'], take: 16 },
];

async function login() {
  const r = await fetch(BASE + '/auth/login', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({email:'admin@landjet.com', password:'Admin123!'})
  });
  return (await r.json()).token;
}

async function searchApollo(target, market, page = 1, perPage = 25) {
  const r = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
    method: 'POST',
    headers: {'Content-Type':'application/json', 'x-api-key': APOLLO_KEY},
    body: JSON.stringify({
      person_titles: target.titles,
      person_locations: market.person_locations,
      organization_industries: target.industries,
      organization_num_employees_ranges: target.employeeRanges,
      per_page: perPage,
      page,
    }),
  });
  const d = await r.json();
  return d.people || [];
}

async function enrichPerson(personId) {
  const r = await fetch('https://api.apollo.io/api/v1/people/match', {
    method: 'POST',
    headers: {'Content-Type':'application/json', 'x-api-key': APOLLO_KEY},
    body: JSON.stringify({ id: personId, reveal_personal_emails: false }),
  });
  const d = await r.json();
  return d.person || null;
}

async function getCampaign(token, name) {
  const r = await fetch(BASE + '/admin/campaigns?limit=25', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const d = await r.json();
  return d.campaigns.find(c => c.name === name);
}

async function getExistingEmails(token) {
  const set = new Set();
  let offset = 0;
  while (true) {
    const r = await fetch(BASE + `/admin/leads?limit=1000&offset=${offset}`, {
      headers: { Authorization: 'Bearer ' + token }
    });
    const d = await r.json();
    if (!d.leads || d.leads.length === 0) break;
    d.leads.forEach(l => { if (l.email) set.add(l.email.toLowerCase().trim()); });
    offset += d.leads.length;
    if (d.leads.length < 1000 || offset >= d.total) break;
  }
  return set;
}

async function createLead(token, lead) {
  const r = await fetch(BASE + '/admin/leads', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(lead),
  });
  return r.status === 201;
}

async function run() {
  const token = await login();
  console.log('Logged in. Fetching existing leads for dedupe...');
  const existing = await getExistingEmails(token);
  console.log('Existing leads:', existing.size);

  const stats = { searched: 0, enriched: 0, credits_used: 0, created: 0, dup: 0, errors: 0 };

  for (const target of TARGETS) {
    console.log('\n========================================');
    console.log('CAMPAIGN:', target.campaignName);
    console.log('========================================');
    const camp = await getCampaign(token, target.campaignName);
    if (!camp) { console.log('Campaign not found, skipping'); continue; }

    let totalForCampaign = 0;
    const TARGET_COUNT = 50;

    for (const market of MARKETS) {
      if (totalForCampaign >= TARGET_COUNT) break;
      console.log(`\n--- Market: ${market.name} (target ${market.take}) ---`);

      let page = 1;
      let collectedThisMarket = 0;
      const seenInThisMarket = new Set();

      while (collectedThisMarket < market.take && page <= 5) {
        const people = await searchApollo(target, market, page, 25);
        stats.searched += people.length;
        if (people.length === 0) { console.log('No more results at page', page); break; }

        for (const p of people) {
          if (collectedThisMarket >= market.take) break;
          if (totalForCampaign >= TARGET_COUNT) break;
          if (seenInThisMarket.has(p.id)) continue;
          seenInThisMarket.add(p.id);

          // Enrich for email
          const enriched = await enrichPerson(p.id);
          stats.enriched++;
          stats.credits_used++;

          const email = enriched?.email;
          if (!email || existing.has(email.toLowerCase().trim())) {
            stats.dup++;
            continue;
          }

          existing.add(email.toLowerCase().trim());

          const lead = {
            first_name: enriched.first_name || p.first_name || 'Unknown',
            last_name: enriched.last_name || (p.last_name_obfuscated || '').replace(/\*/g, '') || '',
            email: email,
            company: enriched.organization?.name || p.organization?.name || '',
            title: enriched.title || p.title || '',
            linkedin_url: enriched.linkedin_url || p.linkedin_url || null,
            industry: enriched.organization?.industry || p.organization?.industry || null,
            company_size: enriched.organization?.estimated_num_employees || p.organization?.estimated_num_employees || null,
            vertical: target.campaignName.includes('Construction') ? 'Construction' : 'Technology',
            lead_source: 'api',
            lead_source_type: 'cold',
            notes: { apollo_id: p.id, apollo_pulled_at: new Date().toISOString(), source: 'apollo' },
            campaign_id: camp.id,
            tier: 2,
          };

          const ok = await createLead(token, lead);
          if (ok) {
            stats.created++;
            totalForCampaign++;
            collectedThisMarket++;
            console.log(`  + ${lead.first_name} ${lead.last_name} | ${lead.title} | ${lead.company}`);
          } else {
            stats.errors++;
          }
        }
        page++;
      }
    }
    console.log(`\nTotal for ${target.campaignName}: ${totalForCampaign}`);
  }

  console.log('\n========================================');
  console.log('SUMMARY');
  console.log('========================================');
  console.log('Searched:', stats.searched);
  console.log('Enriched (credits used):', stats.credits_used);
  console.log('Created:', stats.created);
  console.log('Duplicates skipped:', stats.dup);
  console.log('Errors:', stats.errors);
}

run().catch(e => console.error('Error:', e.message));
