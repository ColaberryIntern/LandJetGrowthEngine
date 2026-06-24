/**
 * Unit tests for the Outreach feedback triage + auto-fix service.
 * BUILD-BREAK-HARDEN: happy path, failure paths (LLM down / no key), boundary
 * (unknown action), idempotency (duplicate guardrail), and the email bulkhead.
 */
jest.mock('../../models/OutreachFeedback', () => ({
  OutreachFeedback: { create: jest.fn() },
  initOutreachFeedbackModel: jest.fn(),
}));
jest.mock('../../models', () => ({
  Lead: { findByPk: jest.fn() },
  Campaign: { findAll: jest.fn() },
}));
jest.mock('../../services/outreachQueryService', () => ({
  getOutreachSettings: jest.fn(),
  updateOutreachSettings: jest.fn(),
  blockLead: jest.fn(),
}));
jest.mock('../../services/outreachEmailService', () => ({ sendSystemEmail: jest.fn() }));
jest.mock('../../config/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import { submitOutreachFeedback } from '../../services/outreachFeedbackService';
import { OutreachFeedback } from '../../models/OutreachFeedback';
import { getOutreachSettings, updateOutreachSettings, blockLead } from '../../services/outreachQueryService';
import { sendSystemEmail } from '../../services/outreachEmailService';

const mockCreate = OutreachFeedback.create as jest.Mock;
const mockGetSettings = getOutreachSettings as jest.Mock;
const mockUpdateSettings = updateOutreachSettings as jest.Mock;
const mockBlock = blockLead as jest.Mock;
const mockSend = sendSystemEmail as jest.Mock;

const BASE_SETTINGS = {
  emails_per_day: 20, follow_up_delay_days: 4, ai_drafts_enabled: true,
  sender_name: 'Ryan Landry', sender_role: 'CEO, LandJet', sender_email: 'rlandry@landjet.com',
  email_signature: '', draft_guardrails: '', test_mode: true, test_email: 'test@x.com',
  send_days: [1, 2, 3, 4, 5], send_start_hour: 8, send_end_hour: 17, send_timezone: 'America/Chicago',
};

function mockOpenAI(content: object | string) {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  (global as any).fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content: text } }] }),
  });
}

describe('outreachFeedbackService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.OPENAI_API_KEY = 'test-key';
    mockGetSettings.mockResolvedValue({ ...BASE_SETTINGS });
    mockUpdateSettings.mockResolvedValue({ ...BASE_SETTINGS });
    mockCreate.mockResolvedValue({ id: 1 });
    mockSend.mockResolvedValue({ success: true });
  });

  it('happy path: "too long" feedback adds a guardrail and stores an applied row', async () => {
    mockOpenAI({ action: 'add_guardrail', params: { guardrail: 'Keep emails to 3 sentences.' }, summary: 'Shorten emails', confidence: 0.9 });

    const res = await submitOutreachFeedback({ category: 'message_too_long', comment: 'too long, keep them to 3 sentences', createdBy: 'ali@colaberry.com' });

    expect(res.status).toBe('applied');
    expect(mockUpdateSettings).toHaveBeenCalledWith({ draft_guardrails: 'Keep emails to 3 sentences.' });
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ action: 'add_guardrail', status: 'applied' }));
    expect(mockSend).toHaveBeenCalledTimes(1);
    // test_mode on -> notification routes to the test inbox
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ to: 'test@x.com', from: 'rlandry@landjet.com' }));
  });

  it('failure path: LLM unreachable -> needs_review, no settings mutated, row still stored', async () => {
    (global as any).fetch = jest.fn().mockRejectedValue(new Error('network down'));

    const res = await submitOutreachFeedback({ category: 'wrong_wording', comment: 'something is off' });

    expect(res.status).toBe('needs_review');
    expect(mockUpdateSettings).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ status: 'needs_review' }));
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('failure path: no OPENAI_API_KEY -> needs_review without calling the LLM', async () => {
    delete process.env.OPENAI_API_KEY;
    (global as any).fetch = jest.fn();

    const res = await submitOutreachFeedback({ category: 'other', comment: 'hmm' });

    expect((global as any).fetch).not.toHaveBeenCalled();
    expect(res.status).toBe('needs_review');
  });

  it('boundary: unknown action from the model is coerced to needs_review', async () => {
    mockOpenAI({ action: 'delete_everything', params: {}, summary: 'nope', confidence: 0.99 });

    const res = await submitOutreachFeedback({ category: 'other', comment: 'do something weird' });

    expect(res.status).toBe('needs_review');
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it('boundary: block_contact without a contact_id is held for review, not applied', async () => {
    mockOpenAI({ action: 'block_contact', params: {}, summary: 'block them', confidence: 0.95 });

    const res = await submitOutreachFeedback({ category: 'do_not_contact', comment: 'stop contacting this person' });

    expect(res.status).toBe('needs_review'); // no contact in context -> coerced
    expect(mockBlock).not.toHaveBeenCalled();
  });

  it('block_contact with a contact_id blocks the lead', async () => {
    mockOpenAI({ action: 'block_contact', params: {}, summary: 'block', confidence: 0.95 });
    mockBlock.mockResolvedValue({ lead: { id: 'c1', status: 'archived' }, dncCreated: true });

    const res = await submitOutreachFeedback({ category: 'do_not_contact', comment: 'stop', contactId: 'c1' });

    expect(res.status).toBe('applied');
    expect(mockBlock).toHaveBeenCalledWith('c1', 'feedback_block');
  });

  it('idempotency: a guardrail already in place is not appended twice', async () => {
    mockGetSettings.mockResolvedValue({ ...BASE_SETTINGS, draft_guardrails: 'Keep emails to 3 sentences.' });
    mockOpenAI({ action: 'add_guardrail', params: { guardrail: 'keep emails to 3 sentences.' }, summary: 'dup', confidence: 0.9 });

    const res = await submitOutreachFeedback({ category: 'message_too_long', comment: 'too long again' });

    expect(res.status).toBe('applied');
    expect(mockUpdateSettings).not.toHaveBeenCalled(); // already present (case-insensitive)
    expect(res.applied).toMatch(/already in place/i);
  });

  it('email bulkhead: a Graph send failure does not fail the request', async () => {
    mockOpenAI({ action: 'add_guardrail', params: { guardrail: 'Be warmer.' }, summary: 'warmer', confidence: 0.9 });
    mockSend.mockRejectedValue(new Error('graph 500'));

    const res = await submitOutreachFeedback({ category: 'wrong_wording', comment: 'be warmer' });

    expect(res.stored).toBe(true);
    expect(res.status).toBe('applied');
  });
});
