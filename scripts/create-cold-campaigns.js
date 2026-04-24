require('dotenv').config();

const BASE = 'http://95.216.199.47:3011/api';

async function run() {
  // Login
  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@landjet.com', password: 'Admin123!' }),
  });
  const { token } = await loginRes.json();

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const coldCampaigns = [
    {
      name: 'Cold Outreach - Manufacturing',
      type: 'cold_outbound',
      ai_system_prompt: `Write a personalized cold outreach email to {{first_name}} at {{company}}. You are Ryan Landry, CEO of LandJet, a premium ground transportation company that serves as a mobile boardroom for executives. The recipient works in manufacturing and may need executive transportation for multi-site operations, plant visits, or client meetings. Mention that LandJet works extensively with manufacturing companies including Fortune 500 clients like John Deere. Highlight how a mobile office on wheels lets executives stay productive between facilities. Keep under 100 words. Be direct and professional, not salesy. Sign off as Ryan.`,
      settings: {
        priority: 60,
        variables: {
          vertical_name: 'Manufacturing',
          target_profile: 'VP/Director/C-suite at manufacturing companies with 50-5000 employees',
          pain_point: 'lost productivity during travel between manufacturing facilities, plants, and client sites',
          value_prop: 'a mobile boardroom that turns travel time into productive work time with WiFi, conference setup, and privacy',
          proof_point: 'serves Fortune 500 manufacturers including John Deere across multiple facilities',
        },
        sender_name: 'Ryan Landry',
        sender_role: 'CEO, LandJet',
        sender_email: 'rlandry@landjet.com',
        ai_drafts_enabled: true,
        test_mode_enabled: true,
        max_leads_per_cycle: 10,
      },
      channel_config: { email: { daily_limit: 5 } },
      sequence_steps: [
        { step: 1, channel: 'email', delay_days: 0, prompt: 'Write an initial cold outreach to {{first_name}} at {{company}}. Mention LandJet works with manufacturing companies to turn executive travel into productive time. Reference the mobile boardroom concept. Ask if they have multi-site travel needs. Under 100 words. Sign off as Ryan.' },
        { step: 2, channel: 'email', delay_days: 5, prompt: 'Follow up with {{first_name}}. Reference your previous email about executive ground transportation for manufacturing. Mention a specific benefit like staying connected between plant visits. Under 80 words. Sign off as Ryan.' },
        { step: 3, channel: 'email', delay_days: 10, prompt: 'Brief final follow-up to {{first_name}}. Keep to 2-3 sentences. Leave the door open. Sign off as Ryan.' },
      ],
    },
    {
      name: 'Cold Outreach - Insurance',
      type: 'cold_outbound',
      ai_system_prompt: `Write a personalized cold outreach email to {{first_name}} at {{company}}. You are Ryan Landry, CEO of LandJet, a premium ground transportation company. The recipient works in the insurance industry (broker, agent, or executive) and may need reliable executive transportation for client meetings, site visits, or team travel. Mention that LandJet works extensively with insurance companies. Highlight the mobile boardroom concept for productive travel between appointments. Keep under 100 words. Be direct, not salesy. Sign off as Ryan.`,
      settings: {
        priority: 70,
        variables: {
          vertical_name: 'Insurance',
          target_profile: 'Insurance brokers, agents, and executives at mid-to-large agencies',
          pain_point: 'time lost driving between client appointments and offices across metro areas',
          value_prop: 'a premium mobile office that lets agents and executives prep for meetings while traveling between appointments',
          proof_point: 'trusted by leading insurance companies for executive ground transportation',
        },
        sender_name: 'Ryan Landry',
        sender_role: 'CEO, LandJet',
        sender_email: 'rlandry@landjet.com',
        ai_drafts_enabled: true,
        test_mode_enabled: true,
        max_leads_per_cycle: 10,
      },
      channel_config: { email: { daily_limit: 5 } },
      sequence_steps: [
        { step: 1, channel: 'email', delay_days: 0, prompt: 'Write an initial cold outreach to {{first_name}} at {{company}} in the insurance industry. Mention LandJet provides premium ground transportation for insurance professionals. Highlight the mobile office concept for travel between client meetings. Under 100 words. Sign off as Ryan.' },
        { step: 2, channel: 'email', delay_days: 5, prompt: 'Follow up with {{first_name}}. Reference the previous email. Mention how insurance professionals benefit from productive travel between appointments. Under 80 words. Sign off as Ryan.' },
        { step: 3, channel: 'email', delay_days: 10, prompt: 'Brief final follow-up to {{first_name}}. 2-3 sentences. Leave the door open. Sign off as Ryan.' },
      ],
    },
    {
      name: 'Cold Outreach - Banking & Finance',
      type: 'cold_outbound',
      ai_system_prompt: `Write a personalized cold outreach email to {{first_name}} at {{company}}. You are Ryan Landry, CEO of LandJet. The recipient works in banking or finance and may need premium ground transportation for client meetings, roadshows, or executive travel. Highlight the mobile boardroom with privacy and connectivity. Keep under 100 words. Direct, professional tone. Sign off as Ryan.`,
      settings: {
        priority: 60,
        variables: {
          vertical_name: 'Banking & Finance',
          target_profile: 'Managing Directors, VPs, and senior executives at banks and financial services firms',
          pain_point: 'need for discreet, productive transportation for client meetings and roadshows',
          value_prop: 'a private mobile boardroom with secure WiFi and conference capability for confidential discussions en route',
          proof_point: 'serves financial services executives across major metro areas',
        },
        sender_name: 'Ryan Landry',
        sender_role: 'CEO, LandJet',
        sender_email: 'rlandry@landjet.com',
        ai_drafts_enabled: true,
        test_mode_enabled: true,
        max_leads_per_cycle: 10,
      },
      channel_config: { email: { daily_limit: 5 } },
      sequence_steps: [
        { step: 1, channel: 'email', delay_days: 0, prompt: 'Cold outreach to {{first_name}} at {{company}} in banking/finance. Mention LandJet as a mobile boardroom for executive travel. Under 100 words. Sign off as Ryan.' },
        { step: 2, channel: 'email', delay_days: 5, prompt: 'Follow up with {{first_name}}. Reference previous email about executive ground transportation for finance. Under 80 words. Sign off as Ryan.' },
        { step: 3, channel: 'email', delay_days: 10, prompt: 'Brief final follow-up. 2-3 sentences. Sign off as Ryan.' },
      ],
    },
    {
      name: 'Cold Outreach - Sports & Events',
      type: 'cold_outbound',
      ai_system_prompt: `Write a personalized cold outreach email to {{first_name}} at {{company}}. You are Ryan Landry, CEO of LandJet. The recipient works in sports, entertainment, or event management and may need premium ground transportation for teams, VIPs, or event logistics. Keep under 100 words. Direct tone. Sign off as Ryan.`,
      settings: {
        priority: 50,
        variables: {
          vertical_name: 'Sports & Events',
          target_profile: 'Event coordinators, team operations managers, and VIP services directors',
          pain_point: 'coordinating reliable premium transportation for teams, VIPs, and event attendees',
          value_prop: 'fleet of premium vehicles with professional drivers for seamless event and team transportation',
          proof_point: 'experienced in sports team and VIP event transportation logistics',
        },
        sender_name: 'Ryan Landry',
        sender_role: 'CEO, LandJet',
        sender_email: 'rlandry@landjet.com',
        ai_drafts_enabled: true,
        test_mode_enabled: true,
        max_leads_per_cycle: 10,
      },
      channel_config: { email: { daily_limit: 5 } },
      sequence_steps: [
        { step: 1, channel: 'email', delay_days: 0, prompt: 'Cold outreach to {{first_name}} at {{company}} in sports/events. Mention LandJet for team and VIP transportation. Under 100 words. Sign off as Ryan.' },
        { step: 2, channel: 'email', delay_days: 5, prompt: 'Follow up. Reference previous email. Under 80 words. Sign off as Ryan.' },
        { step: 3, channel: 'email', delay_days: 10, prompt: 'Brief final follow-up. 2-3 sentences. Sign off as Ryan.' },
      ],
    },
    {
      name: 'Cold Outreach - Legal',
      type: 'cold_outbound',
      ai_system_prompt: `Write a personalized cold outreach email to {{first_name}} at {{company}}. You are Ryan Landry, CEO of LandJet. The recipient works at a law firm and may need premium ground transportation for partner travel, client meetings, or depositions. Highlight privacy and productivity. Keep under 100 words. Professional tone. Sign off as Ryan.`,
      settings: {
        priority: 55,
        variables: {
          vertical_name: 'Legal',
          target_profile: 'Managing Partners, Senior Partners, and Office Administrators at law firms',
          pain_point: 'need for private, productive transportation between courthouses, client offices, and firm locations',
          value_prop: 'a confidential mobile office for attorneys to prep for meetings and calls while traveling',
          proof_point: 'trusted by law firms for discreet executive transportation',
        },
        sender_name: 'Ryan Landry',
        sender_role: 'CEO, LandJet',
        sender_email: 'rlandry@landjet.com',
        ai_drafts_enabled: true,
        test_mode_enabled: true,
        max_leads_per_cycle: 10,
      },
      channel_config: { email: { daily_limit: 5 } },
      sequence_steps: [
        { step: 1, channel: 'email', delay_days: 0, prompt: 'Cold outreach to {{first_name}} at {{company}} (law firm). Mention LandJet as a mobile office for attorney travel. Under 100 words. Sign off as Ryan.' },
        { step: 2, channel: 'email', delay_days: 5, prompt: 'Follow up. Reference previous email. Under 80 words. Sign off as Ryan.' },
        { step: 3, channel: 'email', delay_days: 10, prompt: 'Brief final follow-up. 2-3 sentences. Sign off as Ryan.' },
      ],
    },
    {
      name: 'Cold Outreach - Healthcare',
      type: 'cold_outbound',
      ai_system_prompt: `Write a personalized cold outreach email to {{first_name}} at {{company}}. You are Ryan Landry, CEO of LandJet. The recipient works in healthcare and may need premium ground transportation for executives traveling between hospital campuses, conferences, or partner meetings. Keep under 100 words. Professional tone. Sign off as Ryan.`,
      settings: {
        priority: 55,
        variables: {
          vertical_name: 'Healthcare',
          target_profile: 'Hospital administrators, health system executives, and medical group leaders',
          pain_point: 'executive travel between hospital campuses, satellite offices, and conferences',
          value_prop: 'a mobile boardroom for healthcare executives to stay productive and connected between locations',
          proof_point: 'serves healthcare organizations across multiple markets',
        },
        sender_name: 'Ryan Landry',
        sender_role: 'CEO, LandJet',
        sender_email: 'rlandry@landjet.com',
        ai_drafts_enabled: true,
        test_mode_enabled: true,
        max_leads_per_cycle: 10,
      },
      channel_config: { email: { daily_limit: 5 } },
      sequence_steps: [
        { step: 1, channel: 'email', delay_days: 0, prompt: 'Cold outreach to {{first_name}} at {{company}} in healthcare. Mention LandJet for executive transportation between campuses. Under 100 words. Sign off as Ryan.' },
        { step: 2, channel: 'email', delay_days: 5, prompt: 'Follow up. Reference previous email. Under 80 words. Sign off as Ryan.' },
        { step: 3, channel: 'email', delay_days: 10, prompt: 'Brief final follow-up. 2-3 sentences. Sign off as Ryan.' },
      ],
    },
  ];

  for (const campaign of coldCampaigns) {
    const res = await fetch(`${BASE}/admin/campaigns`, {
      method: 'POST',
      headers,
      body: JSON.stringify(campaign),
    });
    const data = await res.json();
    console.log(data.campaign ? `Created: ${data.campaign.name}` : `Error: ${JSON.stringify(data).substring(0, 200)}`);
  }
}

run().catch(e => console.error(e.message));
