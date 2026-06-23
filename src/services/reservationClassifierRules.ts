/**
 * reservationClassifierRules.ts
 * The learned-rules store, kept dependency-free (only the model) so both the
 * ingest classifier and the feedback service can use it without an import cycle.
 * A rule is a human correction: "mail from this domain is never a quote" / "mail
 * from this address IS a quote". This is how the queue gets smarter with use.
 */
import { logger } from '../config/logger';
import { ReservationClassifierRule } from '../models/ReservationClassifierRule';

// Personal mailbox providers: a "not a quote" on one of these must NOT blacklist
// the whole domain (it would nuke real customers), so we learn the exact address.
const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com',
  'me.com', 'live.com', 'msn.com', 'comcast.net', 'att.net', 'verizon.net',
]);

function parseRule(from: string | null, decision: 'quote' | 'not_quote'): { type: 'sender_domain' | 'sender_email'; value: string } | null {
  const email = (from || '').toLowerCase().trim();
  const at = email.indexOf('@');
  if (at < 1) return null;
  const domain = email.slice(at + 1);
  if (decision === 'not_quote') {
    return PERSONAL_DOMAINS.has(domain) ? { type: 'sender_email', value: email } : { type: 'sender_domain', value: domain };
  }
  return { type: 'sender_email', value: email }; // "quote" corrections are customer-specific
}

/** Upsert a learned rule from a human correction. */
export async function learnRule(from: string | null, decision: 'quote' | 'not_quote', source: string): Promise<void> {
  const rule = parseRule(from, decision);
  if (!rule) return;
  const existing = await ReservationClassifierRule.findOne({ where: { pattern_type: rule.type, pattern_value: rule.value } as any });
  if (existing) {
    await existing.update({ decision, source, hit_count: existing.hit_count + 1, updated_at: new Date() } as any);
  } else {
    await ReservationClassifierRule.create({ pattern_type: rule.type, pattern_value: rule.value, decision, source, hit_count: 1, updated_at: new Date() } as any);
  }
  logger.info('classifier rule learned', { ...rule, decision, source });
}

/**
 * The learned decision for a sender, or null. Exact-email rules win over domain
 * rules. Consulted by the ingest classifier BEFORE its heuristic.
 */
export async function lookupClassifierDecision(from: string | null): Promise<'quote' | 'not_quote' | null> {
  const email = (from || '').toLowerCase().trim();
  const at = email.indexOf('@');
  if (at < 1) return null;
  const domain = email.slice(at + 1);
  const rules = await ReservationClassifierRule.findAll({ where: { pattern_value: [email, domain] } as any });
  const byEmail = rules.find((r) => r.pattern_type === 'sender_email' && r.pattern_value === email);
  if (byEmail) return byEmail.decision;
  const byDomain = rules.find((r) => r.pattern_type === 'sender_domain' && r.pattern_value === domain);
  return byDomain ? byDomain.decision : null;
}
