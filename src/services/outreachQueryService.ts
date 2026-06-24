/**
 * Outreach query service.
 * Consolidated: uses Lead model instead of Contact.
 * Existing backend services (draftService, sequenceEngineService) available via campaign routes.
 */

import { Op } from 'sequelize';
import { Lead } from '../models/Lead';
import { recordLlmUsage } from './aiCost';
import { auditAction } from './auditLogService';
import { Campaign } from '../models/Campaign';
import { SystemSetting } from '../models/SystemSetting';
import { recordAgentRun } from '../intelligence/agents/agentRegistry';
import { logger } from '../config/logger';

// --- TTL Cache ---

interface CacheEntry<T> { data: T; expiresAt: number }
const CACHE_TTL = 60_000; // 60 seconds

let _settingsCache: CacheEntry<OutreachSettings> | null = null;
let _globalVarsCache: CacheEntry<Record<string, string>> | null = null;

function invalidateSettingsCache() { _settingsCache = null; }

// --- Variable Interpolation ---

/**
 * Replace {{variable_name}} placeholders with values from a variables map.
 */
export function interpolateVariables(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => variables[key] || match);
}

/**
 * Get global variables shared across all campaigns (cached 60s).
 */
export async function getGlobalVariables(): Promise<Record<string, string>> {
  if (_globalVarsCache && Date.now() < _globalVarsCache.expiresAt) return _globalVarsCache.data;
  try {
    const row = await SystemSetting.findByPk('outreach.global_variables');
    const data = row ? (row.value as any) : {};
    _globalVarsCache = { data, expiresAt: Date.now() + CACHE_TTL };
    return data;
  } catch {}
  return {};
}

/**
 * Merge global + campaign + lead variables into a single map.
 */
export async function mergeVariables(lead: Lead, campaign?: any): Promise<Record<string, string>> {
  const globalVars = await getGlobalVariables();
  const globalSettings = await getOutreachSettings();
  const campaignVars = campaign?.settings?.variables || {};
  const campSettings = campaign?.settings || {};

  // Sender comes from campaign override or global default
  const senderName = campSettings.sender_name || globalSettings.sender_name || 'Ryan Landry';
  const senderFirstName = senderName.split(' ')[0];
  const senderRole = campSettings.sender_role || globalSettings.sender_role || '';
  const senderEmail = campSettings.sender_email || globalSettings.sender_email || '';

  const senderVars: Record<string, string> = {
    sender_name: senderName,
    sender_first_name: senderFirstName,
    sender_role: senderRole,
    sender_email: senderEmail,
    sender_company: 'LandJet',
    sender_title: senderRole,
  };

  const leadVars: Record<string, string> = {
    first_name: lead.first_name || '',
    last_name: lead.last_name || '',
    company: lead.company || '',
    email: lead.email || '',
    title: lead.title || '',
    vertical: lead.vertical || '',
  };
  return { ...globalVars, ...senderVars, ...campaignVars, ...leadVars };
}

// --- Settings (global defaults, overridden by campaign settings) ---

export interface OutreachSettings {
  emails_per_day: number;
  follow_up_delay_days: number;
  ai_drafts_enabled: boolean;
  sender_name: string;
  sender_role: string;
  sender_email: string;
  email_signature: string;
  draft_guardrails: string;   // voice/style rules learned from operator feedback, injected into every draft prompt
  test_mode: boolean;
  test_email: string;
  send_days: number[];
  send_start_hour: number;
  send_end_hour: number;
  send_timezone: string;
}

const DEFAULTS: OutreachSettings = {
  emails_per_day: 20,
  follow_up_delay_days: 4,
  ai_drafts_enabled: true,
  sender_name: 'Ryan Landry',
  sender_role: 'CEO, LandJet',
  sender_email: 'rlandry@landjet.com',
  email_signature: '',
  draft_guardrails: '',
  test_mode: true,
  test_email: 'rmlandry29@gmail.com',
  send_days: [1, 2, 3, 4, 5],
  send_start_hour: 8,
  send_end_hour: 17,
  send_timezone: 'America/Chicago',
};

