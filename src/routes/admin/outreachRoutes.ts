import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { sendLimiter } from '../../middleware/rateLimiter';
import { getLeadsForToday, getMessageContext, generateDraft, advanceLead, skipLead, removeLeadFromCampaign, blockLead, getOutreachSettings, updateOutreachSettings, getStepInfo, interpolateVariables, mergeVariables, trackTestSend, resetTestSends, getTestSendCount, getOrGenerateLinkedInDraft, writeCachedLinkedInDraft } from '../../services/outreachQueryService';
import { Op } from 'sequelize';
import { Lead } from '../../models/Lead';
import { Campaign } from '../../models/Campaign';
import { User } from '../../models/User';
import { createSequence } from '../../services/sequenceService';
import { validateEmail, validateBatch } from '../../services/emailValidationService';
import { sendOutreachEmail, testConnection, loadAttachmentFromPath, resolveSender } from '../../services/outreachEmailService';
import { getSenderProfile, getSendersConfig, saveSendersConfig, buildSignature, TITLE_OPTIONS } from '../../services/senderProfileService';
import { personalize } from '../../services/outreachPersonalization';
import { recordAgentRun } from '../../intelligence/agents/agentRegistry';
import { campaignVertical } from '../../services/leadClassification';
import { recordLlmUsage } from '../../services/aiCost';
import { logger } from '../../config/logger';

const router = Router();
router.use(authenticate);

function getSuggestedAction(stage: number): string {
  switch (stage) {
    case 1: return 'Initial Outreach';
    case 2: return 'Follow-up';
    case 3: return 'Final Touch';
    default: return 'Review';
  }
}

// --- Morning Briefing ---

router.get('/briefing', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { generateMorningBriefing } = await import('../../services/morningBriefingService');
    res.json(await generateMorningBriefing());
  } catch (error) {
    logger.error('GET /briefing failed', { error: (error as Error).message });
    next(error);
  }
});

router.post('/briefing/send', authorize('campaigns:write'), sendLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sendMorningBriefing } = await import('../../services/morningBriefingService');
    const email = req.body.email || 'rmlandry29@gmail.com';
    res.json(await sendMorningBriefing(email));
  } catch (error) {
    logger.error('POST /briefing/send failed', { error: (error as Error).message });
    next(error);
  }
});

// --- Ryan Pulse -- single daily exec dashboard ---
// GET  /admin/pulse           -> JSON snapshot + rendered subject/text/html (preview, no send)
// POST /admin/pulse/send      -> sends to req.body.email (defaults to ali@colaberry.com during the test window)

router.get('/pulse', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { buildPulseSnapshot, renderPulseSubject, renderPulseText, renderPulseHtml } = await import('../../services/ryanPulseService');
    const snap = await buildPulseSnapshot();
    res.json({
      snapshot: snap,
      subject: renderPulseSubject(snap),
      text: renderPulseText(snap),
      html: renderPulseHtml(snap),
    });
  } catch (error) {
    logger.error('GET /pulse failed', { error: (error as Error).message });
    next(error);
  }
});

router.post('/pulse/send', authorize('campaigns:write'), sendLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { buildPulseSnapshot, renderPulseSubject, renderPulseText, renderPulseHtml } = await import('../../services/ryanPulseService');
    const { sendOutreachEmail } = await import('../../services/outreachEmailService');
    // Default recipient is Ali during the verify-before-Ryan window. Explicit
    // override required to send to anyone else.
    const to = req.body.email || 'ali@colaberry.com';
    const snap = await buildPulseSnapshot();
    const result = await sendOutreachEmail({
      to,
      subject: renderPulseSubject(snap),
      body: renderPulseText(snap),
      html: renderPulseHtml(snap),
      from: 'rlandry@landjet.com',
      senderName: 'LandJet Growth Engine',
    });
    res.json({ success: result.success, to, snapshot_date: snap.for_date });
  } catch (error) {
    logger.error('POST /pulse/send failed', { error: (error as Error).message });
    next(error);
  }
});

// --- Email Reply Drafts ---

router.get('/inbox', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { getRecentInboxEmails, recordInboxMatches } = await import('../../services/emailReplyService');
    const emails = await getRecentInboxEmails();
    // Persist matches to CommunicationLog + advance pipeline_stage for any
    // matched lead. Failures inside recordInboxMatches are non-fatal; the
    // inbox poll still returns its results either way.
    const matchStats = await recordInboxMatches(emails).catch(err => {
      logger.warn('Inbox match recording failed (non-fatal)', { error: (err as Error).message });
      return { matched: 0, logged_new: 0, advanced: 0 };
    });
    res.json({ emails, total: emails.length, matches: matchStats });
  } catch (error) {
    logger.error('GET /inbox failed', { error: (error as Error).message });
    next(error);
  }
});

router.post('/inbox/draft-replies', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { getRecentInboxEmails, generateDraftReplies } = await import('../../services/emailReplyService');
    const emails = await getRecentInboxEmails('rlandry@landjet.com', req.body.limit || 10);
    const drafts = await generateDraftReplies(emails);
    res.json({ drafts, total: drafts.length });
  } catch (error) {
    logger.error('POST /inbox/draft-replies failed', { error: (error as Error).message });
    next(error);
  }
});

router.post('/inbox/send-reply', authorize('campaigns:write'), sendLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sendReply } = await import('../../services/emailReplyService');
    const { message_id, body } = req.body;
    if (!message_id || !body) return res.status(400).json({ error: 'message_id and body required' });

    const settings = await getOutreachSettings();
    if (settings.test_mode) {
      // In test mode, don't actually reply -- just confirm
      logger.info('Test mode: reply not sent', { messageId: message_id });
      return res.json({ success: true, test_mode: true, message: 'Reply drafted but not sent (test mode)' });
    }

    const result = await sendReply('rlandry@landjet.com', message_id, body);
    res.json(result);
  } catch (error) {
    logger.error('POST /inbox/send-reply failed', { error: (error as Error).message });
    next(error);
  }
});

// --- KPI Report ---

router.get('/kpi-report', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { generateWeeklyKPIReport } = await import('../../services/kpiReportService');
    res.json(await generateWeeklyKPIReport());
  } catch (error) { next(error); }
});

router.post('/kpi-report/send', authorize('campaigns:write'), sendLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sendWeeklyKPIEmail } = await import('../../services/kpiReportService');
    const email = req.body.email || 'rmlandry29@gmail.com';
    const result = await sendWeeklyKPIEmail(email);
    res.json(result);
  } catch (error) {
    logger.error('POST /kpi-report/send failed', { error: (error as Error).message });
    next(error);
  }
});

// --- Deal-to-Investor Matching ---

router.post('/deal-match', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { matchDealToInvestors } = await import('../../services/dealMatchingService');
    const { deal_name, deal_type, amount, description, sector, geography, limit } = req.body;
    if (!deal_name || !description) return res.status(400).json({ error: 'deal_name and description are required' });
    const matches = await matchDealToInvestors(
      { deal_name, deal_type: deal_type || 'other', amount: amount || 'TBD', description, sector, geography },
      limit || 10,
    );
    recordAgentRun('deal_matcher', { matches: matches.length }).catch(() => {});
    res.json({ matches, total: matches.length });
  } catch (error) {
    logger.error('POST /deal-match failed', { error: (error as Error).message });
    next(error);
  }
});

// --- Inbound Lead Response + Quoting ---

