/**
 * mandrillSignature.ts
 * Verifies the authenticity of inbound Mandrill webhook POSTs (TBI gap G2).
 *
 * Mandrill signs each webhook with HMAC-SHA1 (base64) over a base string of:
 *   webhook_url + for each POST param, sorted by key ascending: (key + value)
 * keyed by the webhook's signing key, delivered in the `X-Mandrill-Signature`
 * header. See https://mailchimp.com/developer/transactional/docs/webhooks/#authenticating-webhook-requests
 *
 * Failure modes & handling:
 * - No signing key configured (MANDRILL_WEBHOOK_KEY unset): verification is
 *   DISABLED — we log a warning and accept, so deploying this change cannot
 *   silently drop real delivery/outcome events before the prod key is set.
 *   Enforcement turns on automatically the moment the key is present.
 * - Missing/incorrect signature when a key IS configured: reject 401 (typed
 *   body), so a spoofed payload cannot fabricate interaction outcomes.
 * - Constant-time comparison (crypto.timingSafeEqual) avoids timing oracles.
 *
 * Requires express.urlencoded to have run first (req.body holds the form fields).
 */
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../config/logger';

/** Build Mandrill's signed base string from the webhook URL + sorted form params. */
function buildSignedData(url: string, params: Record<string, unknown>): string {
  let signed = url;
  for (const key of Object.keys(params).sort()) {
    signed += key;
    signed += params[key] == null ? '' : String(params[key]);
  }
  return signed;
}

/** Resolve the exact URL Mandrill used when computing the signature. */
function resolveWebhookUrl(req: Request): string {
  // The configured URL must match what is registered in Mandrill exactly,
  // including scheme/host, which a proxied req cannot reconstruct reliably.
  if (process.env.MANDRILL_WEBHOOK_URL) return process.env.MANDRILL_WEBHOOK_URL;
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const host = req.get('host') || '';
  return `${proto}://${host}${req.originalUrl}`;
}

export function verifyMandrillSignature(req: Request, res: Response, next: NextFunction): void {
  const key = process.env.MANDRILL_WEBHOOK_KEY;

  // Verification disabled until a signing key is provisioned (safe rollout).
  if (!key) {
    logger.warn('Mandrill webhook signature verification DISABLED (MANDRILL_WEBHOOK_KEY not set)', {
      action: 'mandrill.webhook.unverified',
    });
    return next();
  }

  const provided = req.get('X-Mandrill-Signature') || '';
  const url = resolveWebhookUrl(req);
  const signedData = buildSignedData(url, (req.body || {}) as Record<string, unknown>);
  const expected = crypto.createHmac('sha1', key).update(signedData, 'utf8').digest('base64');

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!ok) {
    logger.warn('Mandrill webhook signature rejected', {
      action: 'mandrill.webhook.rejected',
      hasSignature: Boolean(provided),
      url,
    });
    res.status(401).json({ error: 'Invalid webhook signature', code: 'WEBHOOK_SIGNATURE_INVALID' });
    return;
  }

  next();
}
