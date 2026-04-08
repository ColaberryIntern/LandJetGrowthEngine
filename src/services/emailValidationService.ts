/**
 * Basic email validation service.
 * Checks format and MX records. No external API dependency.
 */

import * as dns from 'dns';
import { promisify } from 'util';

const resolveMx = promisify(dns.resolveMx);

/**
 * Validate email format.
 */
export function isValidFormat(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Check if domain has MX records (can receive email).
 */
export async function hasMxRecords(email: string): Promise<boolean> {
  try {
    const domain = email.split('@')[1];
    if (!domain) return false;
    const records = await resolveMx(domain);
    return records.length > 0;
  } catch {
    return false;
  }
}

/**
 * Validate a single email: format + MX check.
 */
export async function validateEmail(email: string): Promise<{ valid: boolean; reason?: string }> {
  if (!email || !email.trim()) {
    return { valid: false, reason: 'empty' };
  }

  const cleaned = email.trim().toLowerCase();

  if (!isValidFormat(cleaned)) {
    return { valid: false, reason: 'invalid_format' };
  }

  const hasMx = await hasMxRecords(cleaned);
  if (!hasMx) {
    return { valid: false, reason: 'no_mx_records' };
  }

  return { valid: true };
}

/**
 * Validate a batch of emails. Returns results with indices.
 */
export async function validateBatch(emails: string[]): Promise<{ email: string; valid: boolean; reason?: string }[]> {
  const results: { email: string; valid: boolean; reason?: string }[] = [];

  // Process in batches of 10 to avoid DNS flooding
  for (let i = 0; i < emails.length; i += 10) {
    const batch = emails.slice(i, i + 10);
    const batchResults = await Promise.all(
      batch.map(async (email) => {
        const result = await validateEmail(email);
        return { email, ...result };
      })
    );
    results.push(...batchResults);
  }

  return results;
}
