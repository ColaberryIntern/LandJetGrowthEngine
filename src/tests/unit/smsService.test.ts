import { cleanSmsContent } from '../../services/smsService';

describe('SMS Service', () => {
  describe('cleanSmsContent', () => {
    it('should strip HTML tags', () => {
      expect(cleanSmsContent('<b>Hello</b> world')).toBe('Hello world');
    });

    it('should remove "Reply STOP" language', () => {
      expect(cleanSmsContent('Hi there! Reply STOP to unsubscribe.')).toBe('Hi there!');
    });

    it('should remove AI agent names', () => {
      expect(cleanSmsContent('This is Cory reaching out about your enrollment.')).toBe(
        'This is reaching out about your enrollment.',
      );
    });

    it('should remove "AI Assistant" references', () => {
      expect(cleanSmsContent('Your AI Assistant has a message.')).toBe('Your has a message.');
    });

    it('should truncate to 160 characters with ellipsis', () => {
      const longMessage = 'A'.repeat(200);
      const result = cleanSmsContent(longMessage);
      expect(result.length).toBe(160);
      expect(result.endsWith('...')).toBe(true);
    });

    it('should not truncate messages under 160 chars', () => {
      const msg = 'Hi! Quick reminder about your strategy call tomorrow at 3pm.';
      expect(cleanSmsContent(msg)).toBe(msg);
    });

    it('should normalize whitespace', () => {
      expect(cleanSmsContent('Hello   \n  world   ')).toBe('Hello world');
    });

    it('should handle combined cleanup', () => {
      const input = '<p>Hey! Cory here. Reply STOP to opt out.</p>';
      const result = cleanSmsContent(input);
      expect(result).not.toContain('<');
      expect(result).not.toContain('Cory');
      expect(result).not.toContain('Reply STOP');
    });
  });
});
