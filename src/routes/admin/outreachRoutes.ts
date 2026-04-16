import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { getLeadsForToday, getMessageContext, generateDraft, advanceLead, skipLead, getOutreachSettings, updateOutreachSettings, getStepInfo, interpolateVariables, mergeVariables, trackTestSend, resetTestSends, getTestSendCount } from '../../services/outreachQueryService';
import { Op } from 'sequelize';
import { Lead } from '../../models/Lead';
import { Campaign } from '../../models/Campaign';
import { createSequence } from '../../services/sequenceService';
import { validateEmail, validateBatch } from '../../services/emailValidationService';
import { sendOutreachEmail, getSenderForCampaign, testConnection } from '../../services/outreachEmailService';
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
    const campaign = await Campaign.findByPk(campaignId);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const variables = (campaign.settings as any)?.variables || {};
    const varList = Object.entries(variables).map(([k, v]) => `{{${k}}} = "${v}"`).join('\n');
    const currentPrompt = campaign.ai_system_prompt || '';
    const currentSteps = campaign.sequence_steps || [];

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'OpenAI API key not configured' });

    const systemInstruction = `You are rewriting outreach email prompts for a campaign. You will be given the current campaign prompt, the current sequence step prompts, and a list of available variables with their values.

Your job:
1. Rewrite the campaign prompt to incorporate ALL available variables naturally using {{variable_name}} syntax
2. Rewrite each sequence step prompt to use the variables appropriately
3. Step 1 should be an initial outreach (warm, direct)
4. Step 2 should be a follow-up with added value (reference proof points)
5. Step 3 should be a graceful final touch (brief, leave door open)
6. Keep the existing tone and structure but make sure every relevant variable is used
7. Do NOT invent new variables. Only use the ones provided.
8. Return JSON with "campaign_prompt" (string) and "steps" (array of {step, delay_days, prompt})

Important: Keep prompts concise. Campaign prompt under 200 words. Step 1 under 100 words. Step 2 under 80 words. Step 3 under 70 words.`;

    const userContent = `AVAILABLE VARIABLES:\n${varList}\n\nCURRENT CAMPAIGN PROMPT:\n${currentPrompt}\n\nCURRENT STEPS:\n${JSON.stringify(currentSteps, null, 2)}`;

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
    const raw = (data.choices?.[0]?.message?.content || '').trim();
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);

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

