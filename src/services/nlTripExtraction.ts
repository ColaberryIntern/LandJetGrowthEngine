/**
 * nlTripExtraction.ts
 * Extract structured trip details from a FREE-FORM (natural-language) booking
 * email using the LLM, so requests that are not in the rigid BookRides format
 * ("please book me an 8-seater Monday from Dallas to DFW") can still be priced.
 *
 * Fail-soft: any error, timeout, or "not a booking" answer returns null so the
 * caller falls back to manual. Never throws.
 */
import { logger } from '../config/logger';
import { recordLlmUsage } from './aiCost';

export interface ExtractedTrip {
  is_booking_request: boolean;
  passenger_name: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  service_type: string | null; // one_way | round_trip | hourly
  date_of_service: string | null;
  passengers: number | null;
  vehicle: string | null;
  notes: string | null;
}

export async function extractTripFromText(body: string): Promise<ExtractedTrip | null> {
  const text = (body || '').trim();
  if (!text) return null;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You extract ground-transportation booking details from a free-form email, which may be an ENTIRE ' +
              'email THREAD with several messages and quoted history. Consider the WHOLE conversation, not just the ' +
              'latest message: the pickup, dropoff, date, and passenger count may each appear in different messages ' +
              '(e.g. a pickup given first, a dropoff added in a later reply). Assemble the most complete and most ' +
              'RECENT trip from everything provided; if a detail was revised later in the thread, prefer the newer value. ' +
              'Return ONLY JSON with these keys: is_booking_request (boolean), passenger_name, pickup_address, ' +
              'dropoff_address, service_type ("one_way"|"round_trip"|"hourly"|null), date_of_service, passengers (integer|null), ' +
              'vehicle, notes. Set is_booking_request=true whenever the sender wants a price, quote, estimate, or booking ' +
              'for a point-to-point trip -- EVEN IF the message is informal, arrives through a sales lead or contact form, ' +
              'gives only a rough idea, or has no firm dates. Set is_booking_request=false only when no trip is being ' +
              'requested at all (an invoice, an automated receipt, a reply continuing an already-quoted thread, or a ' +
              'general question with no origin/destination). Use null for anything you cannot determine. ' +
              'Do NOT invent addresses or dates.',
          },
          { role: 'user', content: text.slice(0, 14000) },
        ],
        temperature: 0,
        max_tokens: 300,
      }),
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as any;
    recordLlmUsage({ source: 'nl_extraction', usage: data.usage });
    const raw = (data.choices?.[0]?.message?.content || '').trim();
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const p = JSON.parse(cleaned);
    if (!p || p.is_booking_request !== true) return null;
    return {
      is_booking_request: true,
      passenger_name: typeof p.passenger_name === 'string' ? p.passenger_name : null,
      pickup_address: typeof p.pickup_address === 'string' ? p.pickup_address : null,
      dropoff_address: typeof p.dropoff_address === 'string' ? p.dropoff_address : null,
      service_type: typeof p.service_type === 'string' ? p.service_type : null,
      date_of_service: typeof p.date_of_service === 'string' ? p.date_of_service : null,
      passengers: Number.isFinite(p.passengers) ? Math.trunc(p.passengers) : null,
      vehicle: typeof p.vehicle === 'string' ? p.vehicle : null,
      notes: typeof p.notes === 'string' ? p.notes : null,
    };
  } catch (e) {
    logger.warn('NL trip extraction failed (non-fatal)', { error: (e as Error).message });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