router.get('/inbound/scan', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Use Microsoft Graph API to read rlandry@landjet.com inbox (not Gmail)
    const { getRecentInboxEmails } = await import('../../services/emailReplyService');
    const limit = Number(req.query.limit) || 50;

    let allEmails;
    try {
      allEmails = await getRecentInboxEmails('rlandry@landjet.com', limit);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('Mail access denied')) {
        return res.status(403).json({ error: 'Mail.Read permission not granted. Ask Percy to add Mail.Read application permission in Azure AD for the LandJet Outreach app and grant admin consent.' });
      }
      throw e;
    }

    // Use AI to classify which emails are quote/inquiry requests
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || allEmails.length === 0) {
      return res.json({ inquiries: [], total: 0 });
    }

    const emailSummaries = allEmails.slice(0, 30).map((e, i) =>
      `[${i}] From: ${e.from} <${e.from_email}>\nSubject: ${e.subject}\nPreview: ${e.preview}`
    ).join('\n---\n');

    const aiResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'gpt-4o',
        messages: [
          { role: 'system', content: `You are scanning emails for Ryan Landry, CEO of LandJet (premium ground transportation) and Managing Partner at MB Capital Ventures (capital advisory). Identify emails that are:\n- quote_request: someone asking about pricing, booking, or transportation services\n- service_inquiry: asking about availability, routes, fleet, or service areas\n- partnership_inquiry: business development, partnership, vendor, or collaboration proposals\n- lead_referral: introductions, referrals, or recommendations from contacts\n- investor_inquiry: anyone interested in investing, franchise opportunities, or capital discussions\n- deal_opportunity: real estate deals, company acquisitions, or investment opportunities\n\nBe GENEROUS in classification -- if an email could be a business opportunity, include it.\nDo NOT include: newsletters, marketing blasts, automated notifications, spam, receipts, or purely personal/social emails.\n\nReturn JSON: { "classifications": [{ "index": 0, "type": "quote_request", "summary": "one sentence summary" }] }` },
          { role: 'user', content: emailSummaries },
        ],
        temperature: 0.3,
        max_tokens: 1024,
      }),
    });

    if (!aiResp.ok) return res.json({ inquiries: allEmails.slice(0, 5), total: allEmails.length });

    const data = (await aiResp.json()) as any;
    recordLlmUsage({ source: 'outreach_route:inbound_scan_classify', usage: data.usage });
    const raw = (data.choices?.[0]?.message?.content || '').trim();
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    try {
      const parsed = JSON.parse(cleaned);
      const classifications = parsed.classifications || [];
      const inquiries = classifications.map((c: any) => {
        const email = allEmails[c.index];
        if (!email) return null;
        return {
          gmail_id: email.id,
          from: email.from,
          from_email: email.from_email,
          from_name: email.from,
          subject: email.subject,
          body: email.preview,
          received_at: email.received_at,
          type: c.type,
          summary: c.summary,
        };
      }).filter(Boolean);

      recordAgentRun('inbound_classifier', { classified: inquiries.length }).catch(() => {});
      res.json({ inquiries, total: inquiries.length });
    } catch {
      res.json({ inquiries: [], total: 0 });
    }
  } catch (error) {
    logger.error('GET /inbound/scan failed', { error: (error as Error).message });
    next(error);
  }
});

router.post('/inbound/quote', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { generateQuoteResponse } = await import('../../services/inboundLeadService');
    const result = await generateQuoteResponse(req.body);
    res.json(result);
  } catch (error) {
    logger.error('POST /inbound/quote failed', { error: (error as Error).message });
    next(error);
  }
});

router.post('/inbound/send', authorize('campaigns:write'), sendLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { to, subject, body } = req.body;
    if (!to || !subject || !body) return res.status(400).json({ error: 'to, subject, and body are required' });

    const settings = await getOutreachSettings();
    const recipientEmail = settings.test_mode && settings.test_email ? settings.test_email : to;
    const emailSubject = settings.test_mode ? `[TEST -> ${to}] ${subject}` : subject;

    const result = await sendOutreachEmail({
      to: recipientEmail,
      subject: emailSubject,
      body,
      from: 'rlandry@landjet.com',
      senderName: 'Ryan Landry',
      signature: settings.email_signature || '',
    });

    res.json({ ...result, test_mode: settings.test_mode });
  } catch (error) {
    logger.error('POST /inbound/send failed', { error: (error as Error).message });
    next(error);
  }
});

// --- Settings ---

router.get('/settings', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await getOutreachSettings();
    res.json(settings);
  } catch (error) { next(error); }
});

router.post('/settings', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await updateOutreachSettings(req.body);
    res.json(settings);
  } catch (error) { next(error); }
});

// --- Sender profiles (per-person identity: name, title, area, signature) ---
// Each outreach mailbox has ONE owner. These endpoints let the team manage the
// title shown in each signature (Ryan CEO / Percy COO / Grant Business
// Development) and preview the rendered signature, without a code change.
router.get('/senders', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await getSendersConfig();
    // Return each profile with its rendered signature so the UI can preview it.
    const profiles = Object.values(config.profiles).map(p => ({
      ...p,
      signature_preview: buildSignature(config.template, p),
    }));
    res.json({ template: config.template, profiles, title_options: TITLE_OPTIONS });
  } catch (error) { next(error); }
});

router.put('/senders', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body || {};
    if (!body.profiles || typeof body.profiles !== 'object') {
      return res.status(400).json({ error: 'profiles object is required' });
    }
    // Validate each profile minimally before persisting.
    const profiles: Record<string, any> = {};
    for (const [key, raw] of Object.entries<any>(body.profiles)) {
      const email = (raw?.email || key || '').trim().toLowerCase();
      if (!email) return res.status(400).json({ error: 'each profile needs an email' });
      if (!raw?.name?.trim()) return res.status(400).json({ error: `profile ${email} needs a name` });
      profiles[email] = {
        email,
        name: String(raw.name).trim(),
        title: String(raw.title || '').trim(),
        area: Array.isArray(raw.area) ? raw.area.map((s: unknown) => String(s).trim().toUpperCase()).filter(Boolean) : [],
        signature_override: raw.signature_override ? String(raw.signature_override) : undefined,
      };
    }
    const saved = await saveSendersConfig({
      template: typeof body.template === 'string' && body.template.trim() ? body.template : (await getSendersConfig()).template,
      profiles,
    });
    const out = Object.values(saved.profiles).map(p => ({ ...p, signature_preview: buildSignature(saved.template, p) }));
    res.json({ template: saved.template, profiles: out, title_options: TITLE_OPTIONS });
  } catch (error) { next(error); }
});

// --- Strategies ---

router.post('/strategies', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, prompt } = req.body;
    if (!name?.trim() || !prompt?.trim()) {
      return res.status(400).json({ error: 'Name and prompt are required' });
    }

    const sequence = await createSequence({
      name: `${name.trim()} Sequence`,
      steps: [
        { delay_days: 0, channel: 'email', subject: 'Quick note', body_template: '', ai_instructions: prompt.trim(), ai_tone: 'professional', step_goal: 'Initial outreach', max_attempts: 1 },
        { delay_days: 4, channel: 'email', subject: 'Following up', body_template: '', ai_instructions: prompt.trim(), ai_tone: 'professional', step_goal: 'Follow-up', max_attempts: 1 },
        { delay_days: 8, channel: 'email', subject: 'Last note', body_template: '', ai_instructions: prompt.trim(), ai_tone: 'warm', step_goal: 'Graceful close', max_attempts: 1 },
      ],
    });

    const campaign = await Campaign.create({
      name: name.trim(),
      type: 'cold_outbound',
      status: 'active',
      approval_status: 'live',
      ai_system_prompt: prompt.trim(),
      sequence_id: sequence.id,
      created_by: req.user!.userId,
    } as any);

    res.status(201).json({ strategy: { id: campaign.id, name: campaign.name, prompt: campaign.ai_system_prompt } });
  } catch (error) { next(error); }
});

// --- AI Prompt Rewrite ---

