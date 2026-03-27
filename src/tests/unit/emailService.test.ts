import { applyTestMode } from '../../services/emailService';

describe('Email Service', () => {
  describe('applyTestMode', () => {
    it('should redirect to test email and prefix subject', () => {
      const options = {
        to: 'ceo@bigcorp.com',
        subject: 'Introduction to LandJet',
        html: '<p>Hello</p>',
      };

      const result = applyTestMode(options, 'test@test.landjet.com');

      expect(result.to).toBe('test@test.landjet.com');
      expect(result.subject).toBe('[TEST -> ceo@bigcorp.com] Introduction to LandJet');
      expect(result.originalTo).toBe('ceo@bigcorp.com');
      expect(result.html).toBe('<p>Hello</p>');
    });

    it('should preserve all other options', () => {
      const options = {
        to: 'user@corp.com',
        from: 'sender@landjet.com',
        replyTo: 'reply@landjet.com',
        subject: 'Follow Up',
        html: '<b>Hi</b>',
        campaignId: 'camp-123',
      };

      const result = applyTestMode(options, 'test@test.com');

      expect(result.from).toBe('sender@landjet.com');
      expect(result.replyTo).toBe('reply@landjet.com');
      expect(result.campaignId).toBe('camp-123');
    });
  });
});
