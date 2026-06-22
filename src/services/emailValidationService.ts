/**
 * Basic email validation service.
 * Checks format and MX records. No external API dependency.
 *
 * Failure modes & handling (Failure-First Design):
 *  - Upstream (DNS resolver) down / slow: every MX lookup is wrapped in a hard
 *    timeout (EMAIL_MX_TIMEOUT_MS, default 5s). A timeout or transient resolver
 *    error (ESERVFAIL/EAI_AGAIN) returns the `unknown` outcome -> validateEmail
 *    reports the address as VALID with `transient: true`, so a flaky resolver
 *    NEVER blocks a whole send queue (fail-open). The post-send bounce
 *    processor remains the backstop for those.
 *  - Definitive "domain cannot receive mail" (NXDOMAIN/ENOTFOUND/ENODATA, or an
 *    empty MX set) returns `no_mx` -> invalid. This is the case we want to catch
 *    before send (the dead-domain bounces Ryan reported 2026-06-22).
 *  - Bad input (empty / malformed): rejected by format check before any DNS I/O.
 *  - Concurrency / retry storm: validation is pure read-only DNS; safe to call
 *    repeatedly. validateBatch caps parallelism at 10 to avoid resolver floods.
 *
 * NOTE: DNS-level validation cannot detect a valid domain with a dead mailbox
 * (e.g. a person who left their job). That requires SMTP-level verification or a
 * paid validator and is intentionally out of scope here.
 */

import * as dns from 'dns';

const MX_TIMEOUT_MS = Number(process.env.EMAIL_MX_TIMEOUT_MS || 5000);

export type MxOutcome = 'has_mx' | 'no_mx' | 'unknown';

export interface EmailValidationResult {
  valid: boolean;
  reason?: 'empty' | 'invalid_format' | 'no_mx_records' | 'mx_lookup_unavailable';
  // True when validity could not be positively determined (transient DNS
  // failure). Callers gating real sends should treat this as "allow" (fail-open).
  transient?: boolean;
}

// Minimal shape we need from a resolver, so tests can inject a fake.
export interface MxResolver {
  resolveMx(hostname: string): Promise<{ exchange: string; priority: number }[]>;
}

/**
 * Validate email format.
 */
export function isValidFormat(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Resolve MX records for a domain with a hard timeout, classifying the result:
 *   'has_mx'  - domain advertises at least one mail exchanger
 *   'no_mx'   - definitive: domain exists but has no MX, or does not exist
 *   'unknown' - transient resolver failure (timeout / servfail); validity undetermined
 */
export async function resolveMxOutcome(
  domain: string,
  resolver: MxResolver = dns.promises,
): Promise<MxOutcome> {
  if (!domain) return 'no_mx';
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(Object.assign(new Error('mx_timeout'), { code: 'ETIMEOUT' })),
        MX_TIMEOUT_MS,
      );
    });
    const records = await Promise.race([resolver.resolveMx(domain), timeout]);
    return records && records.length > 0 ? 'has_mx' : 'no_mx';
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    // Definitive: this domain cannot receive mail.
    if (code === 'ENOTFOUND' || code === 'ENODATA' || code === 'NXDOMAIN') {
      return 'no_mx';
    }
    // Transient (ETIMEOUT / ESERVFAIL / EAI_AGAIN / anything else): undetermined.
    return 'unknown';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Check if domain has MX records (can receive email).
 * Backward-compatible boolean wrapper: true only when MX is positively confirmed.
 */
export async function hasMxRecords(email: string, resolver: MxResolver = dns.promises): Promise<boolean> {
  const domain = email.split('@')[1];
  return (await resolveMxOutcome(domain, resolver)) === 'has_mx';
}

/**
 * Validate a single email: format + MX check.
 */
export async function validateEmail(
  email: string,
  resolver: MxResolver = dns.promises,
): Promise<EmailValidationResult> {
  if (!email || !email.trim()) {
    return { valid: false, reason: 'empty' };
  }

  const cleaned = email.trim().toLowerCase();

  if (!isValidFormat(cleaned)) {
    return { valid: false, reason: 'invalid_format' };
  }

  const outcome = await resolveMxOutcome(cleaned.split('@')[1], resolver);
  if (outcome === 'no_mx') {
    return { valid: false, reason: 'no_mx_records' };
  }
  if (outcome === 'unknown') {
    // Could not determine deliverability -> do not block the send.
    return { valid: true, reason: 'mx_lookup_unavailable', transient: true };
  }

  return { valid: true };
}

/**
 * Validate a batch of emails. Returns results with the original email attached.
 */
export async function validateBatch(
  emails: string[],
  resolver: MxResolver = dns.promises,
): Promise<{ email: string; valid: boolean; reason?: string; transient?: boolean }[]> {
  const results: { email: string; valid: boolean; reason?: string; transient?: boolean }[] = [];

  // Process in batches of 10 to avoid DNS flooding
  for (let i = 0; i < emails.length; i += 10) {
    const batch = emails.slice(i, i + 10);
    const batchResults = await Promise.all(
      batch.map(async (email) => {
        const result = await validateEmail(email, resolver);
        return { email, ...result };
      }),
    );
    results.push(...batchResults);
  }

  return results;
}
