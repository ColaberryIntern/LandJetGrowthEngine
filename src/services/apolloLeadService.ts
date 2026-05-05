/**
 * Apollo lead sourcing service.
 * Pulls cold leads from Apollo for a given campaign and creates them in our database.
 *
 * Usage: pullLeadsForCampaign(campaignId, count)
 *
 * Markets, titles, and industries are pulled from campaign.settings.apollo_config when present,
 * otherwise fall back to sensible defaults based on the campaign name.
 */

import { Lead } from '../models/Lead';
import { Campaign } from '../models/Campaign';
import { SystemSetting } from '../models/SystemSetting';
import { logger } from '../config/logger';

const APOLLO_KEY = process.env.APOLLO_API_KEY || '';

interface ApolloConfig {
  industries: string[];
  titles: string[];
  markets: { name: string; person_locations: string[]; weight?: number }[];
  employee_ranges: string[];
}

const DEFAULT_TITLES = [
  'CEO', 'COO', 'President', 'Owner', 'VP Operations',
  'Travel Coordinator', 'Travel Manager', 'Regional Director',
  'Managing Director', 'Partner', 'Executive Assistant',
];

const DEFAULT_MARKETS = [
  {
    name: 'Iowa',
    person_locations: ['Iowa, United States'],
    weight: 1,
  },
  {
    name: 'Dallas',
    person_locations: [
      'Dallas, Texas, United States',
      'Fort Worth, Texas, United States',
      'Plano, Texas, United States',
      'Frisco, Texas, United States',
      'Arlington, Texas, United States',
      'Irving, Texas, United States',
    ],
    weight: 1,
  },
  {
    name: 'San Antonio',
    person_locations: [
      'San Antonio, Texas, United States',
      'New Braunfels, Texas, United States',
    ],
    weight: 1,
  },
];

// Industry filter mapping by campaign vertical keyword
const INDUSTRY_MAP: Record<string, string[]> = {
  manufacturing: ['manufacturing', 'machinery', 'automotive', 'industrial automation'],
  insurance: ['insurance'],
  banking: ['banking', 'financial services', 'capital markets', 'investment management'],
  finance: ['banking', 'financial services', 'capital markets', 'investment management'],
  sports: ['sports', 'events services', 'entertainment'],
  events: ['sports', 'events services', 'entertainment'],
  legal: ['law practice', 'legal services'],
  healthcare: ['hospital & health care', 'medical practice', 'pharmaceuticals', 'medical devices'],
  construction: ['construction', 'civil engineering', 'architecture & planning', 'mechanical or industrial engineering'],
  engineering: ['construction', 'civil engineering', 'architecture & planning', 'mechanical or industrial engineering'],
  technology: ['information technology and services', 'computer software', 'staffing and recruiting'],
  staffing: ['information technology and services', 'computer software', 'staffing and recruiting', 'human resources'],
};

function inferIndustriesFromName(campaignName: string): string[] {
  const name = campaignName.toLowerCase();
  const matched = new Set<string>();
  for (const [keyword, industries] of Object.entries(INDUSTRY_MAP)) {
    if (name.includes(keyword)) industries.forEach(i => matched.add(i));
  }
  return Array.from(matched);
}

function getApolloConfig(campaign: any): ApolloConfig {
  const stored = campaign.settings?.apollo_config as Partial<ApolloConfig> | undefined;
  return {
    industries: stored?.industries?.length ? stored.industries : inferIndustriesFromName(campaign.name),
    titles: stored?.titles?.length ? stored.titles : DEFAULT_TITLES,
    markets: stored?.markets?.length ? stored.markets : DEFAULT_MARKETS,
    employee_ranges: stored?.employee_ranges?.length ? stored.employee_ranges : ['50,1000'],
  };
}

async function searchApollo(config: ApolloConfig, market: ApolloConfig['markets'][0], page: number, perPage: number): Promise<any[]> {
  const r = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': APOLLO_KEY },
    body: JSON.stringify({
      person_titles: config.titles,
      person_locations: market.person_locations,
      organization_industries: config.industries,
      organization_num_employees_ranges: config.employee_ranges,
      per_page: perPage,
      page,
    }),
  });
  const d: any = await r.json();
  return d.people || [];
}

async function enrichPerson(personId: string): Promise<any | null> {
  const r = await fetch('https://api.apollo.io/api/v1/people/match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': APOLLO_KEY },
    body: JSON.stringify({ id: personId, reveal_personal_emails: false }),
  });
  const d: any = await r.json();
  return d.person || null;
}

