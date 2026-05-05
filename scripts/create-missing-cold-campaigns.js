/**
 * Creates the missing Cold Outreach campaigns for Construction & Engineering and Technology & Staffing.
 * Mirrors the existing past-customer campaign structure but tailored for first-contact prospects.
 */
require('dotenv').config();

const BASE = 'http://95.216.199.47:3011/api';

async function login() {
  const r = await fetch(BASE + '/auth/login', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({email:'admin@landjet.com', password:'Admin123!'})
  });
  return (await r.json()).token;
}

async function main() {
  const token = await login();
  const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  const campaigns = [
    {
      name: 'Cold Outreach - Construction & Engineering',
      type: 'cold_outbound',
      ai_system_prompt: 'You are writing a personalized cold outreach email from {{sender_name}}, {{sender_role}}, to {{first_name}} at {{company}}, a construction or engineering firm. {{company}} likely has crews, project managers, and executives traveling to job sites, client meetings, and facility inspections across multiple locations. Pitch LandJet as a premium ground transportation service that turns travel time into productive work time with mobile boardrooms (high-speed WiFi, conference setups, privacy). Reference {{pain_point}} as the productivity issue. Highlight {{positioning}}. Mention proof: {{proof_customer}} and {{similar_companies}}. Keep under 120 words. Be founder-direct, not salesy.',
      settings: {
        sender_name: 'Ryan Landry',
        sender_role: 'CEO, LandJet',
        sender_email: 'rlandry@landjet.com',
        priority: 60,
        ai_drafts_enabled: true,
        follow_up_delay_days: 4,
        variables: {
          pain_point: 'project teams losing productive hours commuting between job sites and client meetings',
          positioning: 'a premium mobile boardroom service that converts drive time into billable, productive work time',
          proof_revenue: '$492K from a single manufacturer',
          target_titles: 'CEO, COO, VP Operations, Project Director, Regional Manager, Travel Coordinator',
          vertical_name: 'Construction & Engineering',
          proof_customer: 'John Deere',
          target_profile: 'Construction and engineering firms with multi-site operations and traveling project teams',
          similar_companies: 'Fortune 500 manufacturers and large engineering firms with distributed teams',
        },
      },
      channel_config: { email: { daily_limit: 8 } },
      sequence_steps: [
        { step: 1, delay_days: 0, channel: 'email', prompt: 'Initial cold outreach to {{first_name}} at {{company}}. Open with a specific observation about construction/engineering teams traveling between job sites. Pitch the mobile boardroom angle with {{pain_point}}. Reference {{proof_customer}} success. Ask one direct question about their team\'s travel patterns. Sign off as {{sender_first_name}}.' },
        { step: 2, delay_days: 4, channel: 'email', prompt: 'Follow-up to {{first_name}}. Reference the previous email. Mention {{similar_companies}} and the {{proof_revenue}} they generated. Suggest a 15-min call. Under 80 words. Sign off as {{sender_first_name}}.' },
        { step: 3, delay_days: 7, channel: 'email', prompt: 'Final brief touch to {{first_name}}. Two to three sentences. Acknowledge they are busy. Leave the door open. Sign off as {{sender_first_name}}.' },
      ],
    },
    {
      name: 'Cold Outreach - Technology & Staffing',
      type: 'cold_outbound',
      ai_system_prompt: 'You are writing a personalized cold outreach email from {{sender_name}}, {{sender_role}}, to {{first_name}} at {{company}}, a technology or staffing firm. {{company}} likely has executives, recruiters, and account managers traveling to client sites, candidate meetings, and partner offices. Pitch LandJet as a premium ground transportation service that turns travel time into productive work time with mobile boardrooms (high-speed WiFi, conference setups, privacy for client conversations). Reference {{pain_point}}. Highlight {{positioning}}. Mention proof: {{proof_customer}} and {{similar_companies}}. Keep under 120 words. Be founder-direct, not salesy.',
      settings: {
        sender_name: 'Ryan Landry',
        sender_role: 'CEO, LandJet',
        sender_email: 'rlandry@landjet.com',
        priority: 60,
        ai_drafts_enabled: true,
        follow_up_delay_days: 4,
        variables: {
          pain_point: 'recruiters and account executives losing billable hours commuting between client sites and candidate meetings',
          positioning: 'a premium mobile boardroom service that converts drive time into billable, client-facing productivity',
          proof_revenue: '$492K from a single manufacturer',
          target_titles: 'CEO, COO, VP Sales, Managing Director, Regional Director, Partner, Travel Coordinator',
          vertical_name: 'Technology & Staffing',
          proof_customer: 'John Deere',
          target_profile: 'Technology firms and staffing agencies with traveling sales teams and recruiters',
          similar_companies: 'Fortune 500 staffing and tech consulting firms with distributed client portfolios',
        },
      },
      channel_config: { email: { daily_limit: 8 } },
      sequence_steps: [
        { step: 1, delay_days: 0, channel: 'email', prompt: 'Initial cold outreach to {{first_name}} at {{company}}. Open with a specific observation about tech/staffing teams traveling for client work. Pitch the mobile boardroom angle with {{pain_point}}. Reference {{proof_customer}} success. Ask one direct question about their team\'s travel patterns. Sign off as {{sender_first_name}}.' },
        { step: 2, delay_days: 4, channel: 'email', prompt: 'Follow-up to {{first_name}}. Reference the previous email. Mention {{similar_companies}} and how they protect client conversations during travel. Suggest a 15-min call. Under 80 words. Sign off as {{sender_first_name}}.' },
        { step: 3, delay_days: 7, channel: 'email', prompt: 'Final brief touch to {{first_name}}. Two to three sentences. Acknowledge they are busy. Leave the door open. Sign off as {{sender_first_name}}.' },
      ],
    },
  ];

  for (const camp of campaigns) {
    console.log(`\n=== Creating: ${camp.name} ===`);
    const r = await fetch(BASE + '/admin/campaigns', {
      method: 'POST', headers,
      body: JSON.stringify(camp),
    });
    const d = await r.json();
    if (!d.campaign?.id) {
      console.log('Failed:', JSON.stringify(d));
      continue;
    }
    const id = d.campaign.id;
    console.log('Created:', id);

    // Promote to live
    for (const status of ['pending_approval', 'approved', 'live']) {
      const ar = await fetch(BASE + `/admin/campaigns/${id}/approve`, {
        method: 'POST', headers,
        body: JSON.stringify({ status }),
      });
      const ad = await ar.json();
      console.log(' ->', ad.campaign?.approval_status || ad.error);
    }
  }

  console.log('\n=== DONE ===');
}

main().catch(e => console.error('Error:', e.message));
