/**
 * outreachFeedbackService.ts
 * The "tell us what's wrong and we fix it" layer for the Outreach page -- the
 * Reservations feedback loop adapted for free-form sender feedback.
 *
 * Ryan reports an issue in his own words ("messages are too long", "stop saying
 * boardroom", "don't contact this person"). An LLM triages the free text into
 * exactly one bounded action; safe/reversible actions are applied immediately,
 * anything ambiguous or risky is held as needs_review. Every submission is
 * stored as training data + audit trail, and a confirmation email is sent so
 * the sender (and Ali) see what changed -- closing the loop Ryan used to get by
 * hand over WhatsApp.
 *
 * FAILURE MODES & HANDLING:
 * - LLM upstream down / timeout / unparseable / no OPENAI_API_KEY:
 *     triage degrades gracefully to needs_review; nothing is auto-applied,
 *     the submission is still stored, the email still goes out.
 * - LLM returns an unknown / unsafe action, or an action needing a contact_id
 *     we don't have: coerced to needs_review (never trust the model blindly).
 * - Apply step throws (e.g. block on a missing contact): caught, row stored as
 *     status=failed, email reports the failure; the request still returns 200.
 * - Confirmation email (Graph) fails: best-effort, logged, never fails the
 *     request -- the fix has already been applied and persisted.
 * - Concurrent / double submit: feedback rows are an append-only audit (two
 *     submits = two rows by design); the side effects are idempotent --
 *     add_guardrail de-dupes identical lines, update_setting upserts.
 */
import { logger } from '../config/logger';
import { OutreachFeedback } from '../models/OutreachFeedback';
import { Lead, Campaign } from '../models';
import {
  getOutreachSettings,
  updateOutreachSettings,
  blockLead,
  type OutreachSettings,
} from './outreachQueryService';
import { sendSystemEmail } from './outreachEmailService';

const ALI_EMAIL = 'ali@colaberry.com';
const TRIAGE_TIMEOUT_MS = 15000;
const MIN_CONFIDENCE = 0.55;

/** Settings keys the triage layer is allowed to change without human review. */
const SETTING_ALLOWLIST = ['sender_name', 'sender_role', 'email_signature', 'emails_per_day', 'follow_up_delay_days'] as const;
type AllowedSettingKey = typeof SETTING_ALLOWLIST[number];

export type TriageAction = 'add_guardrail' | 'update_setting' | 'block_contact' | 'reassign_campaign' | 'needs_review';

export interface TriageResult {
  action: TriageAction;
  params: Record<string, unknown>;
  summary: string;       // one-line plain-language description of the intended change
  confidence: number;    // 0..1
}

export interface OutreachFeedbackInput {
  contactId?: string | null;
  category: string;
  comment?: string;
  createdBy?: string | null;
}

export interface OutreachFeedbackResult {
  stored: true;
  status: 'applied' | 'needs_review' | 'failed';
  applied: string | null;   // plain-language summary shown back to the operator
}

/**
 * Ask the LLM to map free-form feedback to one bounded action. Returns a
 * needs_review result on any failure -- this function never throws.
 */
