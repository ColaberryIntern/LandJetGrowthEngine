import { classifyInboundIntent, intentNeedsReply } from '../../services/inboundIntent';

describe('classifyInboundIntent', () => {
  it('treats a sign-off / thanks as gratitude (no reply needed)', () => {
    expect(classifyInboundIntent('Sounds great, thank you!!')).toBe('gratitude');
    expect(classifyInboundIntent('Perfect, appreciate it. We are all set.')).toBe('gratitude');
    expect(classifyInboundIntent('Got it, thanks so much!')).toBe('gratitude');
    expect(intentNeedsReply('gratitude')).toBe(false);
  });

  it('treats a question as needing a reply (even if it also says thanks)', () => {
    expect(classifyInboundIntent('Thanks! Can you also add a stop on the way?')).toBe('question');
    expect(classifyInboundIntent('What time will the driver arrive?')).toBe('question');
    expect(classifyInboundIntent('We only need 7 hours, does that change the price?')).toBe('question');
    expect(intentNeedsReply('question')).toBe(true);
  });

  it('treats an explicit go-ahead as a confirmation (action: book it)', () => {
    expect(classifyInboundIntent('Yes, let us book it. Please proceed.')).toBe('confirmation');
    expect(classifyInboundIntent('That works for us, go ahead and schedule it.')).toBe('confirmation');
    expect(intentNeedsReply('confirmation')).toBe(true);
  });

  it('falls back to other for a substantive non-question message', () => {
    expect(classifyInboundIntent('Here is the address for the pickup: 123 Main St.')).toBe('other');
    expect(classifyInboundIntent('')).toBe('other');
  });

  it('ignores a quoted signature/history tail', () => {
    expect(classifyInboundIntent('Sounds great, thanks!\n\nFrom: LJ_Reservations\nSent: Monday\nCan you confirm the time?')).toBe('gratitude');
  });
});
