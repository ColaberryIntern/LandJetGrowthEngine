import { Op } from 'sequelize';

jest.mock('../../models/Lead', () => {
  const mockFindAll = jest.fn();
  const mockFindByPk = jest.fn();
  const mockFindOne = jest.fn();
  return {
    Lead: {
      findAll: mockFindAll,
      findByPk: mockFindByPk,
      findOne: mockFindOne,
    },
  };
});

jest.mock('../../models/Campaign', () => ({
  Campaign: {
    findAll: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../../models/SystemSetting', () => ({
  SystemSetting: {
    findByPk: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue([{}, true]),
  },
}));

import { Lead } from '../../models/Lead';
import { getLeadsForToday, computePriorityScore, getMessageContext, generateDraft, advanceLead, VERTICAL_PROMPTS, DEFAULT_PROMPT } from '../../services/outreachQueryService';

const mockFindAll = Lead.findAll as jest.MockedFunction<typeof Lead.findAll>;
const mockFindByPk = Lead.findByPk as jest.MockedFunction<typeof Lead.findByPk>;

function makeContact(overrides: Partial<any> = {}): any {
  return {
    id: 1,
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
    phone: '555-1234',
    company: null,
    lead_source: 'past_client',
    sequence_stage: 1,
    last_contacted_at: null,
    next_action_at: null,
    status: 'active',
    outreach_status: 'ACTIVE',
    priority_score: 0,
    vertical: null,
    tier: null,
    campaign_id: null,
    campaign: undefined,
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('computePriorityScore', () => {
  it('should give +3 for stage 1', () => {
    const contact = makeContact({ sequence_stage: 1, last_contacted_at: new Date() });
    expect(computePriorityScore(contact)).toBe(3);
  });

  it('should give +2 for stage 2', () => {
    const contact = makeContact({ sequence_stage: 2, last_contacted_at: new Date() });
    expect(computePriorityScore(contact)).toBe(2);
  });

  it('should give +1 for stage 3', () => {
    const contact = makeContact({ sequence_stage: 3, last_contacted_at: new Date() });
    expect(computePriorityScore(contact)).toBe(1);
  });

  it('should give +3 for never contacted', () => {
    const contact = makeContact({ sequence_stage: 99, last_contacted_at: null });
    expect(computePriorityScore(contact)).toBe(3);
  });

  it('should give +6 for stage 1 + never contacted', () => {
    const contact = makeContact({ sequence_stage: 1, last_contacted_at: null });
    expect(computePriorityScore(contact)).toBe(6);
  });

  it('should give 0 for stage 4+ with prior contact and no tier', () => {
    const contact = makeContact({ sequence_stage: 4, last_contacted_at: new Date() });
    expect(computePriorityScore(contact)).toBe(0);
  });

  it('should give +5 for tier 1', () => {
    const contact = makeContact({ sequence_stage: 4, last_contacted_at: new Date(), tier: 1 });
    expect(computePriorityScore(contact)).toBe(5);
  });

  it('should give +3 for tier 2', () => {
    const contact = makeContact({ sequence_stage: 4, last_contacted_at: new Date(), tier: 2 });
    expect(computePriorityScore(contact)).toBe(3);
  });

  it('should give +1 for tier 3', () => {
    const contact = makeContact({ sequence_stage: 4, last_contacted_at: new Date(), tier: 3 });
    expect(computePriorityScore(contact)).toBe(1);
  });

  it('should give 0 for null tier', () => {
    const contact = makeContact({ sequence_stage: 4, last_contacted_at: new Date(), tier: null });
    expect(computePriorityScore(contact)).toBe(0);
  });

  it('should stack tier + stage + never contacted', () => {
    const contact = makeContact({ sequence_stage: 1, last_contacted_at: null, tier: 1 });
    // stage 1 (+3) + never contacted (+3) + tier 1 (+5) = 11
    expect(computePriorityScore(contact)).toBe(11);
  });
});

describe('getLeadsForToday', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return contacts with priority_score attached', async () => {
    mockFindAll.mockResolvedValue([makeContact()] as any);

    const result = await getLeadsForToday();

    expect(result).toHaveLength(1);
    expect(result[0].priority_score).toBe(6); // stage 1 (+3) + never contacted (+3)
  });

  it('should sort by priority_score DESC then created_at ASC', async () => {
    const contactA = makeContact({
      id: 'aaa',
      first_name: 'Stage3',
      sequence_stage: 3,
      last_contacted_at: new Date(),
      created_at: new Date('2026-01-01'),
    });
    const contactB = makeContact({
      id: 'bbb',
      first_name: 'Stage1New',
      sequence_stage: 1,
      last_contacted_at: null,
      created_at: new Date('2026-01-15'),
    });
    const contactC = makeContact({
      id: 'ccc',
      first_name: 'Stage1Early',
      sequence_stage: 1,
      last_contacted_at: null,
      created_at: new Date('2026-01-02'),
    });

    mockFindAll.mockResolvedValue([contactA, contactB, contactC] as any);

    const result = await getLeadsForToday();

    // contactC and contactB both score 6, but contactC has earlier created_at
    // contactA scores 1
    expect(result[0].id).toBe('ccc');  // score 6, earlier date
    expect(result[1].id).toBe('bbb');  // score 6, later date
    expect(result[2].id).toBe('aaa');  // score 1
  });

  it('should query campaigns and then leads', async () => {
    mockFindAll.mockResolvedValue([]);

    await getLeadsForToday();

    // Called once for unassigned leads (campaigns mock returns [] separately)
    expect(mockFindAll).toHaveBeenCalled();
  });

  it('should return leads from unassigned pool when no campaigns exist', async () => {
    const contacts = [makeContact({ id: 1 }), makeContact({ id: 2 })];
    mockFindAll.mockResolvedValue(contacts as any);

    const result = await getLeadsForToday();

    expect(result.length).toBeGreaterThan(0);
  });

  it('should rank tier 1 contact above non-tier contact', async () => {
    const noTier = makeContact({
      id: 'no-tier',
      sequence_stage: 1,
      last_contacted_at: null,
      tier: null,
      created_at: new Date('2026-01-01'),
    });
    const tier1 = makeContact({
      id: 'tier-1',
      sequence_stage: 1,
      last_contacted_at: null,
      tier: 1,
      created_at: new Date('2026-01-15'),
    });

    mockFindAll.mockResolvedValue([noTier, tier1] as any);

    const result = await getLeadsForToday();

    // tier1: 3+3+5=11, noTier: 3+3+0=6
    expect(result[0].id).toBe('tier-1');
    expect(result[1].id).toBe('no-tier');
  });

  it('should return empty array when no contacts match', async () => {
    mockFindAll.mockResolvedValue([]);

    const result = await getLeadsForToday();

    expect(result).toEqual([]);
  });
});