router.post('/campaigns/:campaignId/rewrite-prompts', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.params.campaignId as string;
    // Re-read fresh from DB to pick up any recently saved steps
    const campaign = await Campaign.findByPk(campaignId);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    await campaign.reload();

    const campaignVars = (campaign.settings as any)?.variables || {};
    const campaignVarNames = Object.keys(campaignVars).map(k => `{{${k}}}`);
    const campaignVarList = Object.entries(campaignVars).map(([k, v]) => `{{${k}}} = "${v}"`).join('\n');
    const leadVarNames = ['{{first_name}}', '{{last_name}}', '{{company}}', '{{email}}', '{{title}}', '{{vertical}}'];
    const allAllowedVars = [...campaignVarNames, ...leadVarNames];

    const currentPrompt = campaign.ai_system_prompt || '';
    const currentSteps = campaign.sequence_steps || [];

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'OpenAI API key not configured' });

    // Extract user's tone and length preferences from CURRENT prompt so we don't overwrite them
    const currentLower = currentPrompt.toLowerCase();
    const lengthMatch = currentPrompt.match(/(?:under|max(?:imum)?)\s*(\d{2,4})\s*words?/i);
    const preservedLength = lengthMatch ? `under ${lengthMatch[1]} words` : 'under 150 words';
    const preservedTone = currentLower.includes('ceo style') || currentLower.includes('ceo-style') || currentLower.includes('write as ceo') ? 'CEO style'
      : currentLower.includes('founder-direct') || currentLower.includes('founder direct') ? 'founder-direct'
      : currentLower.includes('formal') ? 'formal'
      : currentLower.includes('casual') ? 'casual'
      : 'professional and direct';

    // Channel-specific guidance for each step
    const channelGuidance = (channel: string): string => {
      switch (channel) {
        case 'linkedin_connect':
          return 'LinkedIn connection request note (max 280 characters total). The note must invite them to connect, NOT pitch services. Mention one shared interest or proof point briefly.';
        case 'linkedin_message':
          return 'LinkedIn direct message (assumes already connected). Personal, conversational, no formal sign-off needed. NOT a connection request -- do NOT ask to connect.';
        case 'sms':
          return 'Plain text SMS (under 160 characters). Casual, direct, no signature block.';
        case 'voice':
          return 'Voice script for a 30-second voicemail. Conversational tone, mention one specific value point, leave callback ask.';
        case 'email':
        default:
          return `Standard outreach email. ${preservedLength}. Tone: ${preservedTone}.`;
      }
    };

    const systemInstruction = `You are rewriting outreach prompts. Write the prompts as instructions to an AI that will generate the actual outbound message.

THE ONLY VARIABLES YOU MAY USE (complete list):
${allAllowedVars.join(', ')}

THESE VARIABLES DO NOT EXIST -- DO NOT USE THEM:
{{sender_name}}, {{sender_title}}, {{sender_first_name}}, {{sender_company}}, {{company_name}}, {{company_description}}, {{no_competitor}}, {{vehicle_type}}, {{route_range}}, {{states_served}}, {{locations_count}}, {{avg_trip_value}}, {{unit_economics}}, {{raise_amount}}, {{raise_purpose}}, {{value_prop}}, {{market_size}}

Instead of sender variables, write: "Sign off as Ryan." or "Write as CEO of LandJet."
Instead of company variables, use the campaign variable values directly in the prompt text.

CAMPAIGN VARIABLE VALUES FOR REFERENCE:
${campaignVarList || 'None defined'}

LEAD VARIABLES (filled at send time): {{first_name}}, {{last_name}}, {{company}}, {{title}}, {{vertical}}

USER PREFERENCES TO PRESERVE (extracted from current prompt):
- Tone: ${preservedTone}
- Email length: ${preservedLength}

WHAT TO WRITE:

campaign_prompt (system prompt, under 200 words):
- Instructions for generating a personalized message to {{first_name}} at {{company}}
- You MUST reference every single campaign variable at least once across the campaign_prompt and step prompts. Missing any variable is unacceptable. Variables: ${campaignVarNames.join(', ') || 'none'}
- Specify the tone: ${preservedTone}
- For email-channel steps, specify length: ${preservedLength}
- Sign off as Ryan

steps (${currentSteps.length || 3} sequence steps):
${(currentSteps.length > 0 ? currentSteps : [{ step: 1, channel: 'email' }, { step: 2, channel: 'email' }, { step: 3, channel: 'email' }]).map((s: any, i: number) => {
  const total = currentSteps.length || 3;
  const channel = s.channel || 'email';
  const role = i === 0 ? 'Initial outreach' : i === total - 1 ? 'Brief final touch' : `Follow-up ${i}`;
  return `- Step ${s.step} (channel=${channel}): ${role}. Channel rules: ${channelGuidance(channel)}. Use {{first_name}}${i === 0 ? ', {{company}}, and key campaign vars' : i === total - 1 ? ' only' : ' and different proof points'}.`;
}).join('\n')}

CRITICAL CHANNEL RULES:
- linkedin_connect prompts MUST instruct AI to write a connection request (max 280 chars), NOT a sales message
- linkedin_message prompts MUST instruct AI to write a direct message (assumes connected), NOT a connection request -- never include phrases like "let's connect" or "would love to connect"
- email prompts use full email format with the preserved tone and length

Return JSON: {"campaign_prompt": "...", "steps": [{step, delay_days, prompt, channel}]}
Keep existing delay_days and channel from current steps EXACTLY. Output exactly ${currentSteps.length || 3} steps matching the step numbers and channels above.`;

    const userContent = `CURRENT CAMPAIGN PROMPT:\n${currentPrompt}\n\nCURRENT STEPS:\n${JSON.stringify(currentSteps, null, 2)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'gpt-4o',
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userContent },
        ],
        temperature: 0.5,
        max_tokens: 2048,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    if (!response.ok) return res.status(500).json({ error: 'AI request failed' });

    const data = (await response.json()) as any;
    recordLlmUsage({ source: 'outreach_route:rewrite_prompts', usage: data.usage });
    const raw = (data.choices?.[0]?.message?.content || '').trim();
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);

    // Validate all campaign variables are referenced
    const allGeneratedText = parsed.campaign_prompt + ' ' + (parsed.steps || []).map((s: any) => s.prompt || '').join(' ');
    const missingVars = Object.keys(campaignVars).filter(k => !allGeneratedText.includes('{{' + k + '}}'));
    if (missingVars.length > 0) {
      // Inject missing variables into campaign prompt
      parsed.campaign_prompt += '\nReference these in your emails: ' + missingVars.map(k => '{{' + k + '}}').join(', ') + '.';
    }

    // Update campaign
    campaign.ai_system_prompt = parsed.campaign_prompt;
    campaign.sequence_steps = parsed.steps;
    await campaign.save();

    res.json({
      campaign_prompt: parsed.campaign_prompt,
      steps: parsed.steps,
    });
  } catch (error) {
    next(error);
  }
});

// --- Email Connection Test ---

router.post('/test-email', authorize('campaigns:write'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const results = await Promise.all([
      testConnection(process.env.OUTREACH_EMAIL_INVESTOR),
      testConnection(process.env.OUTREACH_EMAIL_CUSTOMER),
      testConnection(process.env.OUTREACH_EMAIL_GENERAL),
    ]);

    res.json({
      investor: { email: process.env.OUTREACH_EMAIL_INVESTOR, ...results[0] },
      customer: { email: process.env.OUTREACH_EMAIL_CUSTOMER, ...results[1] },
      general: { email: process.env.OUTREACH_EMAIL_GENERAL, ...results[2] },
    });
  } catch (error) { next(error); }
});

// --- Email Validation ---

router.post('/validate-email', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const result = await validateEmail(email);
    res.json(result);
  } catch (error) { next(error); }
});

router.post('/validate-batch', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { emails } = req.body;
    if (!Array.isArray(emails)) return res.status(400).json({ error: 'Array of emails required' });
    const results = await validateBatch(emails.slice(0, 100));
    const valid = results.filter(r => r.valid).length;
    const invalid = results.filter(r => !r.valid).length;
    res.json({ results, summary: { total: results.length, valid, invalid } });
  } catch (error) { next(error); }
});

// --- Campaign Contacts ---

router.get('/campaigns/:campaignId/contacts', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.campaignId;
    let where: any = {};

    if (id === 'all') {
      // No filter - all contacts
    } else if (id === 'unclassified') {
      where = { campaign_id: null };
    } else {
      where = { campaign_id: id };
    }

    const limit = Math.min(Number(req.query.limit) || 25, 100);
    const offset = Number(req.query.offset) || 0;

    const result = await Lead.findAndCountAll({
      where,
      order: [['created_at', 'ASC']],
      limit,
      offset,
      attributes: ['id', 'first_name', 'last_name', 'email', 'company', 'phone',
        'vertical', 'tier', 'sequence_stage', 'outreach_status', 'last_contacted_at',
        'next_action_at', 'priority_score', 'campaign_id', 'status', 'linkedin_url',
        'title', 'industry', 'pipeline_stage', 'lead_score', 'temperature', 'created_at'],
    });
    res.json({ contacts: result.rows, total: result.count, limit, offset });
  } catch (error) { next(error); }
});

// --- Campaign Analytics ---

router.get('/campaigns/:campaignId/analytics', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.campaignId;
    let where: any = {};

    if (id === 'all') {
      // No filter
    } else if (id === 'unclassified') {
      where = { campaign_id: null };
    } else {
      where = { campaign_id: id };
    }

    // Use SQL aggregation instead of loading all rows into memory
    const [summary, stageRows, verticalRows] = await Promise.all([
      Lead.findAll({
        where,
        attributes: [
          [Lead.sequelize!.fn('COUNT', '*'), 'total_contacts'],
          [Lead.sequelize!.literal("COUNT(*) FILTER (WHERE outreach_status = 'ACTIVE')"), 'active'],
          [Lead.sequelize!.literal("COUNT(*) FILTER (WHERE outreach_status = 'COMPLETED')"), 'completed'],
          [Lead.sequelize!.literal("COUNT(*) FILTER (WHERE last_contacted_at IS NOT NULL)"), 'contacted'],
          [Lead.sequelize!.literal("COUNT(*) FILTER (WHERE last_contacted_at IS NULL)"), 'never_contacted'],
        ],
        raw: true,
      }),
      Lead.findAll({
        where,
        attributes: ['sequence_stage', [Lead.sequelize!.fn('COUNT', '*'), 'count']],
        group: ['sequence_stage'],
        raw: true,
      }),
      Lead.findAll({
        where: { ...where, vertical: { [Op.ne]: null } },
        attributes: ['vertical', [Lead.sequelize!.fn('COUNT', '*'), 'count']],
        group: ['vertical'],
        raw: true,
      }),
    ]);

    const s = (summary as any[])[0] || {};
    const byStage: Record<number, number> = {};
    for (const r of stageRows as any[]) byStage[r.sequence_stage] = parseInt(r.count, 10);
    const byVertical: Record<string, number> = {};
    for (const r of verticalRows as any[]) byVertical[r.vertical] = parseInt(r.count, 10);

    res.json({
      total_contacts: parseInt(s.total_contacts, 10) || 0,
      active: parseInt(s.active, 10) || 0,
      completed: parseInt(s.completed, 10) || 0,
      contacted: parseInt(s.contacted, 10) || 0,
      never_contacted: parseInt(s.never_contacted, 10) || 0,
      by_stage: byStage,
      by_vertical: byVertical,
    });
  } catch (error) { next(error); }
});

// --- Batch Campaign Analytics ---

router.get('/campaigns/batch-analytics', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ids = (req.query.ids as string || '').split(',').filter(Boolean);
    if (ids.length === 0) return res.json({ analytics: {} });

    const rows = await Lead.findAll({
      where: { campaign_id: { [Op.in]: ids } },
      attributes: [
        'campaign_id',
        [Lead.sequelize!.fn('COUNT', '*'), 'total_contacts'],
        [Lead.sequelize!.literal("COUNT(*) FILTER (WHERE outreach_status = 'ACTIVE')"), 'active'],
        [Lead.sequelize!.literal("COUNT(*) FILTER (WHERE outreach_status = 'COMPLETED')"), 'completed'],
        [Lead.sequelize!.literal("COUNT(*) FILTER (WHERE last_contacted_at IS NOT NULL)"), 'contacted'],
        [Lead.sequelize!.literal("COUNT(*) FILTER (WHERE last_contacted_at IS NULL)"), 'never_contacted'],
      ],
      group: ['campaign_id'],
      raw: true,
    }) as any[];

    const analytics: Record<string, any> = {};
    for (const r of rows) {
      analytics[r.campaign_id] = {
        total_contacts: parseInt(r.total_contacts, 10) || 0,
        active: parseInt(r.active, 10) || 0,
        completed: parseInt(r.completed, 10) || 0,
        contacted: parseInt(r.contacted, 10) || 0,
        never_contacted: parseInt(r.never_contacted, 10) || 0,
      };
    }
    res.json({ analytics });
  } catch (error) { next(error); }
});

// --- Campaign Upload ---

router.post('/campaigns/:campaignId/upload', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.params.campaignId as string;
    const { csv } = req.body;

    if (!csv || typeof csv !== 'string') {
      return res.status(400).json({ error: 'CSV data required in body as "csv" string' });
    }

    const lines = csv.split('\n').filter((l: string) => l.trim());
    if (lines.length < 2) {
      return res.status(400).json({ error: 'CSV must have header + at least one data row' });
    }

    const headers = lines[0].split(',').map((h: string) => h.trim().toLowerCase());
    const nameIdx = headers.indexOf('name');
    const emailIdx = headers.indexOf('email');
    const companyIdx = headers.indexOf('company');

    if (emailIdx === -1) {
      return res.status(400).json({ error: 'CSV must have an "email" column' });
    }

    // Parse all rows first
    const rows: { email: string; firstName: string; lastName: string; company: string | null }[] = [];
    for (let i = 1; i < lines.length; i++) {
      const fields = lines[i].split(',').map((f: string) => f.trim());
      const email = (fields[emailIdx] || '').toLowerCase();
      if (!email || !email.includes('@')) continue;
      const name = nameIdx >= 0 ? fields[nameIdx] || email : email;
      const company = companyIdx >= 0 ? fields[companyIdx] || null : null;
      const nameParts = name.split(/\s+/);
      rows.push({ email, firstName: nameParts[0] || email, lastName: nameParts.slice(1).join(' ') || '', company });
    }

    // Batch lookup existing emails (1 query instead of N)
    const allEmails = rows.map(r => r.email);
    const existingLeads = await Lead.findAll({
      where: { email: { [Op.in]: allEmails } },
      attributes: ['id', 'email', 'campaign_id'],
    });
    const existingMap = new Map(existingLeads.map(l => [l.email, l]));

    let created = 0, skipped = 0;
    const toCreate: any[] = [];
    const toUpdate: Lead[] = [];

    for (const row of rows) {
      const existing = existingMap.get(row.email);
      if (!existing) {
        toCreate.push({
          first_name: row.firstName, last_name: row.lastName, email: row.email,
          phone: null, company: row.company, title: null, industry: null,
          company_size: null, annual_revenue: null, linkedin_url: null,
          lead_source: 'upload', lead_source_type: 'warm', temperature: 'warm',
          pipeline_stage: 'new_lead', lifecycle_stage: null, notes: null,
          technology_stack: null, utm_source: null, interest_area: null,
          campaign_id: campaignId === 'unclassified' ? null : campaignId,
          status: 'active',
        });
        created++;
      } else {
        if (campaignId !== 'unclassified' && existing.campaign_id !== campaignId) {
          existing.campaign_id = campaignId;
          toUpdate.push(existing);
        }
        skipped++;
      }
    }

    // Batch create new leads
    if (toCreate.length > 0) {
      await Lead.bulkCreate(toCreate, { ignoreDuplicates: true });
    }
    // Update existing leads that need campaign assignment
    for (const lead of toUpdate) {
      await lead.save();
    }

    const invalidCount = (lines.length - 1) - rows.length;
    res.json({ created, skipped: skipped + invalidCount, total: lines.length - 1 });
  } catch (error) { next(error); }
});

// --- Today's Outreach ---

// The single document a campaign can attach to its emails. Set on the campaign
// Strategy tab (settings.attachment_document); falls back to whatever file a
// sequence step already points at so older per-step wiring still surfaces.
function campaignAttachmentDoc(campaign: any): string | null {
  const fromSettings = campaign?.settings?.attachment_document;
  if (fromSettings) return fromSettings;
  const steps = (campaign?.sequence_steps as any[]) || [];
  return steps.find((s: any) => s?.attachment_path)?.attachment_path || null;
}

router.get('/today', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { parseStatesParam } = await import('../../services/leadService');
    // Territory enforcement: if the signed-in user has a state scope on their
    // profile (e.g. Percy = TX), that scope WINS -- they only ever see their
    // own territory, regardless of what the client sends. Users with no profile
    // scope (global admins) can still filter ad-hoc via the query param.
    const me = await User.findByPk(req.user!.userId, { attributes: ['default_filters'] });
    const profileStates = ((me?.default_filters as Record<string, unknown> | null)?.states as string[] | undefined) || [];
    const effectiveStates = profileStates.length > 0 ? profileStates : parseStatesParam(req.query.states);
    const leads = await getLeadsForToday({
      states: effectiveStates,
      state: req.query.state as string | undefined,
      city: req.query.city as string | undefined,
      campaign_id: req.query.campaign_id as string | undefined,
    });

    // Look up sender details once so both this and the lookup endpoint use
    // the same value for the AI prompt (and so any name change propagates).
    const todaySettings = await getOutreachSettings();
    const todaySenderName = todaySettings.sender_name;
    const todaySenderFirst = todaySenderName.split(' ')[0];

    const result = await Promise.all(leads.map(async c => {
      const stepInfo = getStepInfo(c);
      const channel = stepInfo?.channel || 'email';
      const campaign = c.campaign || (c as any).outreachCampaign;
      const vars = await mergeVariables(c, campaign);

      // For LinkedIn steps, use the shared cache helper so /today and
      // /lookup-by-linkedin-url return identical text. Cache hits avoid the
      // OpenAI call entirely.
      let linkedinMessage: string | null = null;
      let linkedinUrl: string | null = c.linkedin_url || null;
      let aiError: string | null = null;
      if (channel.startsWith('linkedin') && stepInfo?.prompt) {
        const draft = await getOrGenerateLinkedInDraft({
          lead: c,
          campaign,
          channel,
          stepPrompt: stepInfo.prompt,
          vars,
          senderName: todaySenderName,
          senderFirstName: todaySenderFirst,
        });
        if (draft.body) linkedinMessage = draft.body;
        if (draft.error) aiError = draft.error;
      }
      return {
        contact_id: c.id,
        name: `${c.first_name} ${c.last_name}`.trim(),
        email: c.email,
        state: c.state || null,
        city: c.city || null,
        relationship_type: c.lead_source || 'past_client',
        sequence_stage: c.sequence_stage,
        suggested_action: channel === 'linkedin_connect' ? 'Send Connection Request' :
          channel === 'linkedin_message' ? 'Send LinkedIn Message' :
          getSuggestedAction(c.sequence_stage),
        priority_score: c.priority_score,
        vertical: c.vertical,
        tier: c.tier,
        campaign_id: c.campaign_id,
        message_context: getMessageContext(c),
        channel,
        linkedin_url: linkedinUrl,
        linkedin_message: linkedinMessage,
        ai_error: aiError,
        draft: channel === 'email' ? await generateDraft(c, campaign?.ai_system_prompt) : { subject: '', body: linkedinMessage || '', prompt: '', source: 'template' as const },
        status: c.outreach_status,
        // Attachment control for the per-send checkbox on this card. document =
        // the campaign's document (null if none); default = whether THIS step is
        // already configured to attach it.
        attachment_document: campaignAttachmentDoc(campaign),
        attachment_default: !!(stepInfo as any)?.attachment_path,
      };
    }));

    res.json(result);
  } catch (error) { next(error); }
});

// --- Swap Lead (campaign selector changes the contact) ---

router.post('/swap-lead', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { current_lead_id, campaign_id } = req.body;
    if (!campaign_id) return res.status(400).json({ error: 'campaign_id is required' });

    // Find the next available lead from this campaign not already shown
    const excludeIds = current_lead_id ? [current_lead_id] : [];
    const newLead = await Lead.findOne({
      where: {
        campaign_id,
        outreach_status: 'ACTIVE',
        status: 'active',
        id: { [Op.notIn]: excludeIds },
        [Op.or]: [
          { next_action_at: null },
          { next_action_at: { [Op.lte]: new Date() } },
        ],
      },
      include: [{ model: Campaign, as: 'outreachCampaign', attributes: ['id', 'name', 'ai_system_prompt', 'settings', 'sequence_steps'], required: false }],
      order: [['created_at', 'ASC']],
    });

    if (!newLead) {
      return res.status(404).json({ error: 'No more leads available in this campaign' });
    }

    const campaign = (newLead as any).outreachCampaign;
    const stepInfo = getStepInfo(newLead);
    const channel = stepInfo?.channel || 'email';
    const vars = await mergeVariables(newLead, campaign);

    // Generate LinkedIn message if this step is LinkedIn (matches /today endpoint behavior)
    let linkedinMessage: string | null = null;
    let aiError: string | null = null;
    if (channel.startsWith('linkedin') && stepInfo?.prompt) {
      const interpolatedPrompt = interpolateVariables(stepInfo.prompt, vars);
      const apiKey = process.env.OPENAI_API_KEY;
      const maxChars = channel === 'linkedin_connect' ? 300 : 400;
      const styleNote = channel === 'linkedin_connect'
        ? '2 sentences max. Hook + ask. Under 300 chars.'
        : '2-3 sentences max. Sound like a real person messaging another person, not a marketing pitch. No paragraph blocks. No "I hope this finds you well". Under 400 chars.';
      if (!apiKey) {
        aiError = 'OPENAI_API_KEY is not configured on the server.';
      } else {
        try {
          const aiResp = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: process.env.AI_MODEL || 'gpt-4o',
              messages: [
                { role: 'system', content: `You are writing a LinkedIn ${channel === 'linkedin_connect' ? 'connection request note' : 'follow-up direct message'}. This is LinkedIn, NOT an email. ${styleNote} Generate ONLY the final message text. No instructions, no labels, no quotation marks. Ready to copy and paste directly. Hard cap: ${maxChars} characters total.` },
                { role: 'user', content: interpolatedPrompt },
              ],
              temperature: 0.7,
              max_tokens: 256,
            }),
          });
          if (aiResp.ok) {
            const aiData = (await aiResp.json()) as any;
            recordLlmUsage({ source: 'outreach_route:swap_lead_linkedin', usage: aiData.usage });
            const msg = (aiData.choices?.[0]?.message?.content || '').trim();
            if (msg) linkedinMessage = msg;
            else aiError = 'AI returned an empty response.';
          } else {
            const errBody = await aiResp.text().catch(() => '');
            logger.warn('LinkedIn AI generation failed in /swap-lead', {
              channel, status: aiResp.status, error: errBody.slice(0, 200),
            });
            aiError = aiResp.status === 429
              ? 'AI is unavailable: OpenAI quota exceeded. Top up billing at platform.openai.com.'
              : `AI is unavailable (upstream ${aiResp.status}). Try again in a moment.`;
          }
        } catch (e) {
          logger.warn('LinkedIn AI generation threw in /swap-lead', {
            channel, error: (e as Error).message,
          });
          aiError = 'AI is unavailable (network error). Try again in a moment.';
        }
      }
      // Hard-cap on AI output. Do NOT fall back to the raw prompt template.
      if (linkedinMessage && linkedinMessage.length > maxChars) {
        linkedinMessage = linkedinMessage.slice(0, maxChars).trim();
      }
    }

    const draft = channel === 'email'
      ? await generateDraft(newLead, campaign?.ai_system_prompt)
      : { subject: '', body: linkedinMessage || '', prompt: '', source: 'template' as const };

    res.json({
      contact_id: newLead.id,
      name: `${newLead.first_name} ${newLead.last_name}`.trim(),
      email: newLead.email,
      relationship_type: newLead.lead_source || 'past_client',
      sequence_stage: newLead.sequence_stage,
      suggested_action: channel === 'linkedin_connect' ? 'Send Connection Request' :
        channel === 'linkedin_message' ? 'Send LinkedIn Message' :
        (newLead.sequence_stage === 1 ? 'Initial Outreach' : 'Follow-up'),
      priority_score: newLead.priority_score,
      vertical: newLead.vertical,
      tier: newLead.tier,
      campaign_id: newLead.campaign_id,
      message_context: getMessageContext(newLead),
      channel,
      linkedin_url: newLead.linkedin_url,
      linkedin_message: linkedinMessage,
      ai_error: aiError,
      draft,
      status: newLead.outreach_status,
    });
  } catch (error) {
    logger.error('POST /swap-lead failed', { error: (error as Error).message });
    next(error);
  }
});

// --- Rewrite Draft ---

router.post('/rewrite-draft', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { lead_id, tone, current_subject, current_body, channel: rawChannel } = req.body;
    if (!lead_id) return res.status(400).json({ error: 'lead_id is required' });
    if (!tone || !['shorter', 'personal', 'direct'].includes(tone)) {
      return res.status(400).json({ error: 'tone must be shorter, personal, or direct' });
    }

    const lead = await Lead.findByPk(lead_id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OpenAI API key not configured' });

    const settings = await getOutreachSettings();
    const senderFirst = settings.sender_name.split(' ')[0];
    const channel: string = typeof rawChannel === 'string' ? rawChannel : 'email';
    const isLinkedIn = channel.startsWith('linkedin');
    const linkedInMaxChars = channel === 'linkedin_connect' ? 300 : 1500;

    // Channel-aware prompt: emails get subject + body + sign-off; LinkedIn
    // messages have NO subject, NO sign-off line, and a hard char cap so the
    // rewrite respects LinkedIn's 300-char connection-note limit.
    // Voice/style rules learned from sender feedback apply to rewrites too.
    const guardrailClause = settings.draft_guardrails && settings.draft_guardrails.trim()
      ? ` Additional guidance you MUST follow (from the sender's own feedback): ${settings.draft_guardrails.trim()}`
      : '';
    const systemPrompt = isLinkedIn
      ? `You are rewriting a LinkedIn ${channel === 'linkedin_connect' ? 'connection request note' : 'message'} as ${settings.sender_name}, ${settings.sender_role}. ${LINKEDIN_TONE_INSTRUCTIONS[tone]} Return ONLY the rewritten message text -- no JSON, no labels, no quotation marks, no greeting/sign-off boilerplate beyond what's natural in a LinkedIn note. The message MUST be under ${linkedInMaxChars} characters. The recipient is ${lead.first_name} ${lead.last_name} at ${lead.company || 'their company'}.${guardrailClause}`
      : `You are rewriting an outreach email as ${settings.sender_name}, ${settings.sender_role}. ${EMAIL_TONE_INSTRUCTIONS[tone]} Return JSON with "subject" and "body" fields only. Sign off as ${senderFirst}. Plain text, no HTML.${guardrailClause}`;

    const userPrompt = isLinkedIn
      ? `Current message:\n${current_body || ''}`
      : `Current subject: ${current_subject || 'Quick note'}\n\nCurrent body:\n${current_body || ''}\n\nRecipient: ${lead.first_name} ${lead.last_name} at ${lead.company || 'their company'}`;

    const aiResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: isLinkedIn ? 256 : 512,
      }),
    });

    if (!aiResp.ok) {
      const errBody = await aiResp.text().catch(() => '');
      logger.error('AI rewrite upstream failure', { tone, channel, status: aiResp.status, error: errBody.slice(0, 200) });
      return res.status(502).json({ error: `AI rewrite failed (upstream ${aiResp.status})` });
    }

    const data = (await aiResp.json()) as any;
    recordLlmUsage({ source: 'outreach_route:rewrite_draft', usage: data.usage });
    const raw = (data.choices?.[0]?.message?.content || '').trim();
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    if (isLinkedIn) {
      // LinkedIn rewrites return raw text (no JSON). Slice to channel cap so
      // any AI overrun gets enforced.
      let body = cleaned;
      if (body.length > linkedInMaxChars) body = body.slice(0, linkedInMaxChars).trim();
      // Persist the rewritten message to the lead's draft cache so the Chrome
      // extension (which reads the cache) reflects the tone change too.
      await writeCachedLinkedInDraft(lead.id, {
        stage: lead.sequence_stage,
        body,
        at: new Date().toISOString(),
        source: 'rewrite',
      });
      recordAgentRun('draft_rewriter', { tone, channel }).catch(() => {});
      return res.json({ subject: current_subject || '', body, source: 'ai' });
    }

    try {
      const parsed = JSON.parse(cleaned);
      recordAgentRun('draft_rewriter', { tone, channel }).catch(() => {});
      res.json({ subject: parsed.subject || current_subject, body: parsed.body || current_body, source: 'ai' });
    } catch {
      recordAgentRun('draft_rewriter', { tone, channel }).catch(() => {});
      res.json({ subject: current_subject, body: cleaned, source: 'ai' });
    }
  } catch (error) {
    logger.error('POST /rewrite-draft failed', { error: (error as Error).message });
    next(error);
  }
});

