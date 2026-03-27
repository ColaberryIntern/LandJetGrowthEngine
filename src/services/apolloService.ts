import { logger } from '../config/logger';

export interface ApolloEnrichmentResult {
  success: boolean;
  data?: {
    company_size?: number;
    industry?: string;
    technology_stack?: string[];
    annual_revenue?: number;
    linkedin_url?: string;
  };
  error?: string;
}

/**
 * Enrich a lead with data from Apollo API.
 */
export async function enrichLead(email: string): Promise<ApolloEnrichmentResult> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'APOLLO_API_KEY not configured' };
  }

  try {
    const response = await fetch('https://api.apollo.io/v1/people/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ api_key: apiKey, email }),
    });

    if (!response.ok) {
      return { success: false, error: `Apollo API error: ${response.status}` };
    }

    const result = (await response.json()) as any;
    const person = result.person;

    if (!person) {
      return { success: false, error: 'No match found' };
    }

    return {
      success: true,
      data: {
        company_size: person.organization?.estimated_num_employees,
        industry: person.organization?.industry,
        technology_stack: person.organization?.technology_names?.slice(0, 10),
        annual_revenue: person.organization?.annual_revenue,
        linkedin_url: person.linkedin_url,
      },
    };
  } catch (error) {
    logger.error('Apollo enrichment failed', { error: (error as Error).message });
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Batch enrich multiple leads.
 */
export async function enrichBatch(emails: string[]): Promise<Map<string, ApolloEnrichmentResult>> {
  const results = new Map<string, ApolloEnrichmentResult>();

  // Rate limit: 1 request per second
  for (const email of emails) {
    results.set(email, await enrichLead(email));
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return results;
}
