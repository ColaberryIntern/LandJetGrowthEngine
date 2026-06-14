// Verifies recordInboxMatches matches inbox emails to leads, writes inbound
// comm log rows idempotently (by Outlook message id), and advances
// pipeline_stage to 'replied' from new_lead or contacted.

jest.mock('../../models/Lead', () => ({
  Lead: { findAll: jest.fn(), update: jest.fn() },
}));
jest.mock('../../models/CommunicationLog', () => ({
  CommunicationLog: { findOne: jest.fn(), create: jest.fn() },
}));
jest.mock('../../config/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import { recordInboxMatches, InboxEmail } from '../../services/emailReplyService';
import { Lead } from '../../models/Lead';
import { CommunicationLog } from '../../models/CommunicationLog';

const mockLeadFindAll = Lead.findAll as jest.Mock;
const mockLeadUpdate = Lead.update as jest.Mock;
const mockCommFindOne = CommunicationLog.findOne as jest.Mock;
const mockCommCreate = CommunicationLog.create as jest.Mock;

const emails: InboxEmail[] = [
  { id: 'msg-1', subject: 'Re: intro', from: 'Mary S.', from_email: 'mary@rush.edu', received_at: '2026-06-08T22:00Z', preview: 'Yes lets talk Thursday.', is_read: false, importance: 'normal' },
  { id: 'msg-2', subject: 'unrelated', from: 'Spam', from_email: 'random@nowhere.io', received_at: '2026-06-08T21:00Z', preview: 'buy me', is_read: false, importance: 'normal' },
  { id: 'msg-3', subject: 'Re: quote', from: 'Brad', from_email: 'brad@mahoney.com', received_at: '2026-06-08T20:00Z', preview: 'ok', is_read: false, importance: 'normal' },
];

describe('recordInboxMatches', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLeadFindAll.mockResolvedValue([
      { id: 42, email: 'mary@rush.edu', pipeline_stage: 'contacted' },
      { id: 43, email: 'brad@mahoney.com', pipeline_stage: 'new_lead' },
    ]);
    mockCommFindOne.mockResolvedValue(null); // no existing log row
    mockCommCreate.mockResolvedValue({});
    mockLeadUpdate.mockResolvedValue([1]);
  });

  it('returns zero counts when emails is empty', async () => {
    const res = await recordInboxMatches([]);
    expect(res).toEqual({ matched: 0, logged_new: 0, advanced: 0 });
    expect(mockLeadFindAll).not.toHaveBeenCalled();
  });

  it('matches only emails whose from_email maps to a Lead', async () => {
    const res = await recordInboxMatches(emails);
    expect(res.matched).toBe(2); // mary + brad, not random@nowhere
    expect(res.logged_new).toBe(2);
    expect(res.advanced).toBe(2);
  });

  it('writes a CommunicationLog inbound row for each new match', async () => {
    await recordInboxMatches(emails);
    expect(mockCommCreate).toHaveBeenCalledTimes(2);
    const calls = mockCommCreate.mock.calls.map((c) => c[0]);
    expect(calls[0].direction).toBe('inbound');
    expect(calls[0].channel).toBe('email');
    expect(calls[0].provider_message_id).toBe('msg-1');
    expect(calls[1].provider_message_id).toBe('msg-3');
  });

  it('skips the log write when provider_message_id already exists (idempotent)', async () => {
    mockCommFindOne.mockResolvedValueOnce({ id: 'existing-log' }); // msg-1 already logged
    mockCommFindOne.mockResolvedValueOnce(null); // msg-3 fresh
    const res = await recordInboxMatches(emails);
    expect(res.matched).toBe(2);
    expect(res.logged_new).toBe(1);
    expect(mockCommCreate).toHaveBeenCalledTimes(1);
  });

  it('advances pipeline_stage to replied for new_lead AND contacted', async () => {
    await recordInboxMatches(emails);
    expect(mockLeadUpdate).toHaveBeenCalledTimes(2);
    const updates = mockLeadUpdate.mock.calls.map((c) => ({ vals: c[0], where: c[1] }));
    expect(updates[0].vals).toEqual({ pipeline_stage: 'replied' });
    expect(updates[0].where.where.id).toBe(42);
    expect(updates[1].where.where.id).toBe(43);
  });

  it('does NOT advance a lead already past contacted', async () => {
    mockLeadFindAll.mockResolvedValueOnce([
      { id: 42, email: 'mary@rush.edu', pipeline_stage: 'meeting_scheduled' },
    ]);
    const res = await recordInboxMatches([emails[0]!]);
    expect(res.matched).toBe(1);
    expect(res.advanced).toBe(0);
    expect(mockLeadUpdate).not.toHaveBeenCalled();
  });
});