const EMAIL_TONE_INSTRUCTIONS: Record<string, string> = {
  shorter: 'Rewrite this email to be significantly shorter and more concise. Cut it to 3-4 sentences max. Keep the core ask but remove all filler.',
  personal: 'Rewrite this email with a warmer, more personal tone. Reference a genuine connection or shared interest. Make it feel like a personal note, not a business email.',
  direct: 'Rewrite this email to be more direct and action-oriented. Lead with the value proposition. End with a specific, clear call-to-action with a suggested time.',
};

const LINKEDIN_TONE_INSTRUCTIONS: Record<string, string> = {
  shorter: 'Rewrite this LinkedIn note to be significantly shorter. Cut filler ruthlessly while keeping the hook and the ask. Aim for 1-2 sentences. Do not exceed the character cap.',
  personal: 'Rewrite this LinkedIn note in a warmer, more personal voice. Reference shared context if obvious from the recipient name/company. Sound like a real person, not a templated pitch.',
  direct: 'Rewrite this LinkedIn note to be more direct. Lead with what you do and why it matters to them. End with a specific ask.',
};

// --- Test Mode ---

router.get('/test-sends/count', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const count = await getTestSendCount();
    res.json({ count });
  } catch (error) { next(error); }
});

router.post('/test-sends/reset', authorize('campaigns:write'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await resetTestSends();
    logger.info('Test sends reset', { reset: result.reset });
    res.json(result);
  } catch (error) {
    logger.error('Failed to reset test sends', { error: (error as Error).message });
    next(error);
  }
});

