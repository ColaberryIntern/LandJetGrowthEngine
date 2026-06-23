import { Lead } from '../models/Lead';
import { logger } from '../config/logger';
import { recordAgentRun } from '../intelligence/agents/agentRegistry';
import { processInboundEmail, InboundProcessResult } from './inboundQuoteEngine';
import { QuoteOutput } from './landjetPricing';
import { FaqMatch } from './landjetFaqService';
import { validateAiQuoteBody, renderTemplateQuoteBody, QuoteContextForGuard } from './quoteResponseGuard';
import { recordLlmUsage } from './aiCost';

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
  // Pricing engine metadata (populated when the inbound matched a BookRides email)
  pricing_mode?: 'priced' | 'forward_only' | 'faq' | 'manual';
  market?: string;
  forward_to?: string[];
  forward_reason?: string;
  quote_summary?: {
    subtotal: number;
    grand_total: number;
    customer_category: string;
    warnings: string[];
    approvals_needed: string[];
  };
  faq_matches?: Array<{ question: string; answer: string; score: number }>;
  // True when the AI body failed the hallucination guard and the deterministic
  // template was used instead. Concierge UI can surface this as a banner
  // ("AI body was rejected -- template used; review tone before sending").
  template_fallback?: boolean;
  template_fallback_reasons?: string[];
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

  // ---------------------------------------------------------------
  // Pricing engine pre-pass: if the inbound is a BookRides email,
  // run it through the deterministic pricing engine first. The AI
  // then drafts the email AROUND the calculated numbers in Lorie's
  // voice, instead of guessing at pricing on its own.
  // ---------------------------------------------------------------
  let pricing: InboundProcessResult = { mode: 'manual', manual_reason: 'no_message' };
  if (request.message) {
    pricing = processInboundEmail(request.message, request.email);
  }

  const promptContext = buildPromptContext(request, pricing);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'gpt-4o',
        messages: [
          { role: 'system', content: buildSystemPrompt(pricing) },
          { role: 'user', content: promptContext },
        ],
        temperature: pricing.mode === 'priced' ? 0.4 : 0.7, // tighter when we have real numbers
        max_tokens: 700,
      }),
    });

    if (!response.ok) throw new Error('AI generation failed');

    const data = (await response.json()) as any;
    recordLlmUsage({ source: 'inbound_lead_quote', usage: data.usage });
    const raw = (data.choices?.[0]?.message?.content || '').trim();
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    let parsedSubject = 'Re: Your LandJet Inquiry';
    let parsedBody = cleaned;
    try {
      const parsed = JSON.parse(cleaned);
      parsedSubject = parsed.subject || parsedSubject;
      parsedBody = parsed.body || cleaned;
    } catch {
      // fall through with cleaned text as body
    }

    recordAgentRun('quote_generator', {
      leadId,
      pricing_mode: pricing.mode,
      market: pricing.market,
    }).catch(() => {});

    const result: QuoteResponse = {
      subject: parsedSubject,
      body: parsedBody,
      lead_id: leadId,
      pricing_mode: pricing.mode,
      market: pricing.market,
      forward_to: pricing.forward_to,
      forward_reason: pricing.forward_reason,
    };
    if (pricing.mode === 'priced' && pricing.quote) {
      result.quote_summary = summarizeQuote(pricing.quote);

      // Hallucination guard. Only enforced for priced mode because that's
      // where wrong numbers can hit a customer. forward_only / faq / manual
      // are lower-risk surfaces.
      const guardCtx: QuoteContextForGuard = {
        customer_name: request.name,
        pickup_address: pricing.trip?.pickup_address,
        dropoff_address: pricing.trip?.dropoff_address,
        date_of_service: pricing.trip?.date_of_service,
      };
      const verdict = validateAiQuoteBody(parsedBody, pricing.quote, guardCtx);
      if (!verdict.ok) {
        logger.warn('AI quote body rejected by hallucination guard; using template fallback', {
          leadId,
          reasons: verdict.reasons,
          ai_body_first_200: parsedBody.slice(0, 200),
        });
        recordAgentRun('quote_generator_guard', {
          leadId,
          rejected: true,
          reasons: verdict.reasons,
        }).catch(() => {});
        const fallback = renderTemplateQuoteBody(pricing.quote, guardCtx);
        result.subject = fallback.subject;
        result.body = fallback.body;
        result.template_fallback = true;
        result.template_fallback_reasons = verdict.reasons;
      }
    }
    if (pricing.mode === 'faq' && pricing.faq_matches) {
      result.faq_matches = pricing.faq_matches.map(m => ({
        question: m.entry.question,
        answer: m.entry.answer,
        score: m.score,
      }));
    }
    return result;
  } catch (error) {
    recordAgentRun('quote_generator', undefined, 'failed', (error as Error).message).catch(() => {});
    logger.error('Failed to generate quote response', { error: (error as Error).message });
    throw error;
  }
}

