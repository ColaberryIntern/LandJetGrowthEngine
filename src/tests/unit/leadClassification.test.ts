// Tests for the deterministic categorization core (Ali decision 2026-06-19).
// These lock in the contract that fixes the recurring bug Ryan keeps catching:
// a lead's vertical comes from its REAL industry, and a lead whose industry
// contradicts its campaign is detectable.

import { classifyVertical, campaignVertical, categoryMatches } from '../../services/leadClassification';

describe('classifyVertical -- industry -> vertical', () => {
  it.each([
    ['Construction', 'Real Estate, Construction and Engineering'],
    ['Real Estate', 'Real Estate, Construction and Engineering'],
    ['Civil Engineering', 'Real Estate, Construction and Engineering'],
    ['Commercial Real Estate', 'Real Estate, Construction and Engineering'],
    ['Pharmaceuticals', 'Healthcare'],
    ['Hospital & Health Care', 'Healthcare'],
    ['Medical Devices', 'Healthcare'],
    ['Insurance', 'Insurance'],
    ['Banking', 'Banking'],
    ['Financial Services', 'Banking'],
    ['Venture Capital & Private Equity', 'Banking'],
    ['Law Practice', 'Legal'],
    ['Legal Services', 'Legal'],
    ['Manufacturing', 'Manufacturing'],
    ['Machinery', 'Manufacturing'],
    ['Computer Software', 'Technology'],
    ['Information Technology & Services', 'Technology'],
    ['Staffing & Recruiting', 'Technology'],
    ['Sports', 'Sports & Events'],
    ['Events Services', 'Sports & Events'],
  ])('maps "%s" -> %s', (industry, expected) => {
    expect(classifyVertical(industry)).toBe(expected);
  });

  it('is case-insensitive and trims surrounding whitespace', () => {
    expect(classifyVertical('  CONSTRUCTION  ')).toBe('Real Estate, Construction and Engineering');
  });

  it('prefers Insurance over Banking (rule order matters)', () => {
    // "insurance" must not fall through to the broader financial keywords.
    expect(classifyVertical('Insurance')).toBe('Insurance');
  });

  it.each([null, undefined, '', '   ', 'Underwater Basket Weaving'])(
    'returns null for unclassifiable input %p',
    (input) => {
      expect(classifyVertical(input as any)).toBeNull();
    },
  );

  it('is deterministic: same input always yields the same output', () => {
    expect(classifyVertical('Construction')).toBe(classifyVertical('Construction'));
    expect(classifyVertical('Pharmaceuticals')).toBe(classifyVertical('Pharmaceuticals'));
  });
});

describe('campaignVertical -- campaign name -> intended vertical', () => {
  it.each([
    ['Cold Outreach - Banking & Finance', 'Banking'],
    ['Cold Outreach - Insurance', 'Insurance'],
    ['Cold Outreach - Construction & Engineering', 'Real Estate, Construction and Engineering'],
    ['Cold Outreach - Technology & Staffing', 'Technology'],
    ['Cold Outreach - Healthcare', 'Healthcare'],
    ['Cold Outreach - Sports & Events', 'Sports & Events'],
    ['Cold Outreach - Legal', 'Legal'],
    ['Cold Outreach - Manufacturing', 'Manufacturing'],
  ])('maps campaign "%s" -> %s', (name, expected) => {
    expect(campaignVertical(name)).toBe(expected);
  });

  it.each(['General Outreach', 'Investor Outreach', null, undefined, ''])(
    'returns null for non-vertical campaign %p',
    (name) => {
      expect(campaignVertical(name as any)).toBeNull();
    },
  );
});

describe('categoryMatches -- the recurring Ryan bug', () => {
  it('flags a remodeling firm (construction) in the Banking campaign as mismatch', () => {
    const r = categoryMatches('Construction', 'Cold Outreach - Banking & Finance');
    expect(r.status).toBe('mismatch');
    expect(r.leadVertical).toBe('Real Estate, Construction and Engineering');
    expect(r.campaignVertical).toBe('Banking');
  });

  it('flags a pharmacy in the Insurance campaign as mismatch', () => {
    expect(categoryMatches('Pharmaceuticals', 'Cold Outreach - Insurance').status).toBe('mismatch');
  });

  it('passes a correctly-matched lead and campaign', () => {
    expect(categoryMatches('Banking', 'Cold Outreach - Banking & Finance').status).toBe('match');
  });

  it('returns unknown (not mismatch) when industry is unclassifiable', () => {
    expect(categoryMatches('Underwater Basket Weaving', 'Cold Outreach - Banking & Finance').status).toBe('unknown');
  });

  it('returns unknown when the campaign is not a vertical campaign', () => {
    expect(categoryMatches('Banking', 'General Outreach').status).toBe('unknown');
  });
});
