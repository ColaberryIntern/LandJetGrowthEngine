/**
 * pull-apollo-leads.js
 *
 * Pulls cold leads from Apollo's People Search API for 3 target markets,
 * enriches them with email via People Match API, and imports them into
 * the appropriate cold outreach campaigns on the production server.
 *
 * Markets: Iowa+Quad Cities, Dallas MSA, San Antonio MSA
 * Budget: ~300 credits (100 leads per market, 1 credit per enrichment)
 */

const APOLLO_API_KEY = '_c7nRFu5KRI30lii8_iwSQ';
const APOLLO_BASE = 'https://api.apollo.io';
const PROD_BASE = 'http://95.216.199.47:3011/api';
const PROD_EMAIL = 'admin@landjet.com';
const PROD_PASSWORD = 'Admin123!';

// Target titles
const TITLES = [
  'CEO', 'COO', 'VP Operations', 'President', 'Owner',
  'Executive Assistant', 'Travel Coordinator', 'Travel Manager',
  'Regional Director', 'Managing Director', 'Partner'
];

// Titles that also get smaller company sizes (10-250)
const SMALL_COMPANY_TITLES = ['Owner', 'President'];

// Industry keyword to campaign name mapping
const INDUSTRY_CAMPAIGN_MAP = {
  'manufacturing': 'Cold Outreach - Manufacturing',
  'industrial': 'Cold Outreach - Manufacturing',
  'automotive': 'Cold Outreach - Manufacturing',
  'machinery': 'Cold Outreach - Manufacturing',
  'chemicals': 'Cold Outreach - Manufacturing',
  'food production': 'Cold Outreach - Manufacturing',
  'textiles': 'Cold Outreach - Manufacturing',
  'insurance': 'Cold Outreach - Insurance',
  'banking': 'Cold Outreach - Banking & Finance',
  'financial': 'Cold Outreach - Banking & Finance',
  'finance': 'Cold Outreach - Banking & Finance',
  'investment': 'Cold Outreach - Banking & Finance',
  'accounting': 'Cold Outreach - Banking & Finance',
  'capital markets': 'Cold Outreach - Banking & Finance',
  'venture capital': 'Cold Outreach - Banking & Finance',
  'sports': 'Cold Outreach - Sports & Events',
  'events': 'Cold Outreach - Sports & Events',
  'entertainment': 'Cold Outreach - Sports & Events',
  'hospitality': 'Cold Outreach - Sports & Events',
  'legal': 'Cold Outreach - Legal',
  'law practice': 'Cold Outreach - Legal',
  'health': 'Cold Outreach - Healthcare',
  'hospital': 'Cold Outreach - Healthcare',
  'medical': 'Cold Outreach - Healthcare',
  'pharmaceut': 'Cold Outreach - Healthcare',
};

const DEFAULT_CAMPAIGN = 'Cold Outreach - Manufacturing'; // fallback

// Market definitions
const MARKETS = [
  {
    name: 'Iowa + Quad Cities',
    // Apollo uses person_locations for filtering
    search_params: {
      person_locations: [
        'Iowa, United States',
        'Rock Island County, Illinois, United States',
        'Henry County, Illinois, United States',
        'Mercer County, Illinois, United States',
      ],
    },
  },
  {
    name: 'Dallas MSA',
    search_params: {
      person_locations: [
        'Dallas, Texas, United States',
        'Fort Worth, Texas, United States',
        'Plano, Texas, United States',
        'Arlington, Texas, United States',
        'Irving, Texas, United States',
        'Frisco, Texas, United States',
        'McKinney, Texas, United States',
        'Denton, Texas, United States',
        'Richardson, Texas, United States',
        'Garland, Texas, United States',
        'Grand Prairie, Texas, United States',
        'Mesquite, Texas, United States',
        'Lewisville, Texas, United States',
        'Carrollton, Texas, United States',
        'Allen, Texas, United States',
        'Flower Mound, Texas, United States',
      ],
    },
  },
  {
    name: 'San Antonio MSA',
    search_params: {
      person_locations: [
        'San Antonio, Texas, United States',
        'New Braunfels, Texas, United States',
        'San Marcos, Texas, United States',
        'Seguin, Texas, United States',
        'Schertz, Texas, United States',
        'Cibolo, Texas, United States',
        'Boerne, Texas, United States',
        'Universal City, Texas, United States',
        'Live Oak, Texas, United States',
      ],
    },
  },
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
      return res;
    } catch (e) {
      if (i < retries - 1) {
        console.log(`  [RETRY] ${e.message}, attempt ${i + 2}/${retries}...`);
        await sleep(2000 * (i + 1));
      } else {
        throw e;
      }
    }
  }
}