// =====================================================================
// PROMPT BUILDERS
// =====================================================================

function buildSystemPrompt(pricing: InboundProcessResult): string {
  if (pricing.mode === 'forward_only') {
    return `You are drafting an internal forwarding note for a LandJet concierge. The trip is in Kansas City, which the local KC team (Holly, Scott) handles directly -- LandJet AI does NOT generate KC quotes.

Your job: write a brief, professional forwarding note to send to the customer letting them know their request has been received and routed to the local Kansas City team for a custom quote. Do NOT include any pricing. Do NOT mention internal tooling.

Return JSON with "subject" and "body" fields only. Plain text body, no HTML. Sign off as the LandJet Reservations Team.`;
  }

  if (pricing.mode === 'faq') {
    return `You are answering a FAQ-style inquiry as the LandJet Reservations team (Lorie's voice -- warm, concierge style, never pushy). You will be given the customer's question AND the matching FAQ entries from the LandJet knowledge base.

Your job:
- Answer the customer's question directly using the facts in the matched FAQ(s).
- Use the EXACT facts from the FAQ -- do not invent details, do not contradict, do not add policies that aren't there.
- If multiple FAQs are relevant, weave them together in plain prose.
- Sound like a person, not a script. No "thank you for reaching out" filler.
- Keep it under 150 words.
- Sign off as the LandJet Reservations Team.

Return JSON with "subject" and "body" fields only. Plain text body, no HTML.`;
  }

  if (pricing.mode === 'priced') {
    return `You are drafting a quote response as the LandJet Reservations team (Lorie's voice -- warm, concierge style, never pushy). You will be given a structured pricing breakdown calculated by the LandJet pricing engine. You must use those EXACT numbers in your reply -- do not guess, do not round, do not invent line items.

Format the body as a clean concierge quote:
- Open with a friendly acknowledgment of the trip request (reference the date and route).
- List the line items as a simple breakdown.
- State the grand total clearly.
- If there are warnings or "needs approval" items, note them honestly ("we will confirm tolls/fuel surcharge when finalizing").
- Close with a clear next step ("reply to confirm and we'll send the booking link").
- Keep it under 200 words.

Sign off as the LandJet Reservations Team. Return JSON with "subject" and "body" fields only. Plain text body, no HTML.`;
  }

  // manual fallback -- generic AI quote (legacy behavior)
  return `You are drafting a response as Ryan Landry, CEO of LandJet, a premium ground transportation company. LandJet provides executive-level chauffeured transportation for business travel.

When responding to inquiries:
- Be warm, professional, and responsive
- If they asked about pricing, provide a general range and offer to put together a custom quote
- If they asked about service areas, mention LandJet serves major business corridors across multiple cities
- Always offer to schedule a brief call to understand their needs
- Keep the response under 150 words
- Sign off as Ryan

Return JSON with "subject" and "body" fields only. Plain text body, no HTML.`;
}