// --- Contact Actions ---

router.post('/:id/campaign', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lead = await Lead.findByPk(req.params.id as string);
    if (!lead) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const { campaign_id, preserve_stage } = req.body;
    const previousCampaignId = lead.campaign_id;
    const movingToNewCampaign = campaign_id && campaign_id !== previousCampaignId;
    // Ryan WhatsApp 2026-06-01: re-categorizing a contact across industries
    // should keep their existing outreach progress (e.g. LinkedIn connection
    // already pending at stage 3), not bounce them back to stage 1.
    // Default to preserving stage; callers can opt-out with preserve_stage=false.
    const shouldPreserveStage = preserve_stage !== false;
    const previousStage = lead.sequence_stage;

    lead.campaign_id = campaign_id || null;
    if (movingToNewCampaign) {
      // Clamp to the new campaign's max so we never exceed its sequence_steps,
      // and read its name so we can set a truthful vertical badge.
      const newCampaign = await Campaign.findByPk(campaign_id, { attributes: ['name', 'sequence_steps'] });
      const newMaxSteps = (newCampaign?.sequence_steps as any[] | null)?.length || 3;
      if (shouldPreserveStage) {
        lead.sequence_stage = Math.min(previousStage, newMaxSteps);
        // Reset the timer so they show up today in the new campaign's queue
        // instead of waiting on the old next_action_at.
        lead.next_action_at = null;
      } else {
        lead.sequence_stage = 1;
        lead.next_action_at = null;
      }

      // Manual reassignment is AUTHORITATIVE (Ali decision 2026-06-19). Ryan is
      // frequently correcting bad Apollo industry data, so we trust his campaign
      // choice over the industry-derived vertical: set the badge to match the
      // chosen campaign and stamp the lead as manually categorized. That stamp
      // tells the auto-route sweep and the pre-send category gate to leave this
      // lead alone instead of bouncing it back to the industry's campaign.
      const manualVertical = campaignVertical(newCampaign?.name);
      if (manualVertical) lead.vertical = manualVertical;
      const notes = { ...(lead.notes as Record<string, unknown> || {}) };
      notes.category_source = 'manual';
      delete notes.category_review;
      // Ryan WhatsApp 2026-06-20: moving a contact to a new campaign left the
      // OLD campaign's LinkedIn message showing after a refresh. The cached
      // draft (notes.linkedin_draft) is keyed only by sequence_stage, so a
      // same-stage campaign move did not invalidate it. Clear it here so the
      // message is regenerated for the new campaign's prompt. The fresh draft
      // generated below is written back to the cache so the refresh is a hit.
      delete notes.linkedin_draft;
      lead.notes = notes;
    }
    await lead.save();

    // If they unassigned (campaign_id=null), short-circuit -- nothing to draft
    if (!campaign_id) {
      return res.json({ contact_id: lead.id, campaign_id: null });
    }

    // Re-fetch with campaign relation so we can build the full contact card
    // with a freshly-generated draft (same shape as /today and /swap-lead).
    const updated = await Lead.findByPk(lead.id, {
      include: [{ model: Campaign, as: 'outreachCampaign', attributes: ['id', 'name', 'ai_system_prompt', 'settings', 'sequence_steps'], required: false }],
    });
    if (!updated) {
      return res.status(404).json({ error: 'Contact not found after move' });
    }

    const campaign = (updated as any).outreachCampaign;
    const stepInfo = getStepInfo(updated);
    const channel = stepInfo?.channel || 'email';
    const vars = await mergeVariables(updated, campaign);

    let linkedinMessage: string | null = null;
    let aiError: string | null = null;
    if (channel.startsWith('linkedin') && stepInfo?.prompt) {
      const interpolatedPrompt = interpolateVariables(stepInfo.prompt, vars);
      const apiKey = process.env.OPENAI_API_KEY;
      const maxChars = channel === 'linkedin_connect' ? 300 : 400;
      const styleNote = channel === 'linkedin_connect'
        ? '2 sentences max. Hook + ask. Under 300 chars.'
        : '2-3 sentences max. Sound like a real person messaging another person, not a marketing pitch. No paragraph blocks. No "I hope this finds you well". Under 400 chars.';
      if (!apiKey) {
        aiError = 'OPENAI_API_KEY is not configured on the server.';
      } else {
        try {
          const aiResp = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: process.env.AI_MODEL || 'gpt-4o',
              messages: [
                { role: 'system', content: `You are writing a LinkedIn ${channel === 'linkedin_connect' ? 'connection request note' : 'follow-up direct message'}. This is LinkedIn, NOT an email. ${styleNote} Generate ONLY the final message text. No instructions, no labels, no quotation marks. Ready to copy and paste directly. Hard cap: ${maxChars} characters total.` },
                { role: 'user', content: interpolatedPrompt },
              ],
              temperature: 0.7,
              max_tokens: 256,
            }),
          });
          if (aiResp.ok) {
            const aiData = (await aiResp.json()) as any;
            recordLlmUsage({ source: 'outreach_route:campaign_move_linkedin', usage: aiData.usage });
            const msg = (aiData.choices?.[0]?.message?.content || '').trim();
            if (msg) linkedinMessage = msg;
            else aiError = 'AI returned an empty response.';
          } else {
            const errBody = await aiResp.text().catch(() => '');
            logger.warn('LinkedIn AI generation failed in /:id/campaign', {
              channel, status: aiResp.status, error: errBody.slice(0, 200),
            });
            aiError = aiResp.status === 429
              ? 'AI is unavailable: OpenAI quota exceeded. Top up billing at platform.openai.com.'
              : `AI is unavailable (upstream ${aiResp.status}). Try again in a moment.`;
          }
        } catch (e) {
          logger.warn('LinkedIn AI generation threw in /:id/campaign', {
            channel, error: (e as Error).message,
          });
          aiError = 'AI is unavailable (network error). Try again in a moment.';
        }
      }
      if (linkedinMessage && linkedinMessage.length > maxChars) {
        linkedinMessage = linkedinMessage.slice(0, maxChars).trim();
      }
      // Persist the freshly generated message so a page refresh (which reads the
      // cached draft) shows THIS new-campaign message instead of reverting to a
      // stale one. Pairs with the cache invalidation on the move above.
      if (linkedinMessage) {
        await writeCachedLinkedInDraft(updated.id, {
          stage: updated.sequence_stage,
          body: linkedinMessage,
          at: new Date().toISOString(),
          source: 'ai',
        });
      }
    }

    const draft = channel === 'email'
      ? await generateDraft(updated, campaign?.ai_system_prompt)
      : { subject: '', body: linkedinMessage || '', prompt: '', source: 'template' as const };

    res.json({
      contact_id: updated.id,
      name: `${updated.first_name} ${updated.last_name}`.trim(),
      email: updated.email,
      relationship_type: updated.lead_source || 'past_client',
      sequence_stage: updated.sequence_stage,
      suggested_action: channel === 'linkedin_connect' ? 'Send Connection Request' :
        channel === 'linkedin_message' ? 'Send LinkedIn Message' :
        (updated.sequence_stage === 1 ? 'Initial Outreach' : 'Follow-up'),
      priority_score: updated.priority_score,
      vertical: updated.vertical,
      tier: updated.tier,
      campaign_id: updated.campaign_id,
      message_context: getMessageContext(updated),
      channel,
      linkedin_url: updated.linkedin_url,
      linkedin_message: linkedinMessage,
      ai_error: aiError,
      draft,
      status: updated.outreach_status,
      moved_from_campaign_id: movingToNewCampaign ? previousCampaignId : null,
      stage_preserved: movingToNewCampaign && shouldPreserveStage && updated.sequence_stage === Math.min(previousStage, ((campaign?.sequence_steps as any[] | null)?.length || 3)),
      previous_stage: movingToNewCampaign ? previousStage : null,
    });
  } catch (error) {
    logger.error('POST /:id/campaign failed', { error: (error as Error).message });
    next(error);
  }
});

