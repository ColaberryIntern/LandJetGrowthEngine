/**
 * Outreach query service.
 * Consolidated: uses Lead model instead of Contact.
 * Existing backend services (draftService, sequenceEngineService) available via campaign routes.
 */

import { Op } from 'sequelize';
import { Lead } from '../models/Lead';
import { Campaign } from '../models/Campaign';
import { SystemSetting } from '../models/SystemSetting';

// --- Variable Interpolation ---

/**
 * Replace {{variable_name}} placeholders with values from a variables map.
 */
export function interpolateVariables(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => variables[key] || match);
}

/**
 * Get global variables shared across all campaigns.
 */
export async function getGlobalVariables(): Promise<Record<string, string>> {
  try {
    const row = await SystemSetting.findByPk('outreach.global_variables');
    if (row) return row.value as any;
  } catch {}
  return {};
}

/**
 * Merge global + campaign + lead variables into a single map.
 */
export async function mergeVariables(lead: Lead, campaign?: any): Promise<Record<string, string>> {
  const globalVars = await getGlobalVariables();
  const campaignVars = campaign?.settings?.variables || {};
  const leadVars: Record<string, string> = {
    first_name: lead.first_name || '',
    last_name: lead.last_name || '',
    company: lead.company || '',
    email: lead.email || '',
    title: lead.title || '',
    vertical: lead.vertical || '',
  };
  return { ...globalVars, ...campaignVars, ...leadVars };
}

// --- Settings (global defaults, overridden by campaign settings) ---

export interface OutreachSettings {
  emails_per_day: number;
  follow_up_delay_days: number;
  ai_drafts_enabled: boolean;
  sender_name: string;
  sender_role: string;
  sender_email: string;
}

const DEFAULTS: OutreachSettings = {
  emails_per_day: 20,
  follow_up_delay_days: 4,
  ai_drafts_enabled: true,
  sender_name: 'Ryan Landry',
  sender_role: 'CEO, LandJet',
  sender_email: 'rmlandry29@gmail.com',
};