describe('getMessageContext', () => {
  it('should return manufacturing message for MANUFACTURING vertical', () => {
    const contact = makeContact({ vertical: 'MANUFACTURING' });
    expect(getMessageContext(contact)).toBe('Replace your shuttle program with a mobile boardroom for your team.');
  });

  it('should return insurance message for INSURANCE vertical', () => {
    const contact = makeContact({ vertical: 'INSURANCE' });
    expect(getMessageContext(contact)).toBe('Enable your team to handle client conversations and prep work during travel.');
  });

  it('should return healthcare message for HEALTHCARE vertical', () => {
    const contact = makeContact({ vertical: 'HEALTHCARE' });
    expect(getMessageContext(contact)).toBe('Support your physicians and teams with productive travel between locations.');
  });

  it('should return default message for null vertical', () => {
    const contact = makeContact({ vertical: null });
    expect(getMessageContext(contact)).toContain('Reconnecting');
  });

  it('should return default message for unknown vertical', () => {
    const contact = makeContact({ vertical: 'SPORTS_EVENTS' });
    expect(getMessageContext(contact)).toContain('Reconnecting');
  });
});

describe('generateDraft', () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv, USE_AI_DRAFTS: undefined };
  });

  afterAll(() => {
    process.env = origEnv;
  });

  it('should include first name in body', async () => {
    const contact = makeContact({ first_name: 'John', vertical: 'MANUFACTURING' });
    const draft = await generateDraft(contact);
    expect(draft.body).toContain('Hi John,');
  });

  it('should include message context in body', async () => {
    const contact = makeContact({ vertical: 'MANUFACTURING' });
    const draft = await generateDraft(contact);
    expect(draft.body).toContain('mobile boardroom');
  });

  it('should set subject to Quick note', async () => {
    const contact = makeContact();
    const draft = await generateDraft(contact);
    expect(draft.subject).toBe('Quick note');
  });

  it('should sign off as Ryan', async () => {
    const contact = makeContact();
    const draft = await generateDraft(contact);
    expect(draft.body).toContain('Ryan');
  });

  it('should work for INSURANCE vertical', async () => {
    const contact = makeContact({ first_name: 'Jane', vertical: 'INSURANCE' });
    const draft = await generateDraft(contact);
    expect(draft.body).toContain('Hi Jane,');
    expect(draft.body).toContain('client conversations');
  });

  it('should work for HEALTHCARE vertical', async () => {
    const contact = makeContact({ first_name: 'Dr.', last_name: 'Bob', vertical: 'HEALTHCARE' });
    const draft = await generateDraft(contact);
    expect(draft.body).toContain('Hi Dr.,');
    expect(draft.body).toContain('physicians');
  });

  it('should use default message for null vertical', async () => {
    const contact = makeContact({ vertical: null });
    const draft = await generateDraft(contact);
    expect(draft.body).toContain('Reconnecting');
  });

  it('should include prompt field in draft', async () => {
    const contact = makeContact({ vertical: 'MANUFACTURING' });
    const draft = await generateDraft(contact);
    expect(draft.prompt).toBeDefined();
    expect(draft.prompt).toBe(VERTICAL_PROMPTS.MANUFACTURING);
  });

  it('should use vertical prompt when no campaign prompt', async () => {
    const contact = makeContact({ vertical: 'INSURANCE' });
    const draft = await generateDraft(contact);
    expect(draft.prompt).toBe(VERTICAL_PROMPTS.INSURANCE);
  });

  it('should use campaign prompt when provided', async () => {
    const contact = makeContact({ vertical: 'MANUFACTURING' });
    const campaignPrompt = 'Custom campaign prompt for testing';
    const draft = await generateDraft(contact, campaignPrompt);
    expect(draft.prompt).toBe(campaignPrompt);
  });

  it('should use default prompt for null vertical and no campaign', async () => {
    const contact = makeContact({ vertical: null });
    const draft = await generateDraft(contact);
    expect(draft.prompt).toBe(DEFAULT_PROMPT);
  });

  it('should return source=template when AI is disabled', async () => {
    const contact = makeContact({ vertical: 'MANUFACTURING' });
    const draft = await generateDraft(contact);
    expect(draft.source).toBe('template');
  });

  it('should return source=template when USE_AI_DRAFTS is false', async () => {
    process.env.USE_AI_DRAFTS = 'false';
    const contact = makeContact({ vertical: 'INSURANCE' });
    const draft = await generateDraft(contact);
    expect(draft.source).toBe('template');
  });

  it('should fallback to template when USE_AI_DRAFTS=true but no API key', async () => {
    process.env.USE_AI_DRAFTS = 'true';
    process.env.OPENAI_API_KEY = '';
    const contact = makeContact({ vertical: 'MANUFACTURING' });
    const draft = await generateDraft(contact);
    expect(draft.source).toBe('template');
  });
});

