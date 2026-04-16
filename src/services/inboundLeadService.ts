import { Lead } from '../models/Lead';
import { logger } from '../config/logger';

export interface QuoteRequest {
  lead_id?: number;
  name: string;
  email: string;
  company?: string;
  message?: string;
  service_type?: string;
  pickup_city?: string;
  dropoff_city?: string;
  passengers?: number;
  date?: string;
}

export interface QuoteResponse {
  subject: string;
  body: string;
  lead_id: number | null;
}

/**
 * Generate an AI-drafted quote response for an inbound lead inquiry.
 */
export async function generateQuoteResponse(request: QuoteRequest): Promise<QuoteResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI API key not configured');

  // Find or create lead
  let leadId: number | null = null;
  if (request.lead_id) {
    leadId = request.lead_id;
  } else if (request.email) {
    const existing = await Lead.findOne({ where: { email: request.email.toLowerCase() } });
    if (existing) {
      leadId = existing.id;
    } else {
      const lead = await Lead.create({
        first_name: request.name?.split(' ')[0] || 'Unknown',
        last_name: request.name?.split(' ').slice(1).join(' ') || '',
        email: request.email.toLowerCase(),
        company: request.company || null,
        phone: null, title: null, industry: null, company_size: null,
        annual_revenue: null, linkedin_url: null,
        lead_source: 'inbound', lead_source_type: 'warm',
        temperature: 'warm', pipeline_stage: 'new_lead',
        lifecycle_stage: null, notes: null, technology_stack: null,
        utm_source: null, interest_area: request.service_type || null,
        status: 'active', lead_score: 50,
      });
      leadId = lead.id;
      logger.info('Inbound lead created', { leadId, email: request.email });
    }
  }

  const context = [
    `Inquiry from: ${request.name || 'Unknown'}`,
    request.company ? `Company: ${request.company}` : null,
    request.message ? `Their message: "${request.message}"` : null,
    request.service_type ? `Service requested: ${request.service_type}` : null,
    request.pickup_city ? `Pickup: ${request.pickup_city}` : null,
    request.dropoff_city ? `Dropoff: ${request.dropoff_city}` : null,
    request.passengers ? `Passengers: ${request.passengers}` : null,
    request.date ? `Requested date: ${request.date}` : null,
  ].filter(Boolean).join('\n');

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are drafting a response as Ryan Landry, CEO of LandJet, a premium ground transportation company. LandJet provides executive-level chauffeured transportation for business travel, with a fleet of luxury vehicles.

When responding to inquiries:
- Be warm, professional, and responsive
- If they asked about pricing, provide a general range and offer to put together a custom quote
- If they asked about service areas, mention LandJet serves major business corridors across multiple cities
- Always offer to schedule a brief call to understand their needs
- Keep the response under 150 words
- Sign off as Ryan

Return JSON with "subject" and "body" fields only. Plain text body, no HTML.`,
          },
          { role: 'user', content: context },
        ],
        temperature: 0.7,
        max_tokens: 512,
      }),
    });

    if (!response.ok) throw new Error('AI generation failed');

    const data = (await response.json()) as any;
    const raw = (data.choices?.[0]?.message?.content || '').trim();
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    try {
      const parsed = JSON.parse(cleaned);
      return { subject: parsed.subject || 'Re: Your LandJet Inquiry', body: parsed.body || cleaned, lead_id: leadId };
    } catch {
      return { subject: 'Re: Your LandJet Inquiry', body: cleaned, lead_id: leadId };
    }
  } catch (error) {
    logger.error('Failed to generate quote response', { error: (error as Error).message });
    throw error;
  }
}