async function loginToProduction() {
  const res = await fetch(`${PROD_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: PROD_EMAIL, password: PROD_PASSWORD }),
  });
  const data = await res.json();
  if (!data.token) throw new Error(`Login failed: ${JSON.stringify(data)}`);
  console.log('[PROD] Logged in successfully');
  return data.token;
}

async function getCampaigns(token) {
  const res = await fetch(`${PROD_BASE}/admin/campaigns?limit=50`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  const campaigns = data.campaigns || [];
  const coldCampaigns = campaigns.filter(c => c.type === 'cold_outbound');
  console.log(`[PROD] Found ${coldCampaigns.length} cold outbound campaigns:`);
  coldCampaigns.forEach(c => console.log(`  - ${c.name} (ID: ${c.id})`));
  return coldCampaigns;
}

async function getExistingLeadEmails(token) {
  // Pull existing leads to deduplicate
  const emails = new Set();
  let offset = 0;
  const limit = 100;
  while (true) {
    const res = await fetch(`${PROD_BASE}/admin/leads?limit=${limit}&offset=${offset}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    const leads = data.leads || [];
    if (leads.length === 0) break;
    leads.forEach(l => { if (l.email) emails.add(l.email.toLowerCase()); });
    offset += limit;
    if (offset >= (data.total || 0)) break;
  }
  console.log(`[PROD] Found ${emails.size} existing lead emails for dedup`);
  return emails;
}

function matchCampaign(person, campaigns) {
  const industry = (person.organization?.industry || '').toLowerCase();
  const orgKeywords = (person.organization?.keywords || []).join(' ').toLowerCase();
  const combined = `${industry} ${orgKeywords}`;

  for (const [keyword, campaignName] of Object.entries(INDUSTRY_CAMPAIGN_MAP)) {
    if (combined.includes(keyword)) {
      const match = campaigns.find(c => c.name === campaignName);
      if (match) return match;
    }
  }

  // Default fallback
  const fallback = campaigns.find(c => c.name === DEFAULT_CAMPAIGN);
  return fallback || campaigns[0];
}