describe('advanceLead', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should increment stage from 1 to 2', async () => {
    const contact = makeContact({ sequence_stage: 1, outreach_status: 'ACTIVE', save: jest.fn() });
    mockFindByPk.mockResolvedValue(contact as any);

    const result = await advanceLead('1');

    expect(result!.sequence_stage).toBe(2);
    expect(result!.outreach_status).toBe('ACTIVE');
    expect(result!.last_contacted_at).toBeDefined();
    expect(result!.next_action_at).toBeDefined();
    expect(contact.save).toHaveBeenCalled();
  });

  it('should increment stage from 2 to 3', async () => {
    const contact = makeContact({ sequence_stage: 2, outreach_status: 'ACTIVE', save: jest.fn() });
    mockFindByPk.mockResolvedValue(contact as any);

    const result = await advanceLead('1');

    expect(result!.sequence_stage).toBe(3);
    expect(result!.outreach_status).toBe('ACTIVE');
  });

  it('should mark COMPLETED when advancing past stage 3', async () => {
    const contact = makeContact({ sequence_stage: 3, outreach_status: 'ACTIVE', save: jest.fn() });
    mockFindByPk.mockResolvedValue(contact as any);

    const result = await advanceLead('1');

    expect(result!.sequence_stage).toBe(4);
    expect(result!.outreach_status).toBe('COMPLETED');
    expect(result!.next_action_at).toBeNull();
  });

  it('should set next_action_at to 4 days from now', async () => {
    const contact = makeContact({ sequence_stage: 1, outreach_status: 'ACTIVE', save: jest.fn() });
    mockFindByPk.mockResolvedValue(contact as any);

    const before = Date.now();
    const result = await advanceLead('1');
    const after = Date.now();

    const nextAction = new Date(result!.next_action_at!).getTime();
    const fourDaysMs = 4 * 24 * 60 * 60 * 1000;
    expect(nextAction).toBeGreaterThanOrEqual(before + fourDaysMs);
    expect(nextAction).toBeLessThanOrEqual(after + fourDaysMs);
  });

  it('should return null if contact not found', async () => {
    mockFindByPk.mockResolvedValue(null);

    const result = await advanceLead('999');

    expect(result).toBeNull();
  });

  it('should throw if contact is already COMPLETED', async () => {
    const contact = makeContact({ outreach_status: 'COMPLETED', save: jest.fn() });
    mockFindByPk.mockResolvedValue(contact as any);

    await expect(advanceLead('1')).rejects.toThrow('Cannot advance a completed contact');
    expect(contact.save).not.toHaveBeenCalled();
  });
});