router.get('/today', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const leads = await getLeadsForToday();

    const result = await Promise.all(leads.map(async c => {
      const stepInfo = getStepInfo(c);
      const channel = stepInfo?.channel || 'email';
      const campaign = c.campaign || (c as any).outreachCampaign;
      const vars = await mergeVariables(c, campaign);

      // For LinkedIn steps, generate a clean message via AI (no variables or instructions visible)
      let linkedinMessage: string | null = null;
      let linkedinUrl: string | null = c.linkedin_url || null;
      if (channel.startsWith('linkedin') && stepInfo?.prompt) {
        const interpolatedPrompt = interpolateVariables(stepInfo.prompt, vars);
        // Use AI to generate the actual clean message
        const apiKey = process.env.OPENAI_API_KEY;
        if (apiKey) {
          try {
            const maxChars = channel === 'linkedin_connect' ? 280 : 500;
            const aiResp = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
              body: JSON.stringify({
                model: process.env.AI_MODEL || 'gpt-4o',
                messages: [
                  { role: 'system', content: `Generate ONLY the final message text. No instructions, no labels, no quotation marks. The message must be ready to copy and paste directly. Max ${maxChars} characters.` },
                  { role: 'user', content: interpolatedPrompt },
                ],
                temperature: 0.7,
                max_tokens: 256,
              }),
            });
            if (aiResp.ok) {
              const aiData = (await aiResp.json()) as any;
              const msg = (aiData.choices?.[0]?.message?.content || '').trim();
              if (msg) linkedinMessage = msg;
            }
          } catch {}
        }
        // Fallback: use interpolated prompt stripped of instruction text
        if (!linkedinMessage) {
          linkedinMessage = interpolatedPrompt;
        }
      }

      return {
        contact_id: c.id,
        name: `${c.first_name} ${c.last_name}`.trim(),
        email: c.email,
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
        draft: channel === 'email' ? await generateDraft(c, campaign?.ai_system_prompt) : { subject: '', body: linkedinMessage || '', prompt: '', source: 'template' as const },
        status: c.outreach_status,
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
    const draft = channel === 'email' ? await generateDraft(newLead, campaign?.ai_system_prompt) : { subject: '', body: '', prompt: '', source: 'template' as const };

    res.json({
      contact_id: newLead.id,
      name: `${newLead.first_name} ${newLead.last_name}`.trim(),
      email: newLead.email,
      relationship_type: newLead.lead_source || 'past_client',
      sequence_stage: newLead.sequence_stage,
      suggested_action: channel === 'email' ? (newLead.sequence_stage === 1 ? 'Initial Outreach' : 'Follow-up') : 'LinkedIn',
      priority_score: newLead.priority_score,
      vertical: newLead.vertical,
      tier: newLead.tier,
      campaign_id: newLead.campaign_id,
      message_context: getMessageContext(newLead),
      channel,
      linkedin_url: newLead.linkedin_url,
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
    const { lead_id, tone, current_subject, current_body } = req.body;
    if (!lead_id) return res.status(400).json({ error: 'lead_id is required' });
    if (!tone || !['shorter', 'personal', 'direct'].includes(tone)) {
      return res.status(400).json({ error: 'tone must be shorter, personal, or direct' });
    }

    const lead = await Lead.findByPk(lead_id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const toneInstructions: Record<string, string> = {
      shorter: 'Rewrite this email to be significantly shorter and more concise. Cut it to 3-4 sentences max. Keep the core ask but remove all filler.',
      personal: 'Rewrite this email with a warmer, more personal tone. Reference a genuine connection or shared interest. Make it feel like a personal note, not a business email.',
      direct: 'Rewrite this email to be more direct and action-oriented. Lead with the value proposition. End with a specific, clear call-to-action with a suggested time.',
    };

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OpenAI API key not configured' });

    const settings = await getOutreachSettings();
    const senderFirst = settings.sender_name.split(' ')[0];

    const aiResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'gpt-4o',
        messages: [
          { role: 'system', content: `You are rewriting an outreach email as ${settings.sender_name}, ${settings.sender_role}. ${toneInstructions[tone]} Return JSON with "subject" and "body" fields only. Sign off as ${senderFirst}. Plain text, no HTML.` },
          { role: 'user', content: `Current subject: ${current_subject || 'Quick note'}\n\nCurrent body:\n${current_body || ''}\n\nRecipient: ${lead.first_name} ${lead.last_name} at ${lead.company || 'their company'}` },
        ],
        temperature: 0.7,
        max_tokens: 512,
      }),
    });

    if (!aiResp.ok) return res.status(500).json({ error: 'AI rewrite failed' });

    const data = (await aiResp.json()) as any;
    const raw = (data.choices?.[0]?.message?.content || '').trim();
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    try {
      const parsed = JSON.parse(cleaned);
      res.json({ subject: parsed.subject || current_subject, body: parsed.body || current_body, source: 'ai' });
    } catch {
      // If JSON parse fails, use the raw text as body
      res.json({ subject: current_subject, body: cleaned, source: 'ai' });
    }
  } catch (error) {
    logger.error('POST /rewrite-draft failed', { error: (error as Error).message });
    next(error);
  }
});

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

    const { campaign_id } = req.body;
    lead.campaign_id = campaign_id || null;
    await lead.save();

    res.json({ contact_id: lead.id, campaign_id: lead.campaign_id });
  } catch (error) { next(error); }
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

      const senderEmail = getSenderForCampaign(campaign?.name || '', leadBefore.vertical);
      const senderName = campaign?.settings?.sender_name || 'Ryan Landry';

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

      emailResult = await sendOutreachEmail({
        to: recipientEmail,
        subject: globalSettings.test_mode ? `[TEST -> ${leadBefore.email}] ${emailSubject}` : emailSubject,
        body: emailBody,
        from: senderEmail,
        senderName,
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

export default router;
