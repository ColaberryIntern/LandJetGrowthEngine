require('dotenv').config();
const XLSX = require('xlsx');

const BASE = 'http://95.216.199.47:3011/api';
const CAMPAIGN_NAME = 'Investor Outreach';
const DATA_DIR = 'data/investor-targets/extracted/';

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@landjet.com', password: 'Admin123!' }),
  });
  const { token } = await res.json();
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function getCampaignId(headers) {
  const res = await fetch(`${BASE}/admin/campaigns?limit=50`, { headers });
  const data = await res.json();
  const campaign = data.campaigns.find(c => c.name === CAMPAIGN_NAME);
  if (!campaign) throw new Error(`Campaign "${CAMPAIGN_NAME}" not found`);
  return campaign.id;
}

async function fetchExistingEmails(headers) {
  console.log('Fetching existing leads for deduplication...');
  const emails = new Set();
  let offset = 0;
  const limit = 1000;
  let total = Infinity;

  while (offset < total) {
    const res = await fetch(`${BASE}/admin/leads?limit=${limit}&offset=${offset}`, { headers });
    const data = await res.json();
    total = data.total;
    for (const lead of data.leads) {
      if (lead.email) emails.add(lead.email.toLowerCase().trim());
    }
    offset += data.leads.length;
    process.stdout.write(`  Fetched ${offset}/${total} existing leads\r`);
    if (data.leads.length === 0) break;
  }
  console.log(`  Found ${emails.size} unique existing emails from ${total} leads`);
  return emails;
}

function readTop200() {
  const wb = XLSX.readFile(DATA_DIR + 'LandJet_Top200_Investor_Prospects - Michael A.xlsx');
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  console.log(`[File 1] Top200: ${rows.length} rows`);
  return rows.map(r => ({
    first_name: (r['First Name'] || '').toString().trim(),
    last_name: (r['Last Name'] || '').toString().trim(),
    email: (r['Email'] || '').toString().trim().toLowerCase(),
    company: (r['Company'] || '').toString().trim(),
    title: (r['Firm Type'] || '').toString().trim(),
    linkedin_url: r['LinkedIn URL'] ? r['LinkedIn URL'].toString().trim() : null,
    location: (r['Location'] || '').toString().trim(),
    custom_fields: {
      priority_rank: r['Priority Rank'],
      outreach_tier: r['Outreach Tier'] || '',
      firm_type: r['Firm Type'] || '',
      score: r['Score'],
      source_file: 'Top200',
    },
  }));
}

function readMichaelA() {
  const wb = XLSX.readFile(DATA_DIR + 'LandJet - Michael A.xlsx');
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  console.log(`[File 2] Michael A: ${rows.length} rows`);
  return rows.map(r => ({
    first_name: (r['First Name'] || '').toString().trim(),
    last_name: (r['Last Name'] || '').toString().trim(),
    email: (r['Email'] || '').toString().trim().toLowerCase(),
    company: (r['companyName'] || '').toString().trim(),
    title: '',
    linkedin_url: r['linkedIn'] ? r['linkedIn'].toString().trim() : null,
    location: (r['location'] || '').toString().trim(),
    custom_fields: {
      company_domain: r['companyDomain'] || '',
      source_file: 'MichaelA_858',
    },
  }));
}

function readTier1Playbook() {
  const wb = XLSX.readFile(DATA_DIR + 'LandJet_Tier1_Outreach_Playbook (1).xlsx');
  const sheet = wb.Sheets['Outreach Dashboard'];
  if (!sheet) { console.log('[File 3] Tier1 Playbook: Outreach Dashboard sheet not found'); return []; }
  const rows = XLSX.utils.sheet_to_json(sheet);
  console.log(`[File 3] Tier1 Playbook: ${rows.length} rows`);
  return rows.map(r => {
    const contact = (r['Contact'] || '').toString().trim();
    const parts = contact.split(/\s+/);
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ') || '';
    return {
      first_name: firstName,
      last_name: lastName,
      email: (r['Email'] || '').toString().trim().toLowerCase(),
      company: (r['Firm'] || '').toString().trim(),
      title: (r['Title'] || '').toString().trim(),
      linkedin_url: null,
      location: (r['HQ'] || '').toString().trim(),
      custom_fields: {
        investor_type: r['Investor Type'] || '',
        fit_score: r['Fit Score'],
        primary_hooks: r['Primary Hooks'] || '',
        email_subject_line: r['Email Subject Line'] || '',
        source_file: 'Tier1_Playbook',
      },
    };
  });
}