router.post('/:id/advance', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get lead with campaign before advancing
    const leadBefore = await Lead.findByPk(req.params.id as string, {
      include: [{ model: Campaign, as: 'outreachCampaign', attributes: ['id', 'name', 'ai_system_prompt', 'settings', 'sequence_steps'], required: false }],
    });

    if (!leadBefore) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const campaign = (leadBefore as any).outreachCampaign;
    const stepInfo = getStepInfo(leadBefore);
    const channel = stepInfo?.channel || 'email';

    // Send email if this is an email step
    let emailResult: any = null;
    if (channel === 'email') {
      const { subject, body } = req.body || {};
      let emailSubject = subject;
      let emailBody = body;

      // If no subject/body provided, generate the draft
      if (!emailSubject || !emailBody) {
        const draft = await generateDraft(leadBefore, campaign?.ai_system_prompt);
        emailSubject = draft.subject;
        emailBody = draft.body;
      }

      // Per BC 9950199280 + Ryan WhatsApp 2026-06-01: per-campaign
      // sender_email wins over the name-based router so the ryan@ vs
      // rlandry@ drift cannot recur. resolveSender trims whitespace
      // and falls back to SENDER_MAP only if nothing is configured.
      const senderEmail = resolveSender({
        campaignSenderEmail: (campaign?.settings as any)?.sender_email || null,
        campaignName: campaign?.name || '',
        vertical: leadBefore.vertical,
      });

      // Identity comes from the FROM-ADDRESS's profile, not a campaign-level
      // sender_name default. This is the fix for sends leaving percy@/gnecker@
      // while still signed "Ryan Landry": the person who owns the mailbox owns
      // the display name + signature. Campaign/global values are only a
      // fallback when the address has no profile.
      const profile = await getSenderProfile(senderEmail);
      const senderName = profile?.name || (campaign?.settings as any)?.sender_name || 'Ryan Landry';

      // Test mode: redirect to test email, keep lead's name/subject/body intact
      const globalSettings = await getOutreachSettings();
      const recipientEmail = globalSettings.test_mode && globalSettings.test_email
        ? globalSettings.test_email
        : leadBefore.email;

      if (globalSettings.test_mode) {
        logger.info('Test mode: redirecting email', { originalTo: leadBefore.email, testTo: globalSettings.test_email, lead: `${leadBefore.first_name} ${leadBefore.last_name}` });
        // Track state before advance so it can be undone
        await trackTestSend(leadBefore);
      }

      // Signature follows the same identity rule: the sender's own profile
      // signature wins, then any campaign override, then the global default.
      const signature = profile?.signature || (campaign?.settings as any)?.email_signature || globalSettings.email_signature || '';

      // Personalization safety-net: strip any residual {{token}} and fix an
      // empty greeting ("Hi ,") so a merge-field miss never ships literally to
      // the prospect. Idempotent on already-filled text. Logged when it fires.
      try {
        const vars = await mergeVariables(leadBefore, campaign);
        const ps = personalize(emailSubject || '', vars);
        const pb = personalize(emailBody || '', vars);
        emailSubject = ps.text;
        emailBody = pb.text;
        const issues = [...new Set([...ps.unresolved, ...pb.unresolved])];
        if (issues.length || ps.fallbacksUsed.length || pb.fallbacksUsed.length) {
          logger.warn('Personalization guard adjusted outbound email', {
            lead_id: leadBefore.id, unresolved: issues,
            fallbacks: [...new Set([...ps.fallbacksUsed, ...pb.fallbacksUsed])],
          });
        }
      } catch (e) {
        logger.warn('Personalization guard skipped (non-fatal)', { lead_id: leadBefore.id, error: (e as Error).message });
      }

      // Ryan WhatsApp 2026-06-01 ask: attach the investor deck on a specific
      // investor-campaign step, intro deck after the second industry touch.
      // The step declares the file via sequence_steps[i].attachment_path
      // (relative to OUTREACH_ATTACHMENTS_DIR). We load + base64-encode here
      // and forward to Graph. Missing file logs a warning and the send still
      // goes out without the attachment rather than failing the whole step.
      // Per-send override from the review queue checkbox (req.body.attach_document):
      //   true  -> attach the campaign document (even if this step was not configured to)
      //   false -> attach nothing this send
      //   undefined (legacy/API callers) -> fall back to the step's own attachment_path
      const stepDoc = (stepInfo as any)?.attachment_path as string | undefined;
      const explicitAttach = (req.body || {}).attach_document as boolean | undefined;
      let attachmentPath: string | undefined;
      if (explicitAttach === true) attachmentPath = campaignAttachmentDoc(campaign) || stepDoc;
      else if (explicitAttach === false) attachmentPath = undefined;
      else attachmentPath = stepDoc;
      const attachments = attachmentPath
        ? [await loadAttachmentFromPath(attachmentPath)].filter((a): a is NonNullable<typeof a> => a !== null)
        : undefined;

      emailResult = await sendOutreachEmail({
        to: recipientEmail,
        subject: globalSettings.test_mode ? `[TEST -> ${leadBefore.email}] ${emailSubject}` : emailSubject,
        body: emailBody,
        from: senderEmail,
        senderName,
        signature,
        attachments,
        lead_id: leadBefore.id,
        campaign_id: leadBefore.campaign_id || null,
        delivery_mode: globalSettings.test_mode ? 'test' : 'live',
      });
    }

    // Advance the lead
    const lead = await advanceLead(req.params.id as string);
    if (!lead) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const settings = await getOutreachSettings();
    res.json({
      contact_id: lead.id,
      sequence_stage: lead.sequence_stage,
      status: lead.outreach_status,
      next_action_at: lead.next_action_at,
      email_sent: emailResult?.success || false,
      email_from: emailResult?.from || null,
      channel,
      test_mode: settings.test_mode || false,
    });
  } catch (error) {
    if ((error as Error).message === 'Cannot advance a completed contact') {
      return res.status(400).json({ error: (error as Error).message });
    }
    next(error);
  }
});

