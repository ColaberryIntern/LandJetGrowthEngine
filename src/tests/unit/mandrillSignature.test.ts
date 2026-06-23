import crypto from 'crypto';
import { Request, Response } from 'express';
import { verifyMandrillSignature } from '../../middleware/mandrillSignature';

// Build a valid Mandrill signature the same way Mandrill does:
// base = url + for each key (sorted): key + value; HMAC-SHA1 -> base64.
function sign(url: string, params: Record<string, string>, key: string): string {
  let data = url;
  for (const k of Object.keys(params).sort()) data += k + params[k];
  return crypto.createHmac('sha1', key).update(data, 'utf8').digest('base64');
}

function mockReq(body: Record<string, string>, sig?: string): Request {
  return {
    body,
    get: (h: string) => (h === 'X-Mandrill-Signature' ? sig : undefined),
    headers: {},
    protocol: 'https',
    originalUrl: '/api/webhooks/mandrill',
  } as unknown as Request;
}

function mockRes(): { res: Response; status: jest.Mock; json: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { res: { status, json } as unknown as Response, status, json };
}

const URL = 'https://growth.landjet.com/api/webhooks/mandrill';
const KEY = 'test-webhook-key';
const BODY = { mandrill_events: '[{"event":"open","msg":{"_id":"abc"}}]' };

describe('verifyMandrillSignature', () => {
  const orig = { ...process.env };
  afterEach(() => { process.env = { ...orig }; });

  it('accepts (verification disabled) when no key is configured', () => {
    delete process.env.MANDRILL_WEBHOOK_KEY;
    const next = jest.fn();
    const { res, status } = mockRes();
    verifyMandrillSignature(mockReq(BODY), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('accepts a correctly signed payload when a key is configured', () => {
    process.env.MANDRILL_WEBHOOK_KEY = KEY;
    process.env.MANDRILL_WEBHOOK_URL = URL;
    const sig = sign(URL, BODY, KEY);
    const next = jest.fn();
    const { res, status } = mockRes();
    verifyMandrillSignature(mockReq(BODY, sig), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('rejects 401 when the signature is wrong', () => {
    process.env.MANDRILL_WEBHOOK_KEY = KEY;
    process.env.MANDRILL_WEBHOOK_URL = URL;
    const next = jest.fn();
    const { res, status, json } = mockRes();
    verifyMandrillSignature(mockReq(BODY, 'not-a-valid-signature'), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'WEBHOOK_SIGNATURE_INVALID' }));
  });

  it('rejects 401 when the signature header is missing', () => {
    process.env.MANDRILL_WEBHOOK_KEY = KEY;
    process.env.MANDRILL_WEBHOOK_URL = URL;
    const next = jest.fn();
    const { res, status } = mockRes();
    verifyMandrillSignature(mockReq(BODY), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });

  it('rejects a signature computed against a different URL (tamper)', () => {
    process.env.MANDRILL_WEBHOOK_KEY = KEY;
    process.env.MANDRILL_WEBHOOK_URL = URL;
    const sig = sign('https://evil.example.com/hook', BODY, KEY);
    const next = jest.fn();
    const { res, status } = mockRes();
    verifyMandrillSignature(mockReq(BODY, sig), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });
});
