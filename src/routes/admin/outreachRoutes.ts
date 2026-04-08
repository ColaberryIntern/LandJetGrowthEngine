import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { getLeadsForToday, getMessageContext, generateDraft, advanceLead, skipLead, getOutreachSettings, updateOutreachSettings } from '../../services/outreachQueryService';
import { Lead } from '../../models/Lead';
import { Campaign } from '../../models/Campaign';
import { createSequence } from '../../services/sequenceService';
import { validateEmail, validateBatch } from '../../services/emailValidationService';

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

    const contacts = await Lead.findAll({
      where,
      order: [['created_at', 'ASC']],
      limit: 500,
    });
    res.json({ contacts, total: contacts.length });
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

    const contacts = await Lead.findAll({ where });

    const byStage: Record<number, number> = {};
    const byVertical: Record<string, number> = {};
    let active = 0, completed = 0, contacted = 0, neverContacted = 0;

    for (const c of contacts) {
      if (c.outreach_status === 'ACTIVE') active++;
      if (c.outreach_status === 'COMPLETED') completed++;
      if (c.last_contacted_at) contacted++;
      else neverContacted++;

      byStage[c.sequence_stage] = (byStage[c.sequence_stage] || 0) + 1;
      if (c.vertical) byVertical[c.vertical] = (byVertical[c.vertical] || 0) + 1;
    }

    res.json({
      total_contacts: contacts.length,
      active,
      completed,
      contacted,
      never_contacted: neverContacted,
      by_stage: byStage,
      by_vertical: byVertical,
    });
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

    let created = 0, skipped = 0;

    for (let i = 1; i < lines.length; i++) {
      const fields = lines[i].split(',').map((f: string) => f.trim());
      const email = (fields[emailIdx] || '').toLowerCase();
      if (!email || !email.includes('@')) { skipped++; continue; }

      const name = nameIdx >= 0 ? fields[nameIdx] || email : email;
      const company = companyIdx >= 0 ? fields[companyIdx] || null : null;

      const nameParts = name.split(/\s+/);
      const firstName = nameParts[0] || email;
      const lastName = nameParts.slice(1).join(' ') || '';

      const existing = await Lead.findOne({ where: { email } });
      if (!existing) {
        await Lead.create({
          first_name: firstName,
          last_name: lastName,
          email,
          phone: null,
          company,
          title: null,
          industry: null,
          company_size: null,
          annual_revenue: null,
          linkedin_url: null,
          lead_source: 'upload',
          lead_source_type: 'warm',
          temperature: 'warm',
          pipeline_stage: 'new_lead',
          lifecycle_stage: null,
          notes: null,
          technology_stack: null,
          utm_source: null,
          interest_area: null,
          campaign_id: campaignId === 'unclassified' ? null : campaignId,
          status: 'active',
        });
        created++;
      } else {
        if (campaignId !== 'unclassified') {
          existing.campaign_id = campaignId;
          await existing.save();
        }
        skipped++;
      }
    }

    res.json({ created, skipped, total: lines.length - 1 });
  } catch (error) { next(error); }
});

// --- Today's Outreach ---

router.get('/today', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const leads = await getLeadsForToday();

    const result = await Promise.all(leads.map(async c => ({
      contact_id: c.id,
      name: `${c.first_name} ${c.last_name}`.trim(),
      email: c.email,
      relationship_type: c.lead_source || 'past_client',
      sequence_stage: c.sequence_stage,
      suggested_action: getSuggestedAction(c.sequence_stage),
      priority_score: c.priority_score,
      vertical: c.vertical,
      tier: c.tier,
      campaign_id: c.campaign_id,
      message_context: getMessageContext(c),
      draft: await generateDraft(c, c.campaign?.ai_system_prompt),
      status: c.outreach_status,
    })));

    res.json(result);
  } catch (error) { next(error); }
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
    const lead = await advanceLead(req.params.id as string);
    if (!lead) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({
      contact_id: lead.id,
      sequence_stage: lead.sequence_stage,
      status: lead.outreach_status,
      next_action_at: lead.next_action_at,
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
