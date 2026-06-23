import { Op } from 'sequelize';
import { Lead } from '../models/Lead';
import { logger } from '../config/logger';
import { recordAgentRun } from '../intelligence/agents/agentRegistry';
import { recordLlmUsage } from './aiCost';

export interface DealSummary {
  deal_name: string;
  deal_type: string; // 'real_estate' | 'growth_equity' | 'franchise' | 'other'
  amount: string;
  description: string;
  sector?: string;
  geography?: string;
}

export interface InvestorMatch {
  lead_id: number;
  name: string;
  email: string;
  company: string | null;
  title: string | null;
  vertical: string | null;
  score: number;
  reason: string;
  draft_subject: string;
  draft_body: string;
}

/**
 * Match a deal to the best investors in the database and draft outreach.
 */
export async function matchDealToInvestors(deal: DealSummary, limit: number = 10): Promise<InvestorMatch[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI API key not configured');

  // Pull potential investor leads
  const investors = await Lead.findAll({
    where: {
      status: 'active',
      campaign_id: { [Op.ne]: null },
    },
    attributes: ['id', 'first_name', 'last_name', 'email', 'company', 'title', 'vertical', 'industry', 'lead_score'],
    order: [['lead_score', 'DESC']],
    limit: 200,
    raw: true,
  }) as any[];

  if (investors.length === 0) return [];

  // Use AI to score and match
  const investorList = investors.slice(0, 100).map(i =>
    `ID:${i.id} | ${i.first_name} ${i.last_name} | ${i.company || 'Unknown'} | ${i.title || ''} | ${i.vertical || ''} | ${i.industry || ''}`
  ).join('\n');

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a deal matching AI for MB Capital Ventures. Given a deal summary and a list of potential investors, identify the top ${limit} best matches.

For each match, provide:
- lead_id (from the list)
- score (0-100, how well they fit)
- reason (one sentence why they match)
- draft_subject (email subject for outreach about this deal)
- draft_body (personalized 3-4 sentence email from Ryan Landry pitching this deal to them. Reference their company/background. Sign off as Ryan.)

Return JSON array: [{ lead_id, score, reason, draft_subject, draft_body }]
Only return the top ${limit} matches. Sort by score descending.`,
          },
          {
            role: 'user',
            content: `DEAL:\nName: ${deal.deal_name}\nType: ${deal.deal_type}\nAmount: ${deal.amount}\nDescription: ${deal.description}\nSector: ${deal.sector || 'General'}\nGeography: ${deal.geography || 'US'}\n\nPOTENTIAL INVESTORS:\n${investorList}`,
          },
        ],
        temperature: 0.5,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) throw new Error('AI matching failed');

    const data = (await response.json()) as any;
    recordLlmUsage({ source: 'deal_matching', usage: data.usage });
    const raw = (data.choices?.[0]?.message?.content || '').trim();
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const matches = JSON.parse(cleaned);

    // Enrich with lead data
    const investorMap = new Map(investors.map(i => [i.id, i]));
    const results: InvestorMatch[] = [];

    for (const match of matches) {
      const investor = investorMap.get(match.lead_id);
      if (!investor) continue;
      results.push({
        lead_id: investor.id,
        name: `${investor.first_name} ${investor.last_name}`.trim(),
        email: investor.email,
        company: investor.company,
        title: investor.title,
        vertical: investor.vertical,
        score: match.score,
        reason: match.reason,
        draft_subject: match.draft_subject,
        draft_body: match.draft_body,
      });
    }

    recordAgentRun('deal_matcher', { deal: deal.deal_name, matches: results.length }).catch(() => {});
    logger.info('Deal matched to investors', { deal: deal.deal_name, matches: results.length });
    return results;
  } catch (error) {
    recordAgentRun('deal_matcher', undefined, 'failed', (error as Error).message).catch(() => {});
    logger.error('Deal matching failed', { deal: deal.deal_name, error: (error as Error).message });
    throw error;
  }
}
