import {
  isValidFormat,
  resolveMxOutcome,
  validateEmail,
  validateBatch,
  MxResolver,
} from '../../services/emailValidationService';

// --- Fake resolvers (no real DNS in unit tests) --------------------------------
const hasMx: MxResolver = {
  resolveMx: async () => [{ exchange: 'mail.example.com', priority: 10 }],
};
const noMxEmpty: MxResolver = {
  resolveMx: async () => [],
};
const nxdomain: MxResolver = {
  resolveMx: async () => { throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' }); },
};
const servfail: MxResolver = {
  resolveMx: async () => { throw Object.assign(new Error('servfail'), { code: 'ESERVFAIL' }); },
};
const hangs: MxResolver = {
  // Never resolves -> exercises the timeout path.
  resolveMx: () => new Promise(() => {}),
};

describe('emailValidationService', () => {
  describe('isValidFormat', () => {
    it('accepts well-formed addresses', () => {
      expect(isValidFormat('ryan@landjet.com')).toBe(true);
      expect(isValidFormat('first.last+tag@sub.domain.io')).toBe(true);
    });

    it('rejects malformed addresses', () => {
      expect(isValidFormat('no-at-sign')).toBe(false);
      expect(isValidFormat('missing@domain')).toBe(false); // no TLD dot
      expect(isValidFormat('has space@domain.com')).toBe(false);
      expect(isValidFormat('@nodomain.com')).toBe(false);
      expect(isValidFormat('')).toBe(false);
    });
  });

  describe('resolveMxOutcome', () => {
    it('returns has_mx when records exist', async () => {
      expect(await resolveMxOutcome('landjet.com', hasMx)).toBe('has_mx');
    });

    it('returns no_mx on empty record set', async () => {
      expect(await resolveMxOutcome('landjet.com', noMxEmpty)).toBe('no_mx');
    });

    it('returns no_mx on NXDOMAIN/ENOTFOUND (dead domain)', async () => {
      expect(await resolveMxOutcome('definitely-not-real-xyz.com', nxdomain)).toBe('no_mx');
    });

    it('returns unknown on transient resolver failure (servfail)', async () => {
      expect(await resolveMxOutcome('landjet.com', servfail)).toBe('unknown');
    });

    it('returns no_mx for an empty domain without touching DNS', async () => {
      expect(await resolveMxOutcome('', hasMx)).toBe('no_mx');
    });

    it('returns unknown when the lookup times out', async () => {
      const prev = process.env.EMAIL_MX_TIMEOUT_MS;
      process.env.EMAIL_MX_TIMEOUT_MS = '20';
      // Re-import to pick up the shorter timeout for this case.
      jest.resetModules();
      const svc = await import('../../services/emailValidationService');
      const outcome = await svc.resolveMxOutcome('landjet.com', hangs);
      expect(outcome).toBe('unknown');
      if (prev === undefined) delete process.env.EMAIL_MX_TIMEOUT_MS;
      else process.env.EMAIL_MX_TIMEOUT_MS = prev;
    });
  });

  describe('validateEmail', () => {
    it('rejects empty input before any DNS work', async () => {
      expect(await validateEmail('', hasMx)).toEqual({ valid: false, reason: 'empty' });
      expect(await validateEmail('   ', hasMx)).toEqual({ valid: false, reason: 'empty' });
    });

    it('rejects malformed input as invalid_format', async () => {
      expect(await validateEmail('not-an-email', hasMx)).toEqual({ valid: false, reason: 'invalid_format' });
    });

    it('rejects dead domains as no_mx_records', async () => {
      expect(await validateEmail('ceo@deadcompany.com', nxdomain)).toEqual({ valid: false, reason: 'no_mx_records' });
      expect(await validateEmail('ceo@deadcompany.com', noMxEmpty)).toEqual({ valid: false, reason: 'no_mx_records' });
    });

    it('accepts a deliverable address', async () => {
      expect(await validateEmail('ryan@landjet.com', hasMx)).toEqual({ valid: true });
    });

    it('fails OPEN on transient DNS failure (valid + transient flag)', async () => {
      const r = await validateEmail('ryan@landjet.com', servfail);
      expect(r.valid).toBe(true);
      expect(r.transient).toBe(true);
      expect(r.reason).toBe('mx_lookup_unavailable');
    });

    it('is idempotent: same input twice yields the same verdict', async () => {
      const a = await validateEmail('ryan@landjet.com', hasMx);
      const b = await validateEmail('ryan@landjet.com', hasMx);
      expect(a).toEqual(b);
    });
  });

  describe('validateBatch', () => {
    it('validates a mixed batch and preserves the input email on each row', async () => {
      const results = await validateBatch(['ryan@landjet.com', 'bad', ''], hasMx);
      expect(results).toHaveLength(3);
      expect(results.find((r) => r.email === 'ryan@landjet.com')?.valid).toBe(true);
      expect(results.find((r) => r.email === 'bad')?.valid).toBe(false);
      expect(results.find((r) => r.email === '')?.reason).toBe('empty');
    });

    it('handles an empty list as a no-op', async () => {
      expect(await validateBatch([], hasMx)).toEqual([]);
    });
  });
});