export async function getOutreachSettings(): Promise<OutreachSettings> {
  if (_settingsCache && Date.now() < _settingsCache.expiresAt) return _settingsCache.data;
  try {
    const row = await SystemSetting.findByPk('outreach.settings');
    if (!row) {
      const data = { ...DEFAULTS };
      _settingsCache = { data, expiresAt: Date.now() + CACHE_TTL };
      return data;
    }
    const val = row.value as any;
    const data: OutreachSettings = {
      emails_per_day: val.emails_per_day ?? DEFAULTS.emails_per_day,
      follow_up_delay_days: val.follow_up_delay_days ?? DEFAULTS.follow_up_delay_days,
      ai_drafts_enabled: val.ai_drafts_enabled ?? DEFAULTS.ai_drafts_enabled,
      sender_name: val.sender_name ?? DEFAULTS.sender_name,
      sender_role: val.sender_role ?? DEFAULTS.sender_role,
      sender_email: val.sender_email ?? DEFAULTS.sender_email,
      email_signature: val.email_signature ?? DEFAULTS.email_signature,
      draft_guardrails: val.draft_guardrails ?? DEFAULTS.draft_guardrails,
      test_mode: val.test_mode ?? DEFAULTS.test_mode,
      test_email: val.test_email ?? DEFAULTS.test_email,
      send_days: val.send_days ?? DEFAULTS.send_days,
      send_start_hour: val.send_start_hour ?? DEFAULTS.send_start_hour,
      send_end_hour: val.send_end_hour ?? DEFAULTS.send_end_hour,
      send_timezone: val.send_timezone ?? DEFAULTS.send_timezone,
    };
    _settingsCache = { data, expiresAt: Date.now() + CACHE_TTL };
    return data;
  } catch {
    return { ...DEFAULTS };
  }
}

export async function updateOutreachSettings(updates: Partial<OutreachSettings>): Promise<OutreachSettings> {
  invalidateSettingsCache();
  const current = await getOutreachSettings();
  const merged: OutreachSettings = { ...current, ...updates };
  await SystemSetting.upsert({ key: 'outreach.settings', value: merged as any, description: 'Outreach system controls' });
  invalidateSettingsCache();
  _settingsCache = { data: merged, expiresAt: Date.now() + CACHE_TTL };
  return merged;
}

