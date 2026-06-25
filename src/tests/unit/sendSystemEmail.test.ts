/**
 * Unit tests for sendSystemEmail address hygiene -- regression for the live
 * smoke-test finding where a stored sender_email carried a trailing space and
 * Graph rejected the whole send with "recipient is not resolved".
 */
jest.mock('../../config/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('../../models/Lead', () => ({ Lead: {}, initLeadModel: jest.fn() }));
jest.mock('../../models/Campaign', () => ({ Campaign: {}, initCampaignModel: jest.fn() }));
jest.mock('../../models/CommunicationLog', () => ({ CommunicationLog: { create: jest.fn() }, initCommunicationLogModel: jest.fn() }));
jest.mock('../../services/auditLogService', () => ({ createAuditLog: jest.fn() }));

import { sendSystemEmail } from '../../services/outreachEmailService';

function mockGraph() {
  const calls: any[] = [];
  (global as any).fetch = jest.fn((url: string, opts: any) => {
    calls.push({ url, opts });
    if (String(url).includes('login.microsoftonline.com')) {
      return Promise.resolve({ ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) });
    }
    return Promise.resolve({ status: 202, json: async () => ({}) });
  });
  return calls;
}

describe('sendSystemEmail address hygiene', () => {
  beforeEach(() => jest.clearAllMocks());

  it('trims a trailing space on from/to/cc so Graph resolves the recipients', async () => {
    const calls = mockGraph();
    const res = await sendSystemEmail({
      from: 'rlandry@landjet.com ', to: 'rlandry@landjet.com ', cc: ' ali@colaberry.com',
      subject: 'x', html: '<p>x</p>',
    });

    expect(res.success).toBe(true);
    const sendCall = calls.find(c => String(c.url).includes('/sendMail'));
    expect(sendCall).toBeTruthy();
    // from is in the URL path (encoded) -- must not contain a raw space
    expect(decodeURIComponent(String(sendCall.url))).toContain('/users/rlandry@landjet.com/sendMail');
    const body = JSON.parse(sendCall.opts.body);
    expect(body.message.toRecipients[0].emailAddress.address).toBe('rlandry@landjet.com');
    expect(body.message.ccRecipients[0].emailAddress.address).toBe('ali@colaberry.com');
  });

  it('returns a typed failure (no throw) when to is empty', async () => {
    mockGraph();
    const res = await sendSystemEmail({ from: 'a@b.com', to: '   ', subject: 'x', html: 'x' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/required/i);
  });
});
