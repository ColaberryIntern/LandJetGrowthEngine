// Test the safety evaluation logic with mocked models
jest.mock('../../models/Unsubscribe', () => ({
  Unsubscribe: { findOne: jest.fn() },
  initUnsubscribeModel: jest.fn(),
}));
jest.mock('../../models/DncList', () => ({
  DncList: { findOne: jest.fn() },
  initDncListModel: jest.fn(),
}));
jest.mock('../../models/CommunicationLog', () => ({
  CommunicationLog: { findOne: jest.fn(), count: jest.fn() },
  initCommunicationLogModel: jest.fn(),
}));
jest.mock('../../models/Campaign', () => ({
  Campaign: { findByPk: jest.fn() },
  initCampaignModel: jest.fn(),
}));

import { evaluateSend } from '../../services/communicationSafetyService';
import { Unsubscribe } from '../../models/Unsubscribe';
import { DncList } from '../../models/DncList';
import { CommunicationLog } from '../../models/CommunicationLog';
import { Campaign } from '../../models/Campaign';

const mockUnsubFind = Unsubscribe.findOne as jest.Mock;
const mockDncFind = DncList.findOne as jest.Mock;
const mockCommLogFind = CommunicationLog.findOne as jest.Mock;
const mockCommLogCount = CommunicationLog.count as jest.Mock;
const mockCampaignFind = Campaign.findByPk as jest.Mock;

describe('Communication Safety Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUnsubFind.mockResolvedValue(null);
    mockDncFind.mockResolvedValue(null);
    mockCommLogFind.mockResolvedValue(null);
    mockCommLogCount.mockResolvedValue(0);
    mockCampaignFind.mockResolvedValue(null);
  });

  const baseInput = {
    leadId: 1,
    leadEmail: 'test@example.com',
    leadPhone: '+15551234567',
    channel: 'email' as const,
  };

  it('should allow send when all checks pass', async () => {
    const result = await evaluateSend(baseInput);
    expect(result.allowed).toBe(true);
    expect(result.deliveryMode).toBe('production');
  });

  it('should block unsubscribed leads', async () => {
    mockUnsubFind.mockResolvedValue({ email: 'test@example.com' });
    const result = await evaluateSend(baseInput);
    expect(result.allowed).toBe(false);
    expect(result.blockedReason).toContain('unsubscribed');
  });

  it('should block DNC leads by email', async () => {
    mockDncFind.mockResolvedValue({ email: 'test@example.com' });
    const result = await evaluateSend(baseInput);
    expect(result.allowed).toBe(false);
    expect(result.blockedReason).toContain('Do-Not-Contact');
  });

  it('should block DNC leads by phone', async () => {
    mockDncFind.mockResolvedValue({ phone: '+15551234567' });
    const result = await evaluateSend({ ...baseInput, channel: 'sms' });
    expect(result.allowed).toBe(false);
    expect(result.blockedReason).toContain('Do-Not-Contact');
  });

  it('should block hard bounced leads', async () => {
    mockCommLogFind.mockResolvedValue({ status: 'bounced' });
    const result = await evaluateSend(baseInput);
    expect(result.allowed).toBe(false);
    expect(result.blockedReason).toContain('hard bounced');
  });

  it('should block rate-limited leads (2+ emails/day)', async () => {
    mockCommLogCount.mockResolvedValue(2);
    const result = await evaluateSend(baseInput);
    expect(result.allowed).toBe(false);
    expect(result.blockedReason).toContain('Rate limit');
  });

  it('should allow if under rate limit', async () => {
    mockCommLogCount.mockResolvedValue(1);
    const result = await evaluateSend(baseInput);
    expect(result.allowed).toBe(true);
  });

  it('should set test_redirect mode when campaign has test_mode_enabled', async () => {
    mockCampaignFind.mockResolvedValue({
      settings: { test_mode_enabled: true, test_email: 'test@test.com', test_phone: '+10000' },
    });
    const result = await evaluateSend({ ...baseInput, campaignId: 'campaign-1' });
    expect(result.allowed).toBe(true);
    expect(result.deliveryMode).toBe('test_redirect');
    expect(result.redirect?.email).toBe('test@test.com');
  });

  it('should block test actions targeting non-test domains', async () => {
    const result = await evaluateSend({ ...baseInput, isTestAction: true });
    expect(result.allowed).toBe(false);
    expect(result.blockedReason).toContain('test domains');
  });

  it('should not check bounce for non-email channels', async () => {
    mockCommLogFind.mockResolvedValue({ status: 'bounced' });
    const result = await evaluateSend({ ...baseInput, channel: 'sms' });
    // Bounce check only applies to email
    expect(result.allowed).toBe(true);
  });

  it('should not check rate limit for non-email channels', async () => {
    mockCommLogCount.mockResolvedValue(5);
    const result = await evaluateSend({ ...baseInput, channel: 'voice' });
    // Rate limit check only applies to email
    expect(result.allowed).toBe(true);
  });
});
