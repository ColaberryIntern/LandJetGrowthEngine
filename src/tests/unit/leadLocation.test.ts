import { stateFromAreaCode, resolveLeadLocation, US_STATES } from '../../services/leadLocation';

describe('stateFromAreaCode', () => {
  it('maps a clean 10-digit number to its state', () => {
    expect(stateFromAreaCode('2145551234')).toBe('TX'); // Dallas
    expect(stateFromAreaCode('5155551234')).toBe('IA'); // Des Moines
  });

  it('handles formatting: +1, parens, dashes, spaces, extensions', () => {
    expect(stateFromAreaCode('+1 (210) 555-1234')).toBe('TX');
    expect(stateFromAreaCode('1-512-555-0000')).toBe('TX');
    expect(stateFromAreaCode('630.555.1234 x44')).toBe('IL');
  });

  it('returns null for missing / too-short / non-geographic numbers', () => {
    expect(stateFromAreaCode(null)).toBeNull();
    expect(stateFromAreaCode('')).toBeNull();
    expect(stateFromAreaCode('555-1234')).toBeNull();      // no area code
    expect(stateFromAreaCode('8005551234')).toBeNull();    // toll-free, not geographic
    expect(stateFromAreaCode('9995551234')).toBeNull();    // unassigned
  });

  it('only ever returns valid 2-letter US codes', () => {
    for (const ac of ['212', '305', '404', '713', '206', '319']) {
      const st = stateFromAreaCode(ac + '5550000');
      expect(st).not.toBeNull();
      expect(US_STATES.has(st as string)).toBe(true);
    }
  });
});

describe('resolveLeadLocation precedence', () => {
  it('uses area code first and does not call the LLM when phone resolves', async () => {
    const r = await resolveLeadLocation({ phone: '2145551234', company: 'Acme' }, { useLLM: true });
    expect(r).toEqual({ state: 'TX', city: null, source: 'area_code', confidence: 0.7 });
  });

  it('returns none when no phone and LLM disabled', async () => {
    const r = await resolveLeadLocation({ phone: null, company: 'Acme' }, { useLLM: false });
    expect(r.state).toBeNull();
    expect(r.source).toBe('none');
    expect(r.confidence).toBe(0);
  });

  it('returns none for an unresolvable phone when LLM is off', async () => {
    const r = await resolveLeadLocation({ phone: '8005551234' }, {});
    expect(r.source).toBe('none');
  });
});