router.post('/:id/skip', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lead = await skipLead(req.params.id as string);
    if (!lead) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({ contact_id: lead.id, next_action_at: lead.next_action_at });
  } catch (error) { next(error); }
});

router.post('/:id/remove', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await removeLeadFromCampaign(req.params.id as string);
    if (!result) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    res.json({
      contact_id: result.lead.id,
      removed_from_campaign_id: result.previousCampaignId,
    });
  } catch (error) { next(error); }
});

router.post('/:id/block', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reason = (req.body?.reason as string) || 'manual_block';
    const result = await blockLead(req.params.id as string, reason);
    if (!result) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    res.json({
      contact_id: result.lead.id,
      status: result.lead.status,
      dnc_created: result.dncCreated,
    });
  } catch (error) { next(error); }
});

/**
 * Header-level "report an issue" feedback for the Outreach page. Free text is
 * triaged by an LLM into a bounded, safe action (add a voice guardrail, change
 * an allow-listed setting, block/reassign a contact) and applied where safe;
 * everything else is held for review. A confirmation email goes out either way.
 * Not nested under /:id because most feedback is global, but an optional
 * contact_id scopes block/reassign actions to one contact.
 */
router.post('/feedback', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { submitOutreachFeedback } = await import('../../services/outreachFeedbackService');
    const category = String(req.body?.category || '').trim();
    if (!category) return res.status(400).json({ error: 'category is required' });
    const by = (req as any).user?.email || (req as any).user?.id || null;
    const result = await submitOutreachFeedback({
      contactId: req.body?.contact_id ? String(req.body.contact_id) : null,
      category,
      comment: req.body?.comment ? String(req.body.comment) : undefined,
      createdBy: by,
    });
    res.json(result);
  } catch (error) { next(error); }
});