export async function getOutreachSettings(): Promise<OutreachSettings> {
  try {
    const row = await SystemSetting.findByPk('outreach.settings');
    if (!row) return { ...DEFAULTS };
    const val = row.value as any;
    return {
      emails_per_day: val.emails_per_day ?? DEFAULTS.emails_per_day,
      follow_up_delay_days: val.follow_up_delay_days ?? DEFAULTS.follow_up_delay_days,
      ai_drafts_enabled: val.ai_drafts_enabled ?? DEFAULTS.ai_drafts_enabled,
      sender_name: val.sender_name ?? DEFAULTS.sender_name,
      sender_role: val.sender_role ?? DEFAULTS.sender_role,
      sender_email: val.sender_email ?? DEFAULTS.sender_email,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function updateOutreachSettings(updates: Partial<OutreachSettings>): Promise<OutreachSettings> {
  const current = await getOutreachSettings();
  const merged: OutreachSettings = { ...current, ...updates };
  await SystemSetting.upsert({ key: 'outreach.settings', value: merged as any, description: 'Outreach system controls' });
  return merged;
}

// --- Priority Scoring ---

export function computePriorityScore(lead: Lead): number {
  let score = 0;

  switch (lead.sequence_stage) {
    case 1: score += 3; break;
    case 2: score += 2; break;
    case 3: score += 1; break;
  }

  if (lead.last_contacted_at === null) score += 3;

  switch (lead.tier) {
    case 1: score += 5; break;
    case 2: score += 3; break;
    case 3: score += 1; break;
  }

  return score;
}

// --- Message Context ---

export function getMessageContext(lead: Lead): string {
  switch (lead.vertical) {
    case 'MANUFACTURING':
      return 'Replace your shuttle program with a mobile boardroom for your team.';
    case 'INSURANCE':
      return 'Enable your team to handle client conversations and prep work during travel.';
    case 'HEALTHCARE':
      return 'Support your physicians and teams with productive travel between locations.';
    default:
      return 'Reconnecting and exploring how we can support your team\'s travel needs.';
  }
}

// --- Draft Generation ---

export const VERTICAL_PROMPTS: Record<string, string> = {
  MANUFACTURING: 'Write a short outreach email focused on ROI and productivity. The prospect runs a multi-facility manufacturing operation. Position LandJet as a mobile boardroom that replaces shuttle programs and eliminates productivity loss during executive travel between plants.',
  INSURANCE: 'Write a short outreach email focused on client readiness. The prospect is an insurance broker who travels 150-300 mile corridors regularly. Position LandJet as enabling confidential client conversations and meeting prep during travel time.',
  HEALTHCARE: 'Write a short outreach email focused on efficiency and coordination. The prospect works in a multi-location medical practice. Position LandJet as supporting physician and staff travel between facilities with productive, reliable transport.',
};

export const DEFAULT_PROMPT = 'Write a short, professional outreach email reconnecting with a past client about premium ground transportation services.';

export interface EmailDraft {
  subject: string;
  body: string;
  prompt: string;
  source: 'ai' | 'template';
}

function templateDraft(name: string, context: string, prompt: string, senderName: string): EmailDraft {
  const firstName = senderName.split(' ')[0];
  return {
    subject: 'Quick note',
    body: `Hi ${name},\n\n${context}\n\nLet me know if it makes sense to reconnect.\n\nBest,\n${firstName}`,
    prompt,
    source: 'template',
  };
}

async function generateAIDraft(
  name: string, company: string | null, context: string, prompt: string,
  senderName: string, senderRole: string,
): Promise<{ subject: string; body: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const senderFirstName = senderName.split(' ')[0];
  const userContent = [
    `Recipient name: ${name}`,
    company ? `Company: ${company}` : null,
    `Context: ${context}`,
    `Prompt: ${prompt}`,
  ].filter(Boolean).join('\n');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'gpt-4o',
        messages: [
          { role: 'system', content: `You are writing as ${senderName}, ${senderRole}. Write a concise, high-quality outbound email. Keep it under 120 words. Be specific, not generic. Match the tone of the prompt. Return JSON with "subject" and "body" fields only. The body should be plain text, not HTML. Sign off as ${senderFirstName}.` },
          { role: 'user', content: userContent },
        ],
        temperature: 0.7,
        max_tokens: 512,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    if (!response.ok) return null;

    const data = (await response.json()) as any;
    const raw = (data.choices?.[0]?.message?.content || '').trim();
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const subject = (parsed.subject || '').trim();
    const body = (parsed.body || '').trim();
    if (!subject || !body) return null;
    return { subject, body };
  } catch {
    return null;
  }
}

function getPromptForLead(lead: Lead): string {
  const campaign = lead.campaign as any;
  if (campaign) {
    const steps = campaign.sequence_steps || [];
    const stepMatch = steps.find((s: any) => s.step === lead.sequence_stage);
    if (stepMatch?.prompt) return stepMatch.prompt;
    if (campaign.ai_system_prompt) return campaign.ai_system_prompt;
  }
  return VERTICAL_PROMPTS[lead.vertical || ''] || DEFAULT_PROMPT;
}

export async function generateDraft(lead: Lead, campaignPrompt?: string | null): Promise<EmailDraft> {
  const name = lead.first_name || lead.email;
  const rawPrompt = campaignPrompt || getPromptForLead(lead);
  const context = getMessageContext(lead);

  const campaignSettings = lead.campaign?.settings as any;
  const globalSettings = await getOutreachSettings();

  // Merge all variables and interpolate the prompt
  const vars = await mergeVariables(lead, lead.campaign);
  const prompt = interpolateVariables(rawPrompt, vars);

  const senderName = campaignSettings?.sender_name || globalSettings.sender_name;
  const senderRole = campaignSettings?.sender_role || globalSettings.sender_role;
  const aiEnabled = campaignSettings?.ai_drafts_enabled ?? globalSettings.ai_drafts_enabled ?? (process.env.USE_AI_DRAFTS === 'true');

  if (aiEnabled) {
    const aiResult = await generateAIDraft(name, lead.company, context, prompt, senderName, senderRole);
    if (aiResult) {
      return { subject: aiResult.subject, body: aiResult.body, prompt, source: 'ai' };
    }
  }

  return templateDraft(name, context, prompt, senderName);
}

// --- Lead Queries ---

export async function getLeadsForToday(): Promise<Lead[]> {
  const settings = await getOutreachSettings();

  const leads = await Lead.findAll({
    where: {
      outreach_status: 'ACTIVE',
      status: 'active',
      [Op.or]: [
        { next_action_at: null },
        { next_action_at: { [Op.lte]: new Date() } },
      ],
    },
    include: [{ model: Campaign, as: 'outreachCampaign', attributes: ['id', 'name', 'ai_system_prompt', 'settings', 'sequence_steps'], required: false }],
    limit: 200,
    order: [['created_at', 'ASC']],
  });

  for (const lead of leads) {
    lead.priority_score = computePriorityScore(lead);
  }

  leads.sort((a, b) => {
    if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
    return a.created_at.getTime() - b.created_at.getTime();
  });

  return leads.slice(0, settings.emails_per_day);
}

// Keep old name as alias for backward compatibility
export const getContactsForToday = getLeadsForToday;

// --- Lead Actions ---

export async function advanceLead(leadId: string): Promise<Lead | null> {
  const lead = await Lead.findByPk(parseInt(leadId, 10), {
    include: [{ model: Campaign, as: 'outreachCampaign', attributes: ['id', 'settings', 'sequence_steps'], required: false }],
  });
  if (!lead) return null;

  if (lead.outreach_status === 'COMPLETED') {
    throw new Error('Cannot advance a completed contact');
  }

  const globalSettings = await getOutreachSettings();
  const campaignSettings = lead.campaign?.settings as any;
  const steps = lead.campaign?.sequence_steps || [];

  const now = new Date();
  lead.sequence_stage += 1;
  lead.last_contacted_at = now;
  lead.pipeline_stage = 'contacted';

  if (lead.sequence_stage > 3) {
    lead.outreach_status = 'COMPLETED';
    lead.next_action_at = null;
  } else {
    const nextStep = steps.find((s: any) => s.step === lead.sequence_stage);
    const delayDays = nextStep?.delay_days ?? campaignSettings?.follow_up_delay_days ?? globalSettings.follow_up_delay_days;
    lead.next_action_at = new Date(now.getTime() + delayDays * 24 * 60 * 60 * 1000);
  }

  await lead.save();
  return lead;
}

// Keep old name as alias
export const advanceContact = advanceLead;

export async function skipLead(leadId: string): Promise<Lead | null> {
  const lead = await Lead.findByPk(parseInt(leadId, 10));
  if (!lead) return null;
  lead.next_action_at = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await lead.save();
  return lead;
}

export const skipContact = skipLead;