function buildPromptContext(request: QuoteRequest, pricing: InboundProcessResult): string {
  const parts: string[] = [];
  parts.push(`Inquiry from: ${request.name || 'Unknown'} <${request.email || 'no-email'}>`);
  if (request.company) parts.push(`Company: ${request.company}`);

  if (pricing.mode === 'priced' && pricing.quote && pricing.trip) {
    parts.push('');
    parts.push('=== STRUCTURED TRIP (from BookRides) ===');
    parts.push(`Passenger: ${pricing.trip.passenger_name}`);
    parts.push(`Date: ${pricing.trip.date_of_service || 'TBD'}  Time: ${pricing.trip.start_time || 'TBD'}`);
    parts.push(`Service: ${pricing.trip.service_type || 'One Way'}  Vehicle: ${pricing.trip.vehicle || 'TBD'}`);
    parts.push(`Pickup: ${pricing.trip.pickup_address || 'TBD'}`);
    parts.push(`Dropoff: ${pricing.trip.dropoff_address || 'TBD'}`);
    parts.push(`Passengers: ${pricing.trip.passengers ?? 'TBD'}  Luggage: ${pricing.trip.luggage ?? 'TBD'}`);
    parts.push('');
    parts.push('=== PRICING (calculated by LandJet engine -- USE THESE EXACT NUMBERS) ===');
    parts.push(`Market: ${pricing.market}`);
    parts.push(`Customer category: ${pricing.quote.customer_category}`);
    parts.push(`Pricing mode: ${pricing.quote.pricing_mode}`);
    parts.push('Line items:');
    pricing.quote.lines.forEach(l => {
      parts.push(`  - ${l.label}: $${l.amount.toFixed(2)}${l.note ? ` (${l.note})` : ''}`);
    });
    parts.push(`Subtotal: $${pricing.quote.subtotal.toFixed(2)}`);
    parts.push(`After tax/extras: $${pricing.quote.secondary_total.toFixed(2)}`);
    parts.push(`After gratuity: $${pricing.quote.third_total.toFixed(2)}`);
    parts.push(`GRAND TOTAL: $${pricing.quote.grand_total.toFixed(2)}`);
    if (pricing.quote.warnings.length) parts.push(`Warnings: ${pricing.quote.warnings.join('; ')}`);
    if (pricing.quote.approvals_needed.length) parts.push(`Needs approval: ${pricing.quote.approvals_needed.join('; ')}`);
  } else if (pricing.mode === 'forward_only' && pricing.trip) {
    parts.push('');
    parts.push('=== KC TRIP -- FORWARDING (no quote) ===');
    parts.push(`Passenger: ${pricing.trip.passenger_name}`);
    parts.push(`Pickup: ${pricing.trip.pickup_address}`);
    parts.push(`Dropoff: ${pricing.trip.dropoff_address}`);
    parts.push(`Forward to: ${pricing.forward_to?.join(', ')}`);
  } else if (pricing.mode === 'faq' && pricing.faq_matches?.length) {
    parts.push('');
    parts.push("=== CUSTOMER'S QUESTION ===");
    parts.push(request.message || '(no message body)');
    parts.push('');
    parts.push('=== MATCHED FAQ ENTRIES (use these facts; do not invent) ===');
    pricing.faq_matches.forEach((m, i) => {
      parts.push(`[${i + 1}] Q: ${m.entry.question}`);
      parts.push(`    A: ${m.entry.answer}`);
    });
  } else {
    if (request.message) parts.push(`Their message: "${request.message}"`);
    if (request.service_type) parts.push(`Service requested: ${request.service_type}`);
    if (request.pickup_city) parts.push(`Pickup: ${request.pickup_city}`);
    if (request.dropoff_city) parts.push(`Dropoff: ${request.dropoff_city}`);
    if (request.passengers) parts.push(`Passengers: ${request.passengers}`);
    if (request.date) parts.push(`Requested date: ${request.date}`);
  }

  return parts.join('\n');
}

function summarizeQuote(quote: QuoteOutput) {
  return {
    subtotal: quote.subtotal,
    grand_total: quote.grand_total,
    customer_category: quote.customer_category,
    warnings: quote.warnings,
    approvals_needed: quote.approvals_needed,
  };
}