router.get('/usage', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { getUsageSummary } = await import('../../services/usageStatsService');
    const summary = await getUsageSummary();
    res.json(summary);
  } catch (error) {
    logger.error('GET /usage failed', { error: (error as Error).message });
    next(error);
  }
});

/**
 * Look up a lead by their LinkedIn profile URL. Used by the Chrome extension
 * to figure out which lead Ryan is currently viewing on LinkedIn.
 *
 * Matching strategy: normalize the URL by stripping protocol, trailing
 * slashes, "www.", query params, and lowercasing the path. Then match on
 * the lead.linkedin_url after the same normalization.
 *
 * Returns 200 with { lead_id, name, company, sequence_stage, channel,
 *   draft_body, ai_error, linkedin_url } when matched (the extension uses
 *   draft_body to fill the connect note), or 404 when no match.
 */
router.get('/lookup-by-linkedin-url', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const raw = (req.query.url as string) || '';
    if (!raw) return res.status(400).json({ error: 'url query param required' });

    function normalize(u: string): string {
      try {
        let s = u.trim().toLowerCase();
        s = s.replace(/^https?:\/\//, '');
        s = s.replace(/^www\./, '');
        s = s.split('?')[0].split('#')[0];
        s = s.replace(/\/+$/, '');
        return s;
      } catch { return u.toLowerCase().trim(); }
    }

    const target = normalize(raw);

    // Pull all active leads with a linkedin_url. Cheap enough for the current
    // dataset (~8K rows). Switch to a normalized index column if this grows.
    const candidates = await Lead.findAll({
      where: { status: 'active', outreach_status: 'ACTIVE', linkedin_url: { [Op.ne]: null } },
      attributes: ['id', 'first_name', 'last_name', 'company', 'linkedin_url', 'sequence_stage', 'campaign_id', 'notes'],
      include: [{ model: Campaign, as: 'outreachCampaign', attributes: ['id', 'name', 'ai_system_prompt', 'settings', 'sequence_steps'], required: false }],
    });

    const match = candidates.find(l => l.linkedin_url && normalize(l.linkedin_url) === target);
    if (!match) return res.status(404).json({ error: 'No lead matches that LinkedIn URL' });

    const campaign = (match as any).outreachCampaign;
    const stepInfo = getStepInfo(match);
    const channel = stepInfo?.channel || 'email';
    const vars = await mergeVariables(match, campaign);

    // Use the shared cache helper so this endpoint returns identical text to
    // /today. Cache hits avoid the OpenAI call entirely.
    let body = '';
    let aiError: string | null = null;
    if (channel.startsWith('linkedin') && stepInfo?.prompt) {
      const lookupSettings = await getOutreachSettings();
      const senderName = lookupSettings.sender_name;
      const draft = await getOrGenerateLinkedInDraft({
        lead: match,
        campaign,
        channel,
        stepPrompt: stepInfo.prompt,
        vars,
        senderName,
        senderFirstName: senderName.split(' ')[0],
      });
      body = draft.body;
      aiError = draft.error;
    } else if (channel === 'email' && campaign) {
      aiError = `Next step is ${channel}, not LinkedIn. Nothing to insert here.`;
    }

    res.json({
      lead_id: match.id,
      name: `${match.first_name} ${match.last_name}`.trim(),
      company: match.company,
      linkedin_url: match.linkedin_url,
      sequence_stage: match.sequence_stage,
      campaign_id: match.campaign_id,
      campaign_name: campaign?.name || null,
      channel,
      draft_body: body,
      ai_error: aiError,
    });
  } catch (error) {
    logger.error('GET /lookup-by-linkedin-url failed', { error: (error as Error).message });
    next(error);
  }
});

router.post('/bounces/process', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { processBounces } = await import('../../services/bounceProcessorService');
    const hoursBack = req.body?.hours_back ? parseInt(req.body.hours_back, 10) : 72;
    const limit = req.body?.limit ? parseInt(req.body.limit, 10) : 100;
    const dryRun = req.body?.dry_run === true;
    const result = await processBounces({ hoursBack, limit, dryRun });
    res.json(result);
  } catch (error) {
    logger.error('POST /bounces/process failed', { error: (error as Error).message });
    next(error);
  }
});

export default router;