describe('advanceLead step-count cap', () => {
  const ENV_SAVE = process.env.OUTREACH_MAX_STEPS;
  beforeEach(() => { jest.clearAllMocks(); });
  afterEach(() => { process.env.OUTREACH_MAX_STEPS = ENV_SAVE; });

  function makeContactWithCampaign(sequence_stage: number, stepsDefined: number, maxStepsOverride: number | null = null) {
    const steps = Array.from({ length: stepsDefined }, (_, i) => ({ step: i + 1, channel: 'email', delay_days: 4 }));
    return makeContact({
      sequence_stage,
      outreach_status: 'ACTIVE',
      save: jest.fn(),
      campaign: {
        id: 'c1',
        sequence_steps: steps,
        settings: maxStepsOverride === null ? {} : { max_steps: maxStepsOverride },
      },
    });
  }

  it('env default 8 caps a 10-step campaign at 8', async () => {
    delete process.env.OUTREACH_MAX_STEPS;
    const contact = makeContactWithCampaign(8, 10);
    mockFindByPk.mockResolvedValue(contact as any);
    const result = await advanceLead('1');
    // stage was 8 -> becomes 9. min(10, 8) = 8. 9 > 8 -> COMPLETED.
    expect(result!.sequence_stage).toBe(9);
    expect(result!.outreach_status).toBe('COMPLETED');
    expect(result!.next_action_at).toBeNull();
  });

  it('env default 8 allows stage 7 -> 8 to keep going (8 is still <= cap)', async () => {
    delete process.env.OUTREACH_MAX_STEPS;
    const contact = makeContactWithCampaign(7, 10);
    mockFindByPk.mockResolvedValue(contact as any);
    const result = await advanceLead('1');
    expect(result!.sequence_stage).toBe(8);
    expect(result!.outreach_status).toBe('ACTIVE');
  });

  it('per-campaign override below env default wins (override 5 caps a 10-step campaign at 5)', async () => {
    delete process.env.OUTREACH_MAX_STEPS;
    const contact = makeContactWithCampaign(5, 10, 5);
    mockFindByPk.mockResolvedValue(contact as any);
    const result = await advanceLead('1');
    // stage was 5 -> becomes 6. min(10, 5) = 5. 6 > 5 -> COMPLETED.
    expect(result!.sequence_stage).toBe(6);
    expect(result!.outreach_status).toBe('COMPLETED');
  });

  it('per-campaign override above env default wins (override 12 with a 12-step campaign, env=8)', async () => {
    delete process.env.OUTREACH_MAX_STEPS;
    const contact = makeContactWithCampaign(9, 12, 12);
    mockFindByPk.mockResolvedValue(contact as any);
    const result = await advanceLead('1');
    // stage 9 -> 10. min(12, 12) = 12. 10 > 12? No. ACTIVE.
    expect(result!.sequence_stage).toBe(10);
    expect(result!.outreach_status).toBe('ACTIVE');
  });

  it('OUTREACH_MAX_STEPS env can raise the cap globally', async () => {
    process.env.OUTREACH_MAX_STEPS = '10';
    const contact = makeContactWithCampaign(9, 12);
    mockFindByPk.mockResolvedValue(contact as any);
    const result = await advanceLead('1');
    // stage 9 -> 10. min(12, 10) = 10. 10 > 10? No. ACTIVE.
    expect(result!.sequence_stage).toBe(10);
    expect(result!.outreach_status).toBe('ACTIVE');
  });

  it('falls back to 8 when OUTREACH_MAX_STEPS is non-numeric', async () => {
    process.env.OUTREACH_MAX_STEPS = 'banana';
    const contact = makeContactWithCampaign(8, 12);
    mockFindByPk.mockResolvedValue(contact as any);
    const result = await advanceLead('1');
    // stage 8 -> 9. min(12, 8) = 8. 9 > 8 -> COMPLETED.
    expect(result!.sequence_stage).toBe(9);
    expect(result!.outreach_status).toBe('COMPLETED');
  });

  it('campaign override of 0 is treated as "no override" (falls back to env default)', async () => {
    delete process.env.OUTREACH_MAX_STEPS;
    const contact = makeContactWithCampaign(8, 12, 0);
    mockFindByPk.mockResolvedValue(contact as any);
    const result = await advanceLead('1');
    // override 0 -> falls back to env default 8. stage 8 -> 9. 9 > 8 -> COMPLETED.
    expect(result!.sequence_stage).toBe(9);
    expect(result!.outreach_status).toBe('COMPLETED');
  });

  it('shorter step count still wins over higher cap (5 steps + cap of 8 -> stops at 5)', async () => {
    delete process.env.OUTREACH_MAX_STEPS;
    const contact = makeContactWithCampaign(5, 5);
    mockFindByPk.mockResolvedValue(contact as any);
    const result = await advanceLead('1');
    // min(5, 8) = 5. stage 5 -> 6. 6 > 5 -> COMPLETED.
    expect(result!.sequence_stage).toBe(6);
    expect(result!.outreach_status).toBe('COMPLETED');
  });
});
