/**
 * Outreach release readiness gate.
 *
 * Runs the 20-failure-mode x 5-scenario matrix (outreachReleaseChecks) plus
 * focused unit tests on the pure building blocks. This is the hard VERIFY gate
 * of the loop: the build is not release-ready until every applicable cell is
 * green.
 */

import {
  runReleaseChecks,
  SCENARIOS,
} from '../../services/outreachReleaseChecks';
import {
  DEFAULT_SENDERS_CONFIG,
  resolveProfile,
  buildSignature,
  tokenizeSignature,
  detectIdentityConflict,
  getEffectiveTitle,
} from '../../services/senderProfileService';
import { isAllowedSender } from '../../services/outreachEmailService';
import { personalize, findUnresolvedTokens, escapeHtmlField } from '../../services/outreachPersonalization';
import { effectiveStates } from '../../services/leadScope';

describe('Outreach release matrix (20 checks x 5 scenarios)', () => {
  const matrix = runReleaseChecks();

  it('every applicable cell passes (release-ready)', () => {
    const failures = matrix.failures.map(f => `${f.checkId}@${f.scenarioId}: ${f.detail}`);
    expect(failures).toEqual([]);
  });

  // One test per check so a regression names the exact failure mode.
  for (const check of matrix.checks) {
    it(`${check.id} ${check.label}`, () => {
      for (const sc of matrix.scenarios) {
        const cell = matrix.cells[check.id][sc.id];
        if (cell.applicable) {
          expect({ cell: `${check.id}@${sc.id}`, pass: cell.pass, detail: cell.detail })
            .toEqual({ cell: `${check.id}@${sc.id}`, pass: true, detail: cell.detail });
        }
      }
    });
  }

  it('exercises all 5 scenarios', () => {
    expect(matrix.scenarios.map(s => s.id)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5']);
    expect(SCENARIOS).toHaveLength(5);
  });
});

describe('sender profile identity', () => {
  const cfg = DEFAULT_SENDERS_CONFIG;

  it('resolves each mailbox to the right person + title', () => {
    expect(resolveProfile('rlandry@landjet.com', cfg)).toMatchObject({ name: 'Ryan Landry', title: 'CEO' });
    expect(resolveProfile('percy@landjet.com', cfg)).toMatchObject({ name: 'Percy Kapadia', title: 'COO' });
    expect(resolveProfile('gnecker@landjet.com', cfg)).toMatchObject({ name: 'Grant Necker', title: 'Business Development' });
  });

  it('is robust to casing/whitespace on the from-address', () => {
    expect(resolveProfile('  Percy@LandJet.com ', cfg)?.name).toBe('Percy Kapadia');
  });

  it('returns null for an unknown sender (caller must refuse)', () => {
    expect(resolveProfile('stranger@example.com', cfg)).toBeNull();
  });

  it('builds a signature that contains the person and their title, not anyone else', () => {
    const percy = resolveProfile('percy@landjet.com', cfg)!;
    expect(percy.signature).toContain('Percy Kapadia');
    expect(percy.signature).toContain('COO');
    expect(percy.signature).not.toContain('Ryan Landry');
    expect(percy.signature).not.toContain('CEO');
  });

  it('whitelist now includes Percy + Grant, still rejects strangers', () => {
    expect(isAllowedSender('percy@landjet.com')).toBe(true);
    expect(isAllowedSender('gnecker@landjet.com')).toBe(true);
    expect(isAllowedSender('rlandry@landjet.com')).toBe(true);
    expect(isAllowedSender('PERCY@landjet.com')).toBe(true);
    expect(isAllowedSender('attacker@evil.com')).toBe(false);
  });

  it('flags an identity conflict (percy from-address carrying Ryan)', () => {
    expect(detectIdentityConflict({
      fromEmail: 'percy@landjet.com',
      displayName: 'Ryan Landry',
      signature: '<div>Ryan Landry</div>',
      config: cfg,
    })).toBe('Ryan Landry');
  });

  it('passes a clean self-consistent send', () => {
    const percy = resolveProfile('percy@landjet.com', cfg)!;
    expect(detectIdentityConflict({
      fromEmail: 'percy@landjet.com', displayName: percy.name, signature: percy.signature, config: cfg,
    })).toBeNull();
  });

  it('getEffectiveTitle never renders a blank title', () => {
    expect(getEffectiveTitle('')).toBe('Team');
    expect(getEffectiveTitle('  ')).toBe('Team');
    expect(getEffectiveTitle('COO')).toBe('COO');
  });
});

describe('tokenizeSignature (derive shared template from Ryan\'s real signature)', () => {
  it('replaces the owner name + title with tokens so others inherit the look', () => {
    const ryan = '<p>Ryan Landry<br>CEO, LandJet<br>rlandry@landjet.com</p>';
    const tpl = tokenizeSignature(ryan, { name: 'Ryan Landry', title: 'CEO' });
    expect(tpl).toContain('{{sender_name}}');
    expect(tpl).toContain('{{sender_title}}');
    expect(tpl).not.toContain('Ryan Landry');

    const percy = buildSignature(tpl, { email: 'percy@landjet.com', name: 'Percy Kapadia', title: 'COO', area: ['TX'] });
    expect(percy).toContain('Percy Kapadia');
    expect(percy).toContain('COO');
    expect(percy).not.toContain('Ryan Landry');
  });
});

describe('personalization guard', () => {
  it('fills a friendly fallback for an empty first name (no "Hi ,")', () => {
    const r = personalize('Hi {{first_name}}, welcome', { first_name: '' });
    expect(r.text).toContain('Hi there,');
    expect(findUnresolvedTokens(r.text)).toEqual([]);
    expect(r.fallbacksUsed).toContain('first_name');
  });

  it('strips + reports an unknown/misspelled token', () => {
    const r = personalize('Hi {{firstname}} at {{Company}}', { first_name: 'Dana', company: 'Acme' });
    expect(findUnresolvedTokens(r.text)).toEqual([]);
    expect(r.unresolved.sort()).toEqual(['Company', 'firstname']);
  });

  it('substitutes known tokens normally', () => {
    const r = personalize('Hi {{first_name}} from {{company}}', { first_name: 'Dana', company: 'Acme' });
    expect(r.text).toBe('Hi Dana from Acme');
    expect(r.unresolved).toEqual([]);
  });

  it('escapes HTML in lead fields (no injection)', () => {
    expect(escapeHtmlField('Evil <script>alert(1)</script>')).not.toContain('<script>');
    expect(escapeHtmlField('Smith & Co')).toBe('Smith &amp; Co');
  });

  it('is deterministic (replay-safe)', () => {
    const v = { first_name: 'Dana', company: 'Acme' };
    expect(personalize('Hi {{first_name}} ({{company}})', v).text)
      .toBe(personalize('Hi {{first_name}} ({{company}})', v).text);
  });
});

describe('effectiveStates (area enforcement)', () => {
  it('Ryan (no scope) is unrestricted', () => {
    expect(effectiveStates([], undefined)).toBeUndefined();
    expect(effectiveStates([], ['TX'])).toEqual(['TX']);
  });

  it('Percy (TX) defaults to TX and cannot pull IA', () => {
    expect(effectiveStates(['TX'], undefined)).toEqual(['TX']);
    expect(effectiveStates(['TX'], ['IA'])).toEqual(['TX']); // disjoint -> clamp to own scope
    expect(effectiveStates(['TX'], ['TX', 'IA'])).toEqual(['TX']); // overlap only
  });

  it('Grant (IA) cannot pull TX', () => {
    expect(effectiveStates(['IA'], ['TX'])).toEqual(['IA']);
  });

  it('a scoped user is never widened to all and never narrowed to none', () => {
    const eff = effectiveStates(['TX'], ['CA', 'NY']);
    expect(eff).toEqual(['TX']);
    expect(eff && eff.length).toBeGreaterThan(0);
  });
});
