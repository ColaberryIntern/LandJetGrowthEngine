import { classifyReply } from '../../services/replyClassification';

describe('classifyReply -- tracked-category tags', () => {
  it('tags scheduling language as "Wants to meet" (closest to a booking)', () => {
    expect(classifyReply('Re: intro', "Monday's bad for me. Do you prefer Friday or Tuesday?").tone).toBe('meet');
    expect(classifyReply('Re: LandJet', "Sure, let's set up a time next week to chat.").tone).toBe('meet');
  });

  it('tags decline / going-cold language as "Not now"', () => {
    expect(classifyReply('Re: follow up', "I assume you aren't going through with this now? No communication in over 2 months.").tone).toBe('negative');
    expect(classifyReply('Re: x', 'Not interested, please remove me.').tone).toBe('negative');
  });

  it('tags out-of-office as "Auto-reply"', () => {
    expect(classifyReply('Automatic reply: Out of office', 'I am currently out and will respond on Monday.').tone).toBe('auto');
  });

  it('tags a pricing/info question as "Question"', () => {
    expect(classifyReply('Re: LandJet', "What's the pricing for a Dallas to Austin run?").tone).toBe('question');
  });

  it('tags clear positive engagement as "Interested"', () => {
    expect(classifyReply('Re: LandJet', 'This sounds great, tell me more.').tone).toBe('interested');
  });

  it('falls back to neutral "Replied" when nothing matches', () => {
    expect(classifyReply('Re: x', 'Thanks.').tone).toBe('neutral');
  });

  it('is deterministic', () => {
    const a = classifyReply('Re: x', 'Can you send me availability for a call?');
    const b = classifyReply('Re: x', 'Can you send me availability for a call?');
    expect(a.tone).toBe(b.tone);
  });
});
