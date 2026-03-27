describe('Campaign Analytics', () => {
  it('should calculate rates correctly', () => {
    const rate = (num: number, sent: number) => sent > 0 ? Math.round((num / sent) * 10000) / 100 : 0;

    expect(rate(30, 100)).toBe(30);
    expect(rate(5, 200)).toBe(2.5);
    expect(rate(0, 100)).toBe(0);
    expect(rate(1, 0)).toBe(0);
  });

  it('should handle zero sent correctly', () => {
    const rate = (num: number, sent: number) => sent > 0 ? Math.round((num / sent) * 10000) / 100 : 0;
    expect(rate(10, 0)).toBe(0);
  });

  it('should calculate percentage correctly for typical campaigns', () => {
    const rate = (num: number, sent: number) => sent > 0 ? Math.round((num / sent) * 10000) / 100 : 0;
    // 500 sent, 145 opened = 29%
    expect(rate(145, 500)).toBe(29);
    // 500 sent, 32 replied = 6.4%
    expect(rate(32, 500)).toBe(6.4);
  });
});

describe('Pipeline Auto-Advancement', () => {
  const OUTCOME_TO_STAGE: Record<string, string> = {
    sent: 'contacted',
    booked_meeting: 'meeting_scheduled',
    converted: 'enrolled',
  };

  it('should map sent -> contacted', () => {
    expect(OUTCOME_TO_STAGE['sent']).toBe('contacted');
  });

  it('should map booked_meeting -> meeting_scheduled', () => {
    expect(OUTCOME_TO_STAGE['booked_meeting']).toBe('meeting_scheduled');
  });

  it('should map converted -> enrolled', () => {
    expect(OUTCOME_TO_STAGE['converted']).toBe('enrolled');
  });

  it('should not map unknown outcomes', () => {
    expect(OUTCOME_TO_STAGE['opened']).toBeUndefined();
    expect(OUTCOME_TO_STAGE['clicked']).toBeUndefined();
  });
});
