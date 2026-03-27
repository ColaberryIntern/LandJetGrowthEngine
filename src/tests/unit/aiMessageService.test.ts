import { buildSystemPrompt, buildUserPrompt, cleanGeneratedContent } from '../../services/aiMessageService';

describe('AI Message Service', () => {
  describe('buildSystemPrompt', () => {
    it('should include JSON format for email channel', () => {
      const prompt = buildSystemPrompt('email');
      expect(prompt).toContain('JSON');
      expect(prompt).toContain('subject');
      expect(prompt).toContain('body');
    });

    it('should include 160 char limit for SMS', () => {
      const prompt = buildSystemPrompt('sms');
      expect(prompt).toContain('160');
      expect(prompt).toContain('plain text');
    });

    it('should include conversational for voice', () => {
      const prompt = buildSystemPrompt('voice');
      expect(prompt).toContain('conversational');
    });

    it('should include URL whitelist', () => {
      const prompt = buildSystemPrompt('email');
      expect(prompt).toContain('enterprise.colaberry.ai');
      expect(prompt).toContain('NEVER invent URLs');
    });

    it('should use campaign system prompt when provided', () => {
      const prompt = buildSystemPrompt('email', 'You are Cory, an executive advisor.');
      expect(prompt).toContain('Cory');
    });
  });

  describe('buildUserPrompt', () => {
    it('should include lead profile', () => {
      const prompt = buildUserPrompt({
        channel: 'email',
        ai_instructions: 'Write intro email',
        lead: { name: 'John Smith', company: 'Acme Corp', title: 'CTO', industry: 'SaaS', lead_score: 75 },
      });
      expect(prompt).toContain('John Smith');
      expect(prompt).toContain('Acme Corp');
      expect(prompt).toContain('CTO');
      expect(prompt).toContain('SaaS');
    });

    it('should include campaign context', () => {
      const prompt = buildUserPrompt({
        channel: 'email',
        ai_instructions: 'Write follow-up',
        lead: { name: 'Jane' },
        campaignContext: { type: 'cold_outbound', name: 'Q1 Outreach', step_goal: 'Book meeting', step_number: 3 },
      });
      expect(prompt).toContain('Q1 Outreach');
      expect(prompt).toContain('Book meeting');
      expect(prompt).toContain('STEP: 3');
    });

    it('should include conversation history', () => {
      const prompt = buildUserPrompt({
        channel: 'email',
        ai_instructions: 'Follow up',
        lead: { name: 'Test' },
        conversationHistory: [
          { timestamp: '2026-03-20', sender: 'system', channel: 'email', body: 'Initial intro sent', outcome: 'sent' },
          { timestamp: '2026-03-22', sender: 'lead', channel: 'email', body: 'Thanks for reaching out', outcome: 'replied' },
        ],
      });
      expect(prompt).toContain('PREVIOUS INTERACTIONS');
      expect(prompt).toContain('Initial intro sent');
    });

    it('should include insights', () => {
      const prompt = buildUserPrompt({
        channel: 'email',
        ai_instructions: 'Write email',
        lead: { name: 'Test' },
        insights: ['Email open rate 22% for this segment', 'Step 2 has highest reply rate'],
      });
      expect(prompt).toContain('CAMPAIGN KNOWLEDGE');
      expect(prompt).toContain('22%');
    });
  });

  describe('cleanGeneratedContent', () => {
    it('should strip markdown code fences', () => {
      const input = '```json\n{"subject": "Hello", "body": "<p>Hi</p>"}\n```';
      const result = cleanGeneratedContent(input, 'email');
      expect(result).not.toContain('```');
    });

    it('should replace hallucinated Calendly URLs with approved URL', () => {
      const input = 'Book here: https://calendly.com/fake-user/meeting';
      const result = cleanGeneratedContent(input, 'email');
      expect(result).toContain('enterprise.colaberry.ai');
      expect(result).not.toContain('calendly.com');
    });

    it('should replace cal.com URLs', () => {
      const input = 'Schedule: https://cal.com/user/strategy';
      const result = cleanGeneratedContent(input, 'email');
      expect(result).not.toContain('cal.com');
    });

    it('should apply SMS cleanup for sms channel', () => {
      const input = '<p>Hey Cory here! Reply STOP to unsubscribe.</p>';
      const result = cleanGeneratedContent(input, 'sms');
      expect(result).not.toContain('<');
      expect(result).not.toContain('Cory');
      expect(result).not.toContain('Reply STOP');
    });

    it('should truncate SMS to 160 chars', () => {
      const input = 'A'.repeat(200);
      const result = cleanGeneratedContent(input, 'sms');
      expect(result.length).toBeLessThanOrEqual(160);
    });

    it('should not apply SMS cleanup for email channel', () => {
      const input = '<p>Hello from Cory</p>';
      const result = cleanGeneratedContent(input, 'email');
      expect(result).toContain('<p>');
    });
  });
});