async function incrementCreditCounter(amount: number): Promise<void> {
  try {
    const setting = await SystemSetting.findOne({ where: { key: 'apollo_credits_used' } });
    if (setting) {
      const raw = (setting as any).value;
      const cur = typeof raw === 'number' ? raw : parseInt(String(raw || '0').replace(/"/g, ''), 10) || 0;
      await setting.update({ value: String(cur + amount) as any });
    } else {
      await SystemSetting.create({ key: 'apollo_credits_used', value: String(amount) as any } as any);
    }
  } catch (e) {
    logger.warn('Failed to increment Apollo credit counter', { error: (e as Error).message });
  }
}

export async function getApolloCreditUsage(): Promise<{ used: number; limit: number }> {
  const setting = await SystemSetting.findOne({ where: { key: 'apollo_credits_used' } });
  const raw = setting ? (setting as any).value : '0';
  const used = typeof raw === 'number' ? raw : parseInt(String(raw || '0').replace(/"/g, ''), 10) || 0;
  const limit = parseInt(process.env.APOLLO_MONTHLY_CREDITS || '5000', 10);
  return { used, limit };
}

export async function pullLeadsForCampaign(
  campaignId: string,
  targetCount: number = 50,
): Promise<{ created: number; credits_used: number; errors: number; duplicates: number; details: string[] }> {
  if (!APOLLO_KEY) throw new Error('APOLLO_API_KEY is not configured');

  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign) throw new Error('Campaign not found');

  const config = getApolloConfig(campaign);
  if (!config.industries.length) {
    throw new Error('No industry filters configured for this campaign. Add industries to campaign.settings.apollo_config.industries or include an industry keyword in the campaign name.');
  }

  // Get existing emails for dedupe
  const existing = new Set<string>();
  const allLeads = await Lead.findAll({ attributes: ['email'] });
  allLeads.forEach((l: any) => { if (l.email) existing.add(l.email.toLowerCase().trim()); });

  const stats = { created: 0, credits_used: 0, errors: 0, duplicates: 0, details: [] as string[] };

  // Distribute target count across markets evenly (with slight rounding)
  const totalWeight = config.markets.reduce((sum, m) => sum + (m.weight || 1), 0);
  const perMarket = config.markets.map(m => ({
    market: m,
    take: Math.ceil((targetCount * (m.weight || 1)) / totalWeight),
  }));

  for (const { market, take } of perMarket) {
    if (stats.created >= targetCount) break;
    let collected = 0;
    let page = 1;
    const seenInMarket = new Set<string>();

    while (collected < take && page <= 5 && stats.created < targetCount) {
      const people = await searchApollo(config, market, page, 25);
      if (people.length === 0) break;

      for (const p of people) {
        if (collected >= take || stats.created >= targetCount) break;
        if (seenInMarket.has(p.id)) continue;
        seenInMarket.add(p.id);

        const enriched = await enrichPerson(p.id);
        stats.credits_used++;

        const email = enriched?.email;
        if (!email || existing.has(email.toLowerCase().trim())) {
          stats.duplicates++;
          continue;
        }
        existing.add(email.toLowerCase().trim());

        try {
          const verticalGuess = campaign.name.toLowerCase().includes('construction') ? 'Construction'
            : campaign.name.toLowerCase().includes('technology') || campaign.name.toLowerCase().includes('staffing') ? 'Technology'
            : campaign.name.toLowerCase().includes('manufacturing') ? 'Manufacturing'
            : campaign.name.toLowerCase().includes('insurance') ? 'Insurance'
            : campaign.name.toLowerCase().includes('banking') || campaign.name.toLowerCase().includes('finance') ? 'Banking'
            : campaign.name.toLowerCase().includes('healthcare') ? 'Healthcare'
            : campaign.name.toLowerCase().includes('legal') ? 'Legal'
            : campaign.name.toLowerCase().includes('sports') || campaign.name.toLowerCase().includes('events') ? 'Sports & Events'
            : null;

          await Lead.create({
            first_name: enriched.first_name || p.first_name || 'Unknown',
            last_name: enriched.last_name || (p.last_name_obfuscated || '').replace(/\*/g, '') || '',
            email: email,
            company: enriched.organization?.name || p.organization?.name || '',
            title: enriched.title || p.title || '',
            linkedin_url: enriched.linkedin_url || p.linkedin_url || null,
            industry: enriched.organization?.industry || p.organization?.industry || null,
            company_size: enriched.organization?.estimated_num_employees || p.organization?.estimated_num_employees || null,
            vertical: verticalGuess,
            lead_source: 'api',
            lead_source_type: 'cold',
            campaign_id: campaign.id,
            tier: 2,
            outreach_status: 'ACTIVE',
            sequence_stage: 1,
            pipeline_stage: 'new_lead',
            temperature: 'cold',
            lead_score: 50,
            priority_score: 0,
            status: 'active',
            notes: { apollo_id: p.id, apollo_pulled_at: new Date().toISOString(), source: 'apollo', market: market.name },
          } as any);
          stats.created++;
          collected++;
          stats.details.push(`+ ${enriched.first_name} ${enriched.last_name} | ${enriched.title} | ${enriched.organization?.name}`);
        } catch (e) {
          stats.errors++;
          logger.warn('Failed to create Apollo lead', { error: (e as Error).message, email });
        }
      }
      page++;
    }
  }

  await incrementCreditCounter(stats.credits_used);
  logger.info('Apollo lead pull complete', { campaignId, ...stats, details: undefined });
  return stats;
}