export async function triageOutreachFeedback(
  category: string,
  comment: string,
  hasContact: boolean,
): Promise<TriageResult> {
  const fallback: TriageResult = { action: 'needs_review', params: {}, summary: 'Held for Ali to review.', confidence: 1 };
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallback;
  if (!comment.trim() && category === 'other') return fallback;

  const system = [
    'You triage feedback about an outbound sales-outreach system into exactly ONE action.',
    'Return ONLY JSON: { "action": string, "params": object, "summary": string, "confidence": number }.',
    'Allowed actions:',
    '- "add_guardrail": a voice/style/wording rule for future emails (too long, too salesy, stop/avoid a word, be warmer, shorter, etc.). params: { "guardrail": "<concise imperative rule, one sentence>" }.',
    `- "update_setting": change one setting. params: { "key": one of [${SETTING_ALLOWLIST.join(', ')}], "value": string|number }. Use for signature, sender name/title, emails per day, follow-up delay.`,
    '- "block_contact": stop contacting the specific person this feedback is about. params: {}. ONLY valid when a contact is in context.',
    '- "reassign_campaign": move the in-context contact to a different campaign. params: { "campaign_name": "<name>" }. ONLY valid when a contact is in context.',
    '- "needs_review": anything ambiguous, risky, broad, or not covered above. params: {}.',
    'Prefer add_guardrail for wording/tone/length complaints. Prefer needs_review when unsure. confidence is your certainty 0..1.',
    `A contact ${hasContact ? 'IS' : 'is NOT'} in context for this feedback.`,
  ].join('\n');

  const user = `Category: ${category}\nFeedback: ${comment || '(none)'}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TRIAGE_TIMEOUT_MS);
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'gpt-4o',
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0.2,
        max_tokens: 300,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) {
      logger.warn('outreach feedback triage upstream non-200', { status: resp.status });
      return fallback;
    }
    const data = (await resp.json()) as any;
    const raw = (data.choices?.[0]?.message?.content || '').trim();
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned) as Partial<TriageResult>;
    const result = coerceTriage(parsed, hasContact);
    if (result.confidence < MIN_CONFIDENCE) return fallback;
    return result;
  } catch (err) {
    logger.warn('outreach feedback triage failed', { error: (err as Error).message });
    return fallback;
  }
}

/** Validate/normalize the model's JSON; downgrade anything unsafe to needs_review. */
function coerceTriage(parsed: Partial<TriageResult>, hasContact: boolean): TriageResult {
  const action = parsed.action as TriageAction;
  const params = (parsed.params && typeof parsed.params === 'object') ? parsed.params : {};
  const summary = typeof parsed.summary === 'string' ? parsed.summary : '';
  const confidence = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0;
  const review: TriageResult = { action: 'needs_review', params: {}, summary: summary || 'Held for Ali to review.', confidence: 1 };

  if (action === 'add_guardrail') {
    const g = String((params as any).guardrail || '').trim();
    return g ? { action, params: { guardrail: g }, summary: summary || `Add guidance: ${g}`, confidence } : review;
  }
  if (action === 'update_setting') {
    const key = String((params as any).key || '') as AllowedSettingKey;
    if (!SETTING_ALLOWLIST.includes(key)) return review;
    const value = (params as any).value;
    if (value === undefined || value === null || value === '') return review;
    return { action, params: { key, value }, summary: summary || `Update ${key}`, confidence };
  }
  if (action === 'block_contact') {
    return hasContact ? { action, params: {}, summary: summary || 'Stop contacting this person.', confidence } : review;
  }
  if (action === 'reassign_campaign') {
    const cn = String((params as any).campaign_name || '').trim();
    return hasContact && cn ? { action, params: { campaign_name: cn }, summary: summary || `Move to campaign: ${cn}`, confidence } : review;
  }
  return review;
}

/** Apply a triaged action. Returns the plain-language result + final status. */
async function applyTriage(
  triage: TriageResult,
  contactId: string | null,
  settings: OutreachSettings,
): Promise<{ status: OutreachFeedbackResult['status']; applied: string }> {
  try {
    switch (triage.action) {
      case 'add_guardrail': {
        const rule = String(triage.params.guardrail).trim();
        const existing = settings.draft_guardrails || '';
        const lines = existing.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.some(l => l.toLowerCase() === rule.toLowerCase())) {
          return { status: 'applied', applied: `That guidance was already in place: "${rule}"` };
        }
        const next = [...lines, rule].join('\n');
        await updateOutreachSettings({ draft_guardrails: next });
        return { status: 'applied', applied: `Added a new writing rule to every future draft: "${rule}"` };
      }
      case 'update_setting': {
        const key = triage.params.key as AllowedSettingKey;
        let value = triage.params.value as string | number;
        if (key === 'emails_per_day' || key === 'follow_up_delay_days') {
          const n = Number(value);
          if (!Number.isFinite(n) || n < 0) return { status: 'needs_review', applied: `Could not apply ${key}: "${value}" is not a valid number. Held for review.` };
          value = Math.round(n);
        }
        await updateOutreachSettings({ [key]: value } as Partial<OutreachSettings>);
        return { status: 'applied', applied: `Updated ${key} to "${value}".` };
      }
      case 'block_contact': {
        if (!contactId) return { status: 'needs_review', applied: 'No specific contact was attached, so nothing was blocked. Held for review.' };
        const r = await blockLead(contactId, 'feedback_block');
        if (!r) return { status: 'failed', applied: 'Tried to block the contact but could not find it.' };
        return { status: 'applied', applied: 'Stopped all future outreach to this contact and added them to the do-not-contact list.' };
      }
      case 'reassign_campaign': {
        if (!contactId) return { status: 'needs_review', applied: 'No specific contact was attached, so nothing was reassigned. Held for review.' };
        const name = String(triage.params.campaign_name).trim();
        const result = await reassignContactCampaign(contactId, name);
        return result;
      }
      default:
        return { status: 'needs_review', applied: triage.summary || 'Logged for Ali to review.' };
    }
  } catch (err) {
    logger.error('outreach feedback apply failed', { action: triage.action, error: (err as Error).message });
    return { status: 'failed', applied: `Tried to apply the change but hit an error: ${(err as Error).message}` };
  }
}

/**
 * Minimal, reversible campaign reassignment: resolve the campaign by name and
 * point the contact at it, resetting to the first step so the new sequence runs
 * cleanly. Drafts are generated on read, so they pick up the new campaign next
 * time the queue loads. If the campaign name can't be resolved, hold for review
 * rather than guess.
 */
async function reassignContactCampaign(
  contactId: string,
  campaignName: string,
): Promise<{ status: OutreachFeedbackResult['status']; applied: string }> {
  const lead = await Lead.findByPk(contactId);
  if (!lead) return { status: 'failed', applied: 'Tried to reassign the contact but could not find it.' };

  const campaigns = await Campaign.findAll({ attributes: ['id', 'name'] });
  const match = campaigns.find(c => String(c.name || '').toLowerCase() === campaignName.toLowerCase())
    || campaigns.find(c => String(c.name || '').toLowerCase().includes(campaignName.toLowerCase()));
  if (!match) {
    return { status: 'needs_review', applied: `Could not find a campaign matching "${campaignName}", so the contact was left where it is. Held for review.` };
  }

  (lead as any).campaign_id = match.id;
  (lead as any).sequence_stage = 1;
  (lead as any).next_action_at = new Date();
  await lead.save();
  return { status: 'applied', applied: `Moved this contact to the "${match.name}" campaign and reset it to the first step.` };
}

/**
 * Record outreach feedback, triage it, apply any safe correction, store the
 * row, and email a confirmation. Never throws on triage/apply/email failure --
 * the worst case is a stored needs_review row plus a best-effort email.
 */
export async function submitOutreachFeedback(input: OutreachFeedbackInput): Promise<OutreachFeedbackResult> {
  const contactId = input.contactId ? String(input.contactId) : null;
  const comment = input.comment || '';
  const settings = await getOutreachSettings();

  const triage = await triageOutreachFeedback(input.category, comment, !!contactId);
  const { status, applied } = await applyTriage(triage, contactId, settings);

  await OutreachFeedback.create({
    contact_id: contactId,
    category: input.category,
    comment: comment || null,
    triage: triage as unknown as Record<string, unknown>,
    action: triage.action,
    applied,
    status,
    created_by: input.createdBy || null,
  } as any);

  logger.info('outreach feedback recorded', { category: input.category, action: triage.action, status, contactId });

  // Best-effort confirmation email -- failure must not fail the request.
  notifyFeedbackOutcome(input, applied, status, settings).catch(err =>
    logger.warn('outreach feedback notify failed', { error: (err as Error).message }),
  );

  return { stored: true, status, applied };
}

/** Compose + send the "here's what we changed" email to Ryan, cc Ali. */
async function notifyFeedbackOutcome(
  input: OutreachFeedbackInput,
  applied: string,
  status: OutreachFeedbackResult['status'],
  settings: OutreachSettings,
): Promise<void> {
  const ryan = settings.sender_email;
  const to = settings.test_mode ? settings.test_email : ryan;
  const cc = settings.test_mode ? null : ALI_EMAIL;

  const headline = status === 'applied'
    ? 'We made the change you reported'
    : status === 'needs_review'
      ? 'Thanks - this one is queued for review'
      : 'We hit a snag applying your change';

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#2d3748;max-width:560px;">
      <h2 style="color:#1a365d;font-size:18px;margin:0 0 12px;">${headline}</h2>
      <p style="margin:0 0 8px;">You reported an issue on the Outreach page${input.contactId ? ` (contact ${escapeHtml(String(input.contactId))})` : ''}:</p>
      <blockquote style="margin:0 0 16px;padding:8px 12px;background:#f7fafc;border-left:3px solid #2b6cb0;">
        <strong>${escapeHtml(input.category)}</strong>${input.comment ? `<br>${escapeHtml(input.comment)}` : ''}
      </blockquote>
      <p style="margin:0 0 8px;"><strong>${status === 'applied' ? 'What we changed:' : 'Status:'}</strong></p>
      <p style="margin:0 0 16px;">${escapeHtml(applied)}</p>
      ${status === 'needs_review' ? '<p style="margin:0 0 16px;color:#718096;font-size:13px;">Ali has been copied and will follow up on anything that needs a human decision.</p>' : ''}
      <p style="margin:0;color:#718096;font-size:12px;">LandJet Outreach - automated change log${settings.test_mode ? ' (test mode)' : ''}</p>
    </div>`;

  await sendSystemEmail({
    from: ryan,
    to,
    cc,
    subject: `Outreach update: ${headline}`,
    html,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