async function searchApollo(market) {
  console.log(`\n[APOLLO] Searching: ${market.name}`);

  const body = {
    page: 1,
    per_page: 100,
    person_titles: TITLES,
    person_locations: market.search_params.person_locations,
    include_similar_titles: false,
    // 50-5000 employees
    organization_num_employees_ranges: ['51,1000', '1001,5000'],
  };

  const res = await fetchWithRetry(`${APOLLO_BASE}/api/v1/mixed_people/api_search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': APOLLO_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[APOLLO] Search failed (${res.status}): ${text.substring(0, 500)}`);
    return [];
  }

  const data = await res.json();
  let people = data.people || [];
  console.log(`[APOLLO] Found ${people.length} people (50-5000 emp) in ${market.name} (total available: ${data.pagination?.total_entries || '?'})`);

  // Second search for Owner/President at smaller companies (10-250)
  if (people.length < 100) {
    const remaining = 100 - people.length;
    const smallBody = {
      page: 1,
      per_page: remaining,
      person_titles: SMALL_COMPANY_TITLES,
      person_locations: market.search_params.person_locations,
      include_similar_titles: false,
      organization_num_employees_ranges: ['11,50'],
    };

    await sleep(500); // rate limit
    const smallRes = await fetchWithRetry(`${APOLLO_BASE}/api/v1/mixed_people/api_search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': APOLLO_API_KEY,
      },
      body: JSON.stringify(smallBody),
    });

    if (smallRes.ok) {
      const smallData = await smallRes.json();
      const smallPeople = smallData.people || [];
      console.log(`[APOLLO] Found ${smallPeople.length} Owner/President at smaller companies (10-250 emp)`);
      people = people.concat(smallPeople);
    } else {
      const text = await smallRes.text();
      console.error(`[APOLLO] Small company search failed (${smallRes.status}): ${text.substring(0, 300)}`);
    }
  }

  // Cap at 100 per market
  if (people.length > 100) {
    people = people.slice(0, 100);
  }

  console.log(`[APOLLO] Total for ${market.name}: ${people.length} leads`);
  return people;
}

async function enrichPerson(person) {
  // If we already have an email from search, skip enrichment to save credits
  if (person.email) {
    return person;
  }

  // Use Apollo person ID for enrichment (most reliable, 1 credit)
  const body = person.id ? { id: person.id } : {
    first_name: person.first_name,
    last_name: person.last_name,
    organization_name: person.organization?.name,
    linkedin_url: person.linkedin_url,
  };

  let res;
  try {
    res = await fetchWithRetry(`${APOLLO_BASE}/api/v1/people/match`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': APOLLO_API_KEY,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return person; // network failure after retries
  }

  if (!res.ok) {
    const text = await res.text();
    if (!enrichPerson._logged) {
      console.log(`  [DEBUG] Enrich API error (${res.status}): ${text.substring(0, 300)}`);
      enrichPerson._logged = true;
    }
    return person; // return without email
  }

  const data = await res.json();
  if (data.person) {
    // Merge enriched data back into person
    if (data.person.email) {
      person.email = data.person.email;
      person.enriched = true;
    }
    // Fill in obfuscated fields from search
    if (data.person.first_name) person.first_name = data.person.first_name;
    if (data.person.last_name) person.last_name = data.person.last_name;
    if (data.person.title) person.title = data.person.title;
    if (data.person.linkedin_url) person.linkedin_url = data.person.linkedin_url;
    if (data.person.city) person.city = data.person.city;
    if (data.person.state) person.state = data.person.state;
    if (data.person.country) person.country = data.person.country;
    if (data.person.phone_numbers) person.phone_numbers = data.person.phone_numbers;
    if (data.person.organization) {
      person.organization = { ...person.organization, ...data.person.organization };
    }
  }
  return person;
}

async function importLead(person, campaign, token, market) {
  const lead = {
    first_name: person.first_name || '',
    last_name: person.last_name || '',
    email: person.email,
    company: person.organization?.name || '',
    title: person.title || '',
    campaign_id: campaign.id,
    source: 'apollo_import',
    linkedin_url: person.linkedin_url || null,
    phone: person.phone_numbers?.[0]?.sanitized_number || person.organization?.phone || null,
    custom_fields: {
      apollo_id: person.id,
      market: market,
      industry: person.organization?.industry || '',
      company_size: person.organization?.estimated_num_employees || '',
      city: person.city || '',
      state: person.state || '',
      country: person.country || '',
      company_website: person.organization?.website_url || '',
      seniority: person.seniority || '',
    },
  };

  const res = await fetchWithRetry(`${PROD_BASE}/admin/leads`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(lead),
  });

  const data = await res.json();
  return data;
}

async function run() {
  console.log('=== Apollo Lead Pull & Import ===');
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Markets: ${MARKETS.map(m => m.name).join(', ')}`);
  console.log(`Max per market: 100 (300 total max)`);
  console.log('');

  // Step 1: Login to production
  const token = await loginToProduction();

  // Step 2: Get campaigns
  const campaigns = await getCampaigns(token);
  if (campaigns.length === 0) {
    console.error('ERROR: No cold outbound campaigns found. Run create-cold-campaigns.js first.');
    return;
  }

  // Step 3: Get existing lead emails for dedup
  const existingEmails = await getExistingLeadEmails(token);

  // Step 4: Search Apollo for each market
  const totals = { searched: 0, enriched: 0, imported: 0, skippedNoEmail: 0, skippedDupe: 0, errors: 0 };
  const campaignCounts = {};

  for (const market of MARKETS) {
    const people = await searchApollo(market);
    totals.searched += people.length;

    console.log(`\n[ENRICH] Enriching leads for ${market.name}...`);
    let enrichCount = 0;

    for (let i = 0; i < people.length; i++) {
      const person = people[i];

      // Enrich to get email and full details (search returns obfuscated data)
      // Only enrich if Apollo indicates they have an email (has_email flag)
      if (!person.email && person.has_email !== false) {
        await sleep(300); // rate limit Apollo
        const enriched = await enrichPerson(person);
        if (enriched.email) {
          enrichCount++;
          people[i] = enriched;
        }
      }

      // Skip if still no email
      if (!people[i].email) {
        totals.skippedNoEmail++;
        continue;
      }

      // Deduplicate
      const email = people[i].email.toLowerCase();
      if (existingEmails.has(email)) {
        totals.skippedDupe++;
        console.log(`  [SKIP] Duplicate: ${email}`);
        continue;
      }

      // Match to campaign
      const campaign = matchCampaign(people[i], campaigns);
      campaignCounts[campaign.name] = (campaignCounts[campaign.name] || 0) + 1;

      // Import
      try {
        const result = await importLead(people[i], campaign, token, market.name);
        if (result.lead) {
          totals.imported++;
          existingEmails.add(email); // prevent dupes within this run
          const name = `${people[i].first_name} ${people[i].last_name}`.trim();
          const company = people[i].organization?.name || '?';
          console.log(`  [${totals.imported}] ${name} @ ${company} (${people[i].title}) -> ${campaign.name}`);
        } else {
          totals.errors++;
          console.log(`  [ERR] ${people[i].email}: ${JSON.stringify(result).substring(0, 150)}`);
        }
      } catch (e) {
        totals.errors++;
        console.log(`  [ERR] ${people[i].email}: ${e.message}`);
      }
    }

    console.log(`[ENRICH] Enriched ${enrichCount} leads in ${market.name}`);
    totals.enriched += enrichCount;

    await sleep(1000); // pause between markets
  }

  // Summary
  console.log('\n========== SUMMARY ==========');
  console.log(`Leads found in Apollo:    ${totals.searched}`);
  console.log(`Enriched (credits used):  ${totals.enriched}`);
  console.log(`Imported to production:   ${totals.imported}`);
  console.log(`Skipped (no email):       ${totals.skippedNoEmail}`);
  console.log(`Skipped (duplicate):      ${totals.skippedDupe}`);
  console.log(`Errors:                   ${totals.errors}`);
  console.log('\nBy campaign:');
  for (const [name, count] of Object.entries(campaignCounts)) {
    console.log(`  ${name}: ${count}`);
  }
  console.log('==============================');
}

run().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