function isValidEmail(email) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function run() {
  const headers = await login();
  console.log('Logged in successfully\n');

  const campaignId = await getCampaignId(headers);
  console.log(`Campaign: ${CAMPAIGN_NAME} (${campaignId})\n`);

  // Fetch existing emails for dedup
  const existingEmails = await fetchExistingEmails(headers);
  console.log('');

  // Read all 3 files
  const top200 = readTop200();
  const michaelA = readMichaelA();
  const tier1 = readTier1Playbook();
  console.log('');

  // Merge and deduplicate by email
  const allContacts = [...top200, ...michaelA, ...tier1];
  console.log(`Total rows across all files: ${allContacts.length}`);

  const seen = new Set();
  const unique = [];
  let noEmail = 0;
  let invalidEmail = 0;
  let crossFileDups = 0;

  for (const contact of allContacts) {
    if (!contact.email) { noEmail++; continue; }
    if (!isValidEmail(contact.email)) { invalidEmail++; continue; }
    const key = contact.email.toLowerCase();
    if (seen.has(key)) { crossFileDups++; continue; }
    seen.add(key);
    unique.push(contact);
  }

  console.log(`Unique contacts with valid email: ${unique.length}`);
  console.log(`  Skipped - no email: ${noEmail}`);
  console.log(`  Skipped - invalid email: ${invalidEmail}`);
  console.log(`  Skipped - cross-file duplicates: ${crossFileDups}`);

  // Filter against existing leads
  const toImport = unique.filter(c => !existingEmails.has(c.email));
  const existingDups = unique.length - toImport.length;
  console.log(`  Skipped - already in system: ${existingDups}`);
  console.log(`\nWill import: ${toImport.length} new leads\n`);

  if (toImport.length === 0) {
    console.log('Nothing to import. All contacts already exist in the system.');
    return;
  }

  // Import leads
  let created = 0;
  let errors = 0;
  const errorDetails = [];

  for (let i = 0; i < toImport.length; i++) {
    const contact = toImport[i];
    const lead = {
      first_name: contact.first_name || 'Unknown',
      last_name: contact.last_name || '',
      email: contact.email,
      company: contact.company || null,
      title: contact.title || null,
      linkedin_url: contact.linkedin_url || null,
      campaign_id: campaignId,
      lead_source: 'import',
      vertical: 'Investor',
      custom_fields: contact.custom_fields || {},
    };

    try {
      const res = await fetch(`${BASE}/admin/leads`, {
        method: 'POST',
        headers,
        body: JSON.stringify(lead),
      });
      const data = await res.json();
      if (res.status === 201 && data.lead) {
        created++;
        if (created % 50 === 0 || created <= 5 || i === toImport.length - 1) {
          console.log(`  [${created}/${toImport.length}] ${contact.first_name} ${contact.last_name} @ ${contact.company || 'N/A'} <${contact.email}>`);
        }
      } else {
        errors++;
        const errMsg = data.error || JSON.stringify(data).substring(0, 150);
        errorDetails.push({ email: contact.email, error: errMsg });
        if (errors <= 10) console.log(`  ERROR: ${contact.email} - ${errMsg}`);
      }
    } catch (e) {
      errors++;
      errorDetails.push({ email: contact.email, error: e.message });
      if (errors <= 10) console.log(`  ERROR: ${contact.email} - ${e.message}`);
    }
  }

  // Final report
  console.log('\n=== IMPORT COMPLETE ===');
  console.log(`Files processed: 3`);
  console.log(`  - Top200: ${top200.length} rows`);
  console.log(`  - Michael A: ${michaelA.length} rows`);
  console.log(`  - Tier1 Playbook: ${tier1.length} rows`);
  console.log(`Total rows: ${allContacts.length}`);
  console.log(`\nDedup summary:`);
  console.log(`  No email: ${noEmail}`);
  console.log(`  Invalid email: ${invalidEmail}`);
  console.log(`  Cross-file duplicates: ${crossFileDups}`);
  console.log(`  Already in system: ${existingDups}`);
  console.log(`\nImport results:`);
  console.log(`  Created: ${created}`);
  console.log(`  Errors: ${errors}`);
  if (errorDetails.length > 0 && errorDetails.length <= 20) {
    console.log(`\nError details:`);
    errorDetails.forEach(e => console.log(`  - ${e.email}: ${e.error}`));
  } else if (errorDetails.length > 20) {
    console.log(`\nFirst 20 errors:`);
    errorDetails.slice(0, 20).forEach(e => console.log(`  - ${e.email}: ${e.error}`));
  }
}

run().catch(e => console.error('Fatal error:', e.message));
