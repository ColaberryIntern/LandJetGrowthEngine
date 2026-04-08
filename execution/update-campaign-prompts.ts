/**
 * Update all campaign prompts with variables and rewritten templates.
 * Usage: npx ts-node execution/update-campaign-prompts.ts
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { getSequelize } from '../src/config/database';
import { initModels } from '../src/models';
import { Campaign } from '../src/models/Campaign';

interface CampaignUpdate {
  id: string;
  variables: Record<string, string>;
  prompt: string;
  steps: { step: number; delay_days: number; prompt: string }[];
}

const CAMPAIGNS: CampaignUpdate[] = [
  {
    id: '2d78e003-8a16-4d11-b143-f1e2bd619d52', // Manufacturing
    variables: {
      vertical_name: 'Manufacturing',
      proof_customer: 'John Deere',
      proof_revenue: '$492K',
      proof_bookings: '656',
      proof_description: 'across shuttle programs, executive trips, and international executive routing',
      target_titles: 'VP of Operations, VP of HR, corporate travel managers',
      target_profile: 'Midwestern manufacturers with 2+ facilities within 400 miles',
      pain_point: 'executives and technical teams lose 2-4 hours per trip to distracted driving between plants',
      positioning: 'replace your employee shuttle program with a mobile boardroom that also solves your productivity problem',
      similar_companies: 'CNH Industrial, Caterpillar, Pella Corporation, HNI Corporation, Oshkosh, Parker Hannifin, Trimble',
    },
    prompt: `You are writing as {{sender_name}}, {{sender_title}} of {{company_name}} -- {{company_description}}. Write a personalized outreach email to {{first_name}} at {{company}}.

{{company_name}} operates {{vehicle_type}} for intercity business travel on {{route_range}} where flying is inefficient but driving wastes productive time. We serve {{states_served}} states from {{locations_count}} locations.

This prospect works in manufacturing. {{proof_customer}} generated {{proof_revenue}} with {{company_name}} across {{proof_bookings}} bookings {{proof_description}}. The message is not "premium transport" -- it is "{{positioning}}."

Target: {{target_titles}} at {{target_profile}}. Pain point: {{pain_point}}.

Keep under 120 words. Be direct, specific, and credible. Reference {{proof_customer}} as social proof. Sign off as {{sender_first_name}}.`,
    steps: [
      { step: 1, delay_days: 0, prompt: 'Write an initial outreach email from {{sender_name}} to {{first_name}} at {{company}}. Introduce {{company_name}} as {{company_description}}. Reference that {{proof_customer}} generated {{proof_revenue}} through recurring shuttle and executive transport contracts. Ask if {{company}} has considered converting travel time into productive work time for their leadership team. Keep under 100 words. Be warm and direct. Sign off as {{sender_first_name}}.' },
      { step: 2, delay_days: 4, prompt: 'Write a follow-up to {{first_name}} who did not respond. Share a specific insight: {{pain_point}}, and {{company_name}}\'s mobile boardroom model turns that dead time into meeting prep, calls, and focused work. Mention that companies like {{similar_companies}} are evaluating this approach. Keep under 80 words. Do not repeat the first email. Sign off as {{sender_first_name}}.' },
      { step: 3, delay_days: 7, prompt: 'Write a graceful final email to {{first_name}}. Acknowledge their busy schedule. Offer to coordinate a 30-minute demo ride in a {{vehicle_type}} so they can experience it firsthand between their facilities. Mention that {{sender_first_name}} is available for a brief call. Keep under 70 words. Sign off as {{sender_first_name}}.' },
    ],
  },
  {
    id: 'b3bca135-793e-446d-804d-1ce852add133', // Insurance
    variables: {
      vertical_name: 'Insurance',
      proof_customer: 'Lockton Companies',
      proof_revenue: '$173K',
      proof_bookings: '338',
      proof_description: 'for broker travel across 150-300 mile client corridors',
      target_titles: 'agency principal, COO, or Office Manager',
      target_profile: 'insurance brokers and agencies with 25+ producers traveling regional corridors',
      pain_point: 'senior producers take 3-5 trips per month with no productive use of travel time, and confidential client conversations happen in parked cars',
      positioning: 'enable confidential client conversations and meeting prep during travel, turning drive time into billable prep time',
      similar_companies: 'Marsh, AON, Gallagher, Acrisure, and independent regional brokers',
    },
    prompt: `You are writing as {{sender_name}}, {{sender_title}} of {{company_name}} -- {{company_description}}. Write a personalized outreach email to {{first_name}} at {{company}}.

{{company_name}} operates {{vehicle_type}} for intercity business travel. This prospect is in the insurance industry. {{proof_customer}} built a {{proof_revenue}} relationship with {{company_name}} {{proof_description}}.

The value for insurance professionals: {{positioning}}. Target: {{target_titles}} at {{target_profile}}.

Pain point: {{pain_point}}.

Keep under 120 words. Be direct and specific. Reference {{proof_customer}} as proof. Sign off as {{sender_first_name}}.`,
    steps: [
      { step: 1, delay_days: 0, prompt: 'Write an initial outreach from {{sender_name}} to {{first_name}} at {{company}}. Introduce {{company_name}} and reference that {{proof_customer}} uses {{company_name}} for broker travel across regional corridors. Ask if {{company}}\'s producers could benefit from turning travel time into client prep time. Keep under 100 words. Sign off as {{sender_first_name}}.' },
      { step: 2, delay_days: 4, prompt: 'Write a follow-up to {{first_name}}. Share that {{pain_point}}. {{company_name}} turns that into a private, productive environment -- {{positioning}}. Mention that agencies like {{similar_companies}} are exploring this model. Keep under 80 words. Sign off as {{sender_first_name}}.' },
      { step: 3, delay_days: 7, prompt: 'Write a final email to {{first_name}}. Offer to arrange a trial trip for their next client visit so they can experience {{company_name}} firsthand. Keep it brief and warm. Under 70 words. Sign off as {{sender_first_name}}.' },
    ],
  },
  {
    id: '9eb81b6d-3022-4685-8f8e-d7b9e640dbff', // Healthcare
    variables: {
      vertical_name: 'Healthcare',
      proof_customer: 'Mid-America Cardiology',
      proof_revenue: '$162K',
      proof_bookings: '160',
      proof_description: 'for physician and staff travel between practice locations',
      target_titles: 'VP of Administration, COO, or Practice Manager',
      target_profile: 'multi-location medical groups and health systems',
      pain_point: 'physicians and clinical staff waste hours driving between campuses, arriving stressed instead of prepared for patient care',
      positioning: 'support physician recruitment travel, executive leadership travel across hospital campuses, and clinical staff transport between facilities',
      similar_companies: 'KU Medical Center (existing client), cardiology groups, oncology practices, orthopedic networks',
    },
    prompt: `You are writing as {{sender_name}}, {{sender_title}} of {{company_name}} -- {{company_description}}. Write a personalized outreach email to {{first_name}} at {{company}}.

{{company_name}} operates {{vehicle_type}} for intercity business travel. This prospect is in healthcare. {{proof_customer}} built a {{proof_revenue}} relationship with {{company_name}} across {{proof_bookings}} bookings {{proof_description}}.

The value for healthcare: {{positioning}}. Target: {{target_titles}} at {{target_profile}}. Pain point: {{pain_point}}.

Keep under 120 words. Be professional and specific. Reference {{proof_customer}} as proof. Sign off as {{sender_first_name}}.`,
    steps: [
      { step: 1, delay_days: 0, prompt: 'Write an initial outreach from {{sender_name}} to {{first_name}} at {{company}}. Introduce {{company_name}} and reference that {{proof_customer}} built a {{proof_revenue}} relationship for physician and staff transport. Ask if {{company}} has explored converting provider travel time into productive time. Keep under 100 words. Sign off as {{sender_first_name}}.' },
      { step: 2, delay_days: 4, prompt: 'Write a follow-up to {{first_name}}. Emphasize that {{pain_point}}. {{company_name}} provides reliable, productive transport between facilities so providers arrive prepared. Mention {{similar_companies}} as reference points. Keep under 80 words. Sign off as {{sender_first_name}}.' },
      { step: 3, delay_days: 7, prompt: 'Write a final email to {{first_name}}. Offer to coordinate a trial for their next physician travel day between locations. Keep it professional and brief. Under 70 words. Sign off as {{sender_first_name}}.' },
    ],
  },
  {
    id: '6c18c01a-5d54-4946-aa83-2c92aeabe758', // Investor
    variables: {
      vertical_name: 'Investor',
      proof_customer: 'John Deere',
      proof_revenue: '$492K from a single manufacturer',
      target_titles: 'Managing Director, Partner, Principal',
      target_profile: 'PE, growth equity, and venture firms investing in transportation, franchising, hospitality, or business services',
      pain_point: 'the $350B business travel market has no nationally franchised premium ground transportation brand',
      positioning: 'first nationally franchised premium ground transportation brand with proven unit economics and franchise rollout model',
    },
    prompt: `You are writing as {{sender_name}}, {{sender_title}} of {{sender_company}}. Write a personalized investor outreach email to {{first_name}} at {{company}}.

{{company_name}} is {{company_description}}. We operate {{vehicle_type}} for intercity business travel -- {{route_range}} where flying is inefficient but driving wastes productive time. {{no_competitor}}.

Performance: serving {{states_served}} states from {{locations_count}} locations, {{avg_trip_value}} average trip value, {{unit_economics}} unit economics. Raising {{raise_amount}} for {{raise_purpose}}.

The opportunity: {{value_prop}} in the {{market_size}}. Pain point: {{pain_point}}.

Keep under 120 words. Be founder-direct, not salesy. Reference specific alignment with {{company}}'s investment thesis if possible. Sign off as {{sender_first_name}}.`,
    steps: [
      { step: 1, delay_days: 0, prompt: 'Write a founder-direct investor outreach from {{sender_name}} to {{first_name}} at {{company}}. Introduce {{company_name}} as {{company_description}} with {{unit_economics}} unit economics and {{avg_trip_value}} average trip value across {{states_served}} states. {{no_competitor}}. We are raising {{raise_amount}} for {{raise_purpose}}. Ask if {{company}} is exploring opportunities in transportation or franchised services. Keep under 100 words. Sign off as {{sender_first_name}}.' },
      { step: 2, delay_days: 5, prompt: 'Write a follow-up to {{first_name}} at {{company}}. Share a concrete data point: {{proof_customer}} generated {{proof_revenue}} through recurring contracts -- proving the corporate account model. The franchise rollout plan takes this proven playbook to new markets. Keep under 80 words. Do not repeat the first email. Sign off as {{sender_first_name}}.' },
      { step: 3, delay_days: 10, prompt: 'Write a graceful final email to {{first_name}}. Acknowledge their busy schedule. Mention that {{sender_first_name}} is available for a brief 15-minute call to walk through the investor deck and franchise expansion plan. Leave the door open. Under 70 words. Sign off as {{sender_first_name}}.' },
    ],
  },
  {
    id: '05d0bfc3-b0dc-4b6a-afa0-03caae423b66', // Sports & Events
    variables: {
      vertical_name: 'Sports & Events',
      proof_customer: 'Big Ten Network and Chicago Bears',
      proof_revenue: '$204K combined',
      target_titles: 'stadium operations director, conference office manager, event coordinator',
      target_profile: 'sports properties, convention bureaus, and venue operators',
      pain_point: 'VIP and athlete transport is handled ad hoc with no contracted recurring solution',
      positioning: 'one institutional contract generates dozens of individual bookings per year',
      similar_companies: 'Iowa Women\'s Basketball, WWE, Formula 1 Austin, Iowa Wolves',
    },
    prompt: `You are writing as {{sender_name}}, {{sender_title}} of {{company_name}}. Write a personalized outreach to {{first_name}} at {{company}}.

{{company_name}} provides {{vehicle_type}} for VIP, athlete, and sponsor transport. Existing clients include {{proof_customer}} generating {{proof_revenue}} in combined revenue.

Key insight: {{positioning}}. Target: {{target_titles}} at {{target_profile}}.

Keep under 120 words. Position as a partnership opportunity, not cold prospecting. Sign off as {{sender_first_name}}.`,
    steps: [
      { step: 1, delay_days: 0, prompt: 'Write an initial outreach from {{sender_name}} to {{first_name}} at {{company}}. Position {{company_name}} for recurring VIP and athlete transport. Reference {{proof_customer}} as existing clients. Explain that {{positioning}}. Ask if {{company}} handles VIP transport in-house or through a partner. Keep under 100 words. Sign off as {{sender_first_name}}.' },
      { step: 2, delay_days: 4, prompt: 'Write a follow-up to {{first_name}}. Offer to coordinate {{company_name}} transport for their next major event as a trial. Mention that {{similar_companies}} also use the service. Keep under 80 words. Sign off as {{sender_first_name}}.' },
      { step: 3, delay_days: 7, prompt: 'Write a final touch to {{first_name}}. Suggest a brief call to discuss how {{company_name}} handles game day and event logistics. Under 70 words. Sign off as {{sender_first_name}}.' },
    ],
  },
  {
    id: '8979a621-48b5-4b8c-94e7-f10d63d5f4c3', // Banking
    variables: {
      vertical_name: 'Banking & Finance',
      proof_customer: 'QCR Holdings',
      proof_revenue: '$54K',
      proof_avg_trip: '$2,109 average trip value',
      target_titles: 'CEO, CFO, or Managing Director',
      target_profile: 'regional banks and financial holding companies with 5-15 branch locations across a 200-mile corridor',
      pain_point: 'C-suite and advisor time is worth $200-500/hour, making the trip cost less expensive than the lost productivity',
      positioning: 'C-suite travel between branch markets, investor relations road trips, and client entertainment',
      similar_companies: 'Renaissance Financial, McGill Junge Wealth Management, Enterprise Bank',
    },
    prompt: `You are writing as {{sender_name}}, {{sender_title}} of {{company_name}}. Write a personalized outreach to {{first_name}} at {{company}}.

{{company_name}} operates {{vehicle_type}} for executive business travel. {{proof_customer}} is a client at {{proof_avg_trip}}. The ROI argument: {{pain_point}}.

Value for banking: {{positioning}}. Target: {{target_titles}} at {{target_profile}}.

Keep under 120 words. Be professional and specific. Sign off as {{sender_first_name}}.`,
    steps: [
      { step: 1, delay_days: 0, prompt: 'Write an initial outreach from {{sender_name}} to {{first_name}} at {{company}}. Reference that {{proof_customer}} uses {{company_name}} at {{proof_avg_trip}}. Explain the ROI: {{pain_point}}. Ask if {{company}} leadership travels between branches regularly. Keep under 100 words. Sign off as {{sender_first_name}}.' },
      { step: 2, delay_days: 4, prompt: 'Write a follow-up to {{first_name}}. Emphasize {{positioning}} use cases. Mention {{similar_companies}} as reference points. Keep under 80 words. Sign off as {{sender_first_name}}.' },
      { step: 3, delay_days: 7, prompt: 'Write a final email to {{first_name}}. Offer a trial for their next board meeting or branch visit. Under 70 words. Sign off as {{sender_first_name}}.' },
    ],
  },
  {
    id: '7721366f-adc5-405f-9ff9-319feadcd07f', // Legal
    variables: {
      vertical_name: 'Legal',
      proof_customer: 'Weinhardt Law Firm and Jones Day',
      proof_revenue: '$57K',
      target_titles: 'Managing Partner or Office Administrator',
      target_profile: 'litigation firms with attorneys traveling for depositions, court appearances, and client meetings',
      pain_point: 'trial attorneys billing $300-800/hour waste that revenue driving instead of preparing -- LandJet turns travel into billable prep time',
      positioning: 'mobile office for attorneys traveling to courthouses, depositions, and client meetings',
      similar_companies: 'Polsinelli, ABHR',
    },
    prompt: `You are writing as {{sender_name}}, {{sender_title}} of {{company_name}}. Write a personalized outreach to {{first_name}} at {{company}}.

{{company_name}} operates {{vehicle_type}} for professional travel. {{proof_customer}} are existing clients generating {{proof_revenue}}.

The value for law firms: {{positioning}}. {{pain_point}}.

Target: {{target_titles}} at {{target_profile}}.

Keep under 120 words. Be direct. Sign off as {{sender_first_name}}.`,
    steps: [
      { step: 1, delay_days: 0, prompt: 'Write an initial outreach from {{sender_name}} to {{first_name}} at {{company}}. Reference {{proof_customer}} as existing clients. Position {{company_name}} as a {{positioning}}. Explain that {{pain_point}}. Ask if their attorneys travel regularly for depositions or court. Keep under 100 words. Sign off as {{sender_first_name}}.' },
      { step: 2, delay_days: 4, prompt: 'Write a follow-up to {{first_name}}. Emphasize that attorneys billing $300-800/hour lose revenue to driving. {{company_name}} converts that into productive prep time. Mention {{similar_companies}}. Keep under 80 words. Sign off as {{sender_first_name}}.' },
      { step: 3, delay_days: 7, prompt: 'Write a final email to {{first_name}}. Offer a trial trip for their next out-of-town deposition. Under 70 words. Sign off as {{sender_first_name}}.' },
    ],
  },
  {
    id: 'b83c2a22-43d1-42c5-8718-03ca55b39281', // Technology
    variables: {
      vertical_name: 'Technology & Staffing',
      proof_customer: 'ECCO Select and Fetch Rewards',
      proof_revenue: '$117K combined',
      target_titles: 'VP of Talent Acquisition or VP of Sales',
      target_profile: 'regional tech firms and staffing companies with 100-500 employees and distributed client bases',
      pain_point: 'recruiting trips, client visits, and onsite implementation travel across metro corridors waste productive hours',
      positioning: 'productive travel for recruiting trips, client visits, and distributed team coordination',
      similar_companies: 'CommLink, Aisle Rocket',
    },
    prompt: `You are writing as {{sender_name}}, {{sender_title}} of {{company_name}}. Write a personalized outreach to {{first_name}} at {{company}}.

{{company_name}} operates {{vehicle_type}} for business travel. {{proof_customer}} are existing clients generating {{proof_revenue}}.

Value for tech/staffing: {{positioning}}. Pain point: {{pain_point}}.

Target: {{target_titles}} at {{target_profile}}.

Keep under 120 words. Sign off as {{sender_first_name}}.`,
    steps: [
      { step: 1, delay_days: 0, prompt: 'Write an initial outreach from {{sender_name}} to {{first_name}} at {{company}}. Reference {{proof_customer}} as clients. Position {{company_name}} for {{positioning}}. Ask if {{company}} sends teams to client sites or recruits across cities. Keep under 100 words. Sign off as {{sender_first_name}}.' },
      { step: 2, delay_days: 4, prompt: 'Write a follow-up to {{first_name}}. Mention that {{pain_point}}. The corporate account model provides consistent, reliable transport. Reference {{similar_companies}}. Keep under 80 words. Sign off as {{sender_first_name}}.' },
      { step: 3, delay_days: 7, prompt: 'Write a final email to {{first_name}}. Suggest a trial for their next client visit or recruiting trip. Under 70 words. Sign off as {{sender_first_name}}.' },
    ],
  },
  {
    id: '1e517b88-812b-49b7-98cd-947f4ccc1977', // Construction
    variables: {
      vertical_name: 'Construction & Engineering',
      proof_customer: 'Findorff and Russell Construction',
      proof_revenue: '$44K',
      target_titles: 'VP of Operations or Project Executive',
      target_profile: 'large general contractors and civil engineering firms sending teams to job sites',
      pain_point: 'project teams lose 2-4 hours per site visit to distracted driving, arriving unprepared for owner meetings and design reviews',
      positioning: 'mobile office for project teams traveling to job sites, owner meetings, and design reviews',
      similar_companies: 'Bush Construction, Summit Concrete',
    },
    prompt: `You are writing as {{sender_name}}, {{sender_title}} of {{company_name}}. Write a personalized outreach to {{first_name}} at {{company}}.

{{company_name}} operates {{vehicle_type}} for business travel. {{proof_customer}} are existing clients generating {{proof_revenue}}.

Value for construction: {{positioning}}. Pain point: {{pain_point}}.

Target: {{target_titles}} at {{target_profile}}.

Keep under 120 words. Sign off as {{sender_first_name}}.`,
    steps: [
      { step: 1, delay_days: 0, prompt: 'Write an initial outreach from {{sender_name}} to {{first_name}} at {{company}}. Reference {{proof_customer}} as clients. Position {{company_name}} as a {{positioning}}. Explain that {{pain_point}}. Ask if their teams travel between job sites regularly. Keep under 100 words. Sign off as {{sender_first_name}}.' },
      { step: 2, delay_days: 4, prompt: 'Write a follow-up to {{first_name}}. Emphasize that teams arrive to owner meetings prepared instead of rushed. {{company_name}} converts drive time into review and prep. Reference {{similar_companies}}. Keep under 80 words. Sign off as {{sender_first_name}}.' },
      { step: 3, delay_days: 7, prompt: 'Write a final email to {{first_name}}. Offer a trial for their next multi-site project day. Under 70 words. Sign off as {{sender_first_name}}.' },
    ],
  },
  {
    id: '96edb427-ac2a-47b8-a483-e87a5acc8001', // General
    variables: {
      vertical_name: 'General',
      proof_customer: 'Fortune 500 companies and regional enterprises',
      target_profile: 'past clients and business contacts who have used premium ground transportation',
    },
    prompt: `You are writing as {{sender_name}}, {{sender_title}} of {{company_name}} -- {{company_description}}. Write a personalized reconnection email to {{first_name}} at {{company}}.

{{company_name}} operates {{vehicle_type}} for intercity business travel on {{route_range}}. We serve {{states_served}} states from {{locations_count}} locations across {{locations_list}}.

This is a warm reconnection with a past client. Be genuine, not salesy. Ask about their current travel needs. Reference {{company_name}}'s growth since they last used the service.

Keep under 120 words. Be warm and direct. Sign off as {{sender_first_name}}.`,
    steps: [
      { step: 1, delay_days: 0, prompt: 'Write a warm reconnection email from {{sender_name}} to {{first_name}}. Reference {{company_name}} and ask about their current executive travel needs. Mention that {{company_name}} now serves {{states_served}} states with {{vehicle_type}}. Keep it personal and under 100 words. Sign off as {{sender_first_name}}.' },
      { step: 2, delay_days: 4, prompt: 'Write a follow-up to {{first_name}}. Add value by sharing that {{company_name}} turns travel time into productive work time -- a mobile office experience. Mention {{avg_trip_value}} average trip value and {{unit_economics}} unit economics as proof of the model\'s value. Keep under 80 words. Sign off as {{sender_first_name}}.' },
      { step: 3, delay_days: 7, prompt: 'Write a graceful final email to {{first_name}}. Acknowledge their busy schedule. Leave the door open with a 15-minute call suggestion whenever timing works. Be warm. Under 70 words. Sign off as {{sender_first_name}}.' },
    ],
  },
];

async function main() {
  console.log('=== Updating Campaign Prompts with Variables ===\n');

  const sequelize = getSequelize();
  await sequelize.authenticate();
  initModels(sequelize);

  for (const update of CAMPAIGNS) {
    const campaign = await Campaign.findByPk(update.id);
    if (!campaign) {
      console.log(`  SKIP: Campaign ${update.id} not found`);
      continue;
    }

    const currentSettings = (campaign.settings || {}) as any;
    campaign.settings = { ...currentSettings, variables: update.variables } as any;
    campaign.ai_system_prompt = update.prompt;
    campaign.sequence_steps = update.steps;

    await campaign.save();
    console.log(`  Updated: ${campaign.name} (${Object.keys(update.variables).length} variables, ${update.steps.length} steps)`);
  }

  console.log('\n=== Done ===');
  await sequelize.close();
  process.exit(0);
}

main().catch(err => { console.error('Failed:', err.message); process.exit(1); });