export async function getSignatureForCampaign(campaign?: any): Promise<string> {
  const campaignSig = campaign?.settings?.email_signature;
  if (campaignSig) return campaignSig;
  const globalSettings = await getOutreachSettings();
  return globalSettings.email_signature || '';
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

  // Multi-location boost: companies with multiple offices/locations are higher value
  // because they likely have more cross-city travel needs
  const notes = lead.notes as any;
  if (notes) {
    const subOrgs = notes.num_suborganizations || 0;
    const retailLocations = notes.retail_location_count || 0;
    const employees = lead.company_size || 0;

    if (subOrgs >= 10 || retailLocations >= 50) {
      score += 8; // Major multi-location enterprise
    } else if (subOrgs >= 3 || retailLocations >= 5) {
      score += 5; // Mid-size multi-location
    } else if (subOrgs >= 1 || retailLocations >= 1 || employees >= 1000) {
      score += 2; // Likely has multiple offices
    }
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
  // Ryan 2026-06-08: combined vertical covering real estate developers, property management,
  // construction GCs/subs, and engineering firms. Common thread is regular travel between
  // project sites, properties, and client meetings -- the LandJet mobile-workspace angle.
  'Real Estate, Construction and Engineering': 'Write a short outreach email focused on travel between project sites, properties, and client meetings. The prospect runs site visits, property tours, or project oversight that requires regular regional travel. Position LandJet as a mobile workspace that gives back hours of productivity between stops -- calls, reviews, and team check-ins happen in the vehicle instead of waiting at a coffee shop or running back to the office.',
};

export const DEFAULT_PROMPT = 'Write a short, professional outreach email reconnecting with a past client about premium ground transportation services.';

export interface EmailDraft {
  subject: string;
  body: string;
  prompt: string;
  source: 'ai' | 'template';
  signature: string;
}

function templateDraft(name: string, context: string, prompt: string, senderName: string): EmailDraft {
  const firstName = senderName.split(' ')[0];
  return {
    subject: 'Quick note',
    body: `Hi ${name},\n\n${context}\n\nLet me know if it makes sense to reconnect.\n\nBest,\n${firstName}`,
    prompt,
    source: 'template',
    signature: '',
  };
}

async function generateAIDraft(
  name: string, company: string | null, context: string, prompt: string,
  senderName: string, senderRole: string, guardrails?: string,
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
          { role: 'system', content: `You are writing as ${senderName}, ${senderRole}. Write a concise, high-quality outbound email. Keep it under 120 words. Be specific, not generic. Match the tone of the prompt. Return JSON with "subject" and "body" fields only. The body should be plain text, not HTML. Sign off as ${senderFirstName}.${guardrails && guardrails.trim() ? `\n\nAdditional guidance you MUST follow (from the sender's own feedback):\n${guardrails.trim()}` : ''}` },
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
    recordLlmUsage({ source: 'email_draft', usage: data.usage });
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

/**
 * Get campaign data from lead (handles both 'campaign' and 'outreachCampaign' aliases).
 */
function getCampaignFromLead(lead: Lead): any {
  return lead.campaign || (lead as any).outreachCampaign || null;
}

/**
 * Get the current step info for a lead (channel, prompt, delay).
 */
export function getStepInfo(lead: Lead): { channel: string; prompt: string; delay_days: number } | null {
  const campaign = getCampaignFromLead(lead);
  if (!campaign?.sequence_steps) return null;
  const steps = campaign.sequence_steps || [];
  const step = steps.find((s: any) => s.step === lead.sequence_stage);
  if (!step) return null;
  return { channel: step.channel || 'email', prompt: step.prompt || '', delay_days: step.delay_days || 0 };
}

function getPromptForLead(lead: Lead): string {
  const campaign = getCampaignFromLead(lead);
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

  const campaign = getCampaignFromLead(lead);
  const campaignSettings = campaign?.settings as any;
  const globalSettings = await getOutreachSettings();

  // Merge all variables and interpolate the prompt
  const vars = await mergeVariables(lead, campaign);
  const signature = await getSignatureForCampaign(campaign);
  const prompt = interpolateVariables(rawPrompt, vars);

  const senderName = campaignSettings?.sender_name || globalSettings.sender_name;
  const senderRole = campaignSettings?.sender_role || globalSettings.sender_role;
  const aiEnabled = campaignSettings?.ai_drafts_enabled ?? globalSettings.ai_drafts_enabled ?? (process.env.USE_AI_DRAFTS === 'true');

  if (aiEnabled) {
    const aiResult = await generateAIDraft(name, lead.company, context, prompt, senderName, senderRole, globalSettings.draft_guardrails);
    if (aiResult) {
      recordAgentRun('draft_writer').catch(() => {});
      recordAgentRun('email_polisher').catch(() => {});
      return { subject: aiResult.subject, body: aiResult.body, prompt, source: 'ai', signature };
    }
  }

  return { ...templateDraft(name, context, prompt, senderName), signature };
}

// --- Lead Queries ---

/**
 * Build the daily outreach queue by pulling leads from each campaign
 * based on its daily_limit and priority settings.
 *
 * Each campaign contributes up to its daily_limit of leads.
 * Leads are scored with campaign priority added to their base score.
 * The final queue is sorted by combined score (highest first).
 */
export interface TodayFilters {
  // Per-user state scope. Empty / missing = sees all. 2026-06-14 refactor:
  // replaces the 3-value territory enum with an N-state array so the model
  // scales to per-location ownership (Percy TX, Iowa owner IA, future +).
  states?: string[];
  state?: string;
  city?: string;
  campaign_id?: string;
}

export async function getLeadsForToday(filters: TodayFilters = {}): Promise<Lead[]> {
  const campaignWhere: Record<string, unknown> = { approval_status: 'live' };
  if (filters.campaign_id) campaignWhere.id = filters.campaign_id;

  const campaigns = await Campaign.findAll({
    where: campaignWhere,
    attributes: ['id', 'name', 'channel_config', 'settings', 'ai_system_prompt', 'sequence_steps'],
  });

  const readyWhere: Record<string, unknown> = {
    outreach_status: 'ACTIVE',
    status: 'active',
    [Op.or]: [
      { next_action_at: null },
      { next_action_at: { [Op.lte]: new Date() } },
    ],
  };

  if (filters.state) readyWhere.state = { [Op.iLike]: filters.state };
  if (filters.city) readyWhere.city = { [Op.iLike]: filters.city };
  if (filters.states && filters.states.length > 0) {
    const { buildStatesPattern } = await import('./leadService');
    readyWhere.state = { [Op.iRegexp]: buildStatesPattern(filters.states) };
  }

  const allLeads: Lead[] = [];

  for (const campaign of campaigns) {
    const dailyLimit = (campaign.channel_config as any)?.email?.daily_limit || 5;
    const campaignPriority = (campaign.settings as any)?.priority || 50;

    const leads = await Lead.findAll({
      where: { ...readyWhere, campaign_id: campaign.id },
      include: [{ model: Campaign, as: 'outreachCampaign', attributes: ['id', 'name', 'ai_system_prompt', 'settings', 'sequence_steps'], required: false }],
      limit: dailyLimit,
      order: [['created_at', 'ASC']],
    });

    for (const lead of leads) {
      lead.priority_score = computePriorityScore(lead) + campaignPriority;
    }

    allLeads.push(...leads);
  }

  // Pull unassigned leads (no campaign) with a small limit.
  // Skip when a specific campaign is requested -- the user asked for one
  // campaign's queue, unassigned leads do not belong to that scope.
  if (!filters.campaign_id) {
    const unassigned = await Lead.findAll({
      where: { ...readyWhere, campaign_id: null },
      limit: 3,
      order: [['created_at', 'ASC']],
    });
    for (const lead of unassigned) {
      lead.priority_score = computePriorityScore(lead);
    }
    allLeads.push(...unassigned);
  }

  // Sort by combined score (campaign priority + lead priority)
  allLeads.sort((a, b) => {
    if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
    return a.created_at.getTime() - b.created_at.getTime();
  });

  // Apply global cap
  const globalSettings = await getOutreachSettings();
  recordAgentRun('priority_engine', { leads_scored: allLeads.length }).catch(() => {});
  recordAgentRun('scheduler_engine', { leads_queued: Math.min(allLeads.length, globalSettings.emails_per_day) }).catch(() => {});
  return allLeads.slice(0, globalSettings.emails_per_day);
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

  // Step-count cap (Ali decision 2026-06-09): env-default + per-campaign override.
  // The cap is a CEILING -- we never exceed it. If the campaign defines fewer
  // steps than the cap, we still stop at the last defined step. If the campaign
  // defines more, the cap wins. Set OUTREACH_MAX_STEPS=N in env to move the
  // ceiling globally; set campaign.settings.max_steps to override for one campaign.
  const envDefault = parseInt(process.env.OUTREACH_MAX_STEPS || '8', 10);
  const safeEnvDefault = Number.isFinite(envDefault) && envDefault > 0 ? envDefault : 8;
  const campaignOverride = typeof campaignSettings?.max_steps === 'number' && campaignSettings.max_steps > 0
    ? campaignSettings.max_steps
    : null;
  const effectiveCap = campaignOverride ?? safeEnvDefault;
  const definedSteps = steps.length || 3;
  const maxSteps = Math.min(definedSteps, effectiveCap);
  if (lead.sequence_stage > maxSteps) {
    lead.outreach_status = 'COMPLETED';
    lead.next_action_at = null;
  } else {
    const nextStep = steps.find((s: any) => s.step === lead.sequence_stage);
    const delayDays = nextStep?.delay_days ?? campaignSettings?.follow_up_delay_days ?? globalSettings.follow_up_delay_days;
    lead.next_action_at = new Date(now.getTime() + delayDays * 24 * 60 * 60 * 1000);
  }

  await lead.save();
  auditAction('lead.advance', 'lead', lead.id, { newValue: { stage: lead.sequence_stage, status: lead.outreach_status, pipeline_stage: lead.pipeline_stage } }).catch(() => {});
  recordAgentRun('sequence_engine', { lead_id: lead.id, stage: lead.sequence_stage }).catch(() => {});
  recordAgentRun('communication_safety').catch(() => {});
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

/**
 * Remove a lead from its current campaign permanently. The lead stays in the
 * DB so it can be re-assigned to another campaign later. Also marks any
 * matching campaign_leads join row as 'removed' for auditability.
 */
export async function removeLeadFromCampaign(leadId: string): Promise<{ lead: Lead; previousCampaignId: string | null } | null> {
  const lead = await Lead.findByPk(parseInt(leadId, 10));
  if (!lead) return null;

  const previousCampaignId = lead.campaign_id ?? null;

  if (previousCampaignId) {
    // Mark the join row as removed (even though the queue doesn't read it, this
    // gives us an audit trail and matches the campaign_leads.status='removed' enum).
    try {
      const { CampaignLead } = await import('../models/CampaignLead');
      await CampaignLead.update(
        { status: 'removed' },
        { where: { lead_id: lead.id, campaign_id: previousCampaignId } },
      );
    } catch (e) {
      logger.warn('Could not update campaign_leads status to removed', {
        leadId: lead.id, error: (e as Error).message,
      });
    }
  }

  lead.campaign_id = null;
  lead.next_action_at = null; // prevent stale timer in unassigned queue
  await lead.save();

  logger.info('Lead removed from campaign', { leadId: lead.id, previousCampaignId });
  return { lead, previousCampaignId };
}

/**
 * Block a lead from ALL future outreach. Archives the lead and adds them to
 * the do-not-contact list. Also marks all their campaign_leads rows as removed.
 */
export async function blockLead(leadId: string, reason?: string): Promise<{ lead: Lead; dncCreated: boolean } | null> {
  const lead = await Lead.findByPk(parseInt(leadId, 10));
  if (!lead) return null;

  const { DncList } = await import('../models/DncList');
  const { CampaignLead } = await import('../models/CampaignLead');

  // Archive the lead so the queue filter (status='active') excludes them
  lead.status = 'archived';
  lead.outreach_status = 'BLOCKED';
  lead.next_action_at = null;
  lead.campaign_id = null;
  await lead.save();

  // Mark every campaign_leads row for this lead as removed
  try {
    await CampaignLead.update(
      { status: 'removed' },
      { where: { lead_id: lead.id } },
    );
  } catch (e) {
    logger.warn('Could not mark campaign_leads as removed during block', {
      leadId: lead.id, error: (e as Error).message,
    });
  }

  // Add to DNC list (idempotent: skip if already present by email)
  let dncCreated = false;
  if (lead.email) {
    const existing = await DncList.findOne({ where: { email: lead.email.toLowerCase() } });
    if (!existing) {
      await DncList.create({
        email: lead.email.toLowerCase(),
        phone: lead.phone || null,
        reason: reason || 'manual_block',
      } as any);
      dncCreated = true;
    }
  }

  logger.info('Lead blocked from all outreach', { leadId: lead.id, dncCreated, reason });
  return { lead, dncCreated };
}

// --- Test Mode Tracking ---

interface TestSendRecord {
  lead_id: number;
  previous_sequence_stage: number;
  previous_last_contacted_at: string | null;
  previous_pipeline_stage: string;
  previous_outreach_status: string;
  previous_next_action_at: string | null;
  advanced_at: string;
}

const TEST_SENDS_KEY = 'outreach.test_sends';

async function getTestSends(): Promise<TestSendRecord[]> {
  try {
    const row = await SystemSetting.findByPk(TEST_SENDS_KEY);
    if (!row) return [];
    return (row.value as any) || [];
  } catch { return []; }
}

export async function trackTestSend(lead: Lead): Promise<void> {
  const sends = await getTestSends();
  sends.push({
    lead_id: lead.id,
    previous_sequence_stage: lead.sequence_stage,
    previous_last_contacted_at: lead.last_contacted_at?.toISOString() || null,
    previous_pipeline_stage: lead.pipeline_stage,
    previous_outreach_status: lead.outreach_status,
    previous_next_action_at: lead.next_action_at?.toISOString() || null,
    advanced_at: new Date().toISOString(),
  });
  await SystemSetting.upsert({ key: TEST_SENDS_KEY, value: sends as any, description: 'Leads advanced during test mode' });
}

export async function resetTestSends(): Promise<{ reset: number }> {
  const sends = await getTestSends();
  if (sends.length === 0) return { reset: 0 };

  let resetCount = 0;
  for (const record of sends) {
    const lead = await Lead.findByPk(record.lead_id);
    if (!lead) continue;

    await lead.update({
      sequence_stage: record.previous_sequence_stage,
      last_contacted_at: record.previous_last_contacted_at ? new Date(record.previous_last_contacted_at) : null,
      pipeline_stage: record.previous_pipeline_stage as any,
      outreach_status: record.previous_outreach_status,
      next_action_at: record.previous_next_action_at ? new Date(record.previous_next_action_at) : null,
    });
    resetCount++;
  }

  // Clear the test sends log
  await SystemSetting.upsert({ key: TEST_SENDS_KEY, value: [] as any, description: 'Leads advanced during test mode' });

  return { reset: resetCount };
}

export async function getTestSendCount(): Promise<number> {
  const sends = await getTestSends();
  return sends.length;
}

// --- Cached LinkedIn Draft ---
//
// Both the /today and /lookup-by-linkedin-url endpoints used to generate AI
// messages independently. Since OpenAI is called with temperature 0.7 each
// time, the two endpoints returned different messages for the same lead --
// confusing because the Outreach page and the Chrome extension overlay both
// claim to show "today's outreach message" but they didn't agree.
//
// Fix: cache the generated body on the lead itself, keyed by sequence_stage.
// Both endpoints share this helper. Cache invalidates naturally when the
// lead advances to a new stage. The /rewrite-draft endpoint overwrites the
// cache so user-requested tone changes propagate to the extension too.
//
// Storage layout (lead.notes JSONB):
//   notes.linkedin_draft = { stage: number, body: string, at: ISO, source: 'ai' | 'rewrite' }

export interface CachedLinkedInDraft {
  stage: number;
  body: string;
  at: string;
  source: 'ai' | 'rewrite';
}

export function readCachedLinkedInDraft(lead: Lead): CachedLinkedInDraft | null {
  const notes = (lead.notes as Record<string, unknown>) || {};
  const cached = notes.linkedin_draft as CachedLinkedInDraft | undefined;
  if (!cached || typeof cached !== 'object') return null;
  if (cached.stage !== lead.sequence_stage) return null; // stale (lead advanced)
  if (!cached.body || typeof cached.body !== 'string') return null;
  return cached;
}

export async function writeCachedLinkedInDraft(
  leadId: number,
  draft: CachedLinkedInDraft,
): Promise<void> {
  const lead = await Lead.findByPk(leadId);
  if (!lead) return;
  const notes = { ...((lead.notes as Record<string, unknown>) || {}) };
  notes.linkedin_draft = draft;
  await lead.update({ notes });
}

/**
 * Generate (or return the cached) AI LinkedIn message for a lead.
 *
 * Cache hits return immediately without an OpenAI call. Cache misses
 * generate via OpenAI, persist to lead.notes, and return.
 *
 * Returns { body, error, source }. On error, body may be '' and the caller
 * should surface `error` to the user instead of falling back to raw prompt
 * text.
 */
export async function getOrGenerateLinkedInDraft(args: {
  lead: Lead;
  campaign: any;
  channel: string; // 'linkedin_connect' | 'linkedin_message'
  stepPrompt: string;
  vars: Record<string, string>;
  senderName: string;
  senderFirstName: string;
}): Promise<{ body: string; error: string | null; source: 'cache' | 'ai' }> {
  const { lead, channel, stepPrompt, vars, senderName, senderFirstName } = args;

  // 1. Cache check
  const cached = readCachedLinkedInDraft(lead);
  if (cached) {
    return { body: cached.body, error: null, source: 'cache' };
  }

  // 2. Generate via AI
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { body: '', error: 'OPENAI_API_KEY is not configured on the server.', source: 'ai' };
  }

  const maxChars = channel === 'linkedin_connect' ? 300 : 400;
  const interpolatedPrompt = interpolateVariables(stepPrompt, vars);
  const recipientFirst = lead.first_name || '';
  const recipientLast = lead.last_name || '';
  const recipientTitle = (lead as any).title || '';
  const recipientCompany = lead.company || '';

  const systemPrompt = `You are writing a LinkedIn ${channel === 'linkedin_connect' ? 'connection request note' : 'follow-up direct message'} FROM the SENDER (${senderName}) TO the RECIPIENT (${recipientFirst} ${recipientLast}, ${recipientTitle} at ${recipientCompany}).

CRITICAL RULES:
- The message is written FROM the sender's perspective TO the recipient
- Greet the RECIPIENT by their first name: "Hi ${recipientFirst}"
- Sign off as the SENDER: ${senderFirstName}
- DO NOT write as if you are the recipient
- DO NOT greet the sender by name
- DO NOT ask the sender for their services -- the SENDER is offering services
- Generate ONLY the final message text. No instructions, no labels, no quotation marks. Ready to copy and paste directly.

STYLE (very important):
- This is a LinkedIn message, NOT an email. Keep it short, conversational, casual professional.
- ${channel === 'linkedin_connect' ? '2 sentences max. Hook + ask. Under 300 chars.' : '2-3 sentences max. Sound like a real person messaging another person, not a marketing pitch. No paragraph blocks. Under 400 chars.'}
- Do NOT structure it like an email (no "I hope this finds you well", no multi-paragraph sales pitch, no formal closings).
- Hard cap: ${maxChars} characters total INCLUDING greeting and sign-off.`;

  try {
    const aiResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: interpolatedPrompt },
        ],
        temperature: 0.7,
        max_tokens: 256,
      }),
    });

    if (!aiResp.ok) {
      const errBody = await aiResp.text().catch(() => '');
      logger.warn('LinkedIn AI generation failed', {
        channel, status: aiResp.status, error: errBody.slice(0, 200),
      });
      const error = aiResp.status === 429
        ? 'AI is unavailable: OpenAI quota exceeded. Top up billing at platform.openai.com.'
        : `AI is unavailable (upstream ${aiResp.status}). Try again in a moment.`;
      return { body: '', error, source: 'ai' };
    }

    const aiData = (await aiResp.json()) as any;
    recordLlmUsage({ source: 'linkedin_draft', usage: aiData.usage });
    let body = (aiData.choices?.[0]?.message?.content || '').trim();
    if (body.length > maxChars) body = body.slice(0, maxChars).trim();
    if (!body) return { body: '', error: 'AI returned an empty response.', source: 'ai' };

    // 3. Persist to cache
    await writeCachedLinkedInDraft(lead.id, {
      stage: lead.sequence_stage,
      body,
      at: new Date().toISOString(),
      source: 'ai',
    });

    return { body, error: null, source: 'ai' };
  } catch (e) {
    logger.warn('LinkedIn AI generation threw', { channel, error: (e as Error).message });
    return { body: '', error: 'AI is unavailable (network error). Try again in a moment.', source: 'ai' };
  }
}
