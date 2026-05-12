import { isBouncePostmasterEmail, extractBouncedRecipient } from '../../services/bounceProcessorService';

const OUTLOOK_NDR_BODY = `Your message to cgb@clarkstoncapital.com couldn't be delivered.

Original Message Details
Created Date:
5/11/2026 5:34:18 PM
Sender Address:
rlandry@landjet.com
Recipient Address:
cgb@clarkstoncapital.com
Subject:
Revolutionizing Business Travel with LandJet`;

const NEP_POSTMASTER_BODY = `This is a delivery failure notification message indicating that
an email you addressed to email address :
-- aeveloff@nep.com

could not be delivered. The problem appears to be :
-- Recipient email address is possibly incorrect

Additional information follows :
-- 5.4.1 Recipient address rejected: Access denied.`;

const HTML_OUTLOOK_BODY = `<html><body><p>Your message to <a>jsullan@brookhavenpartners.com</a> couldn't be delivered.</p><p>Recipient Address: jsullan@brookhavenpartners.com</p></body></html>`;

describe('Bounce Processor', () => {

  describe('isBouncePostmasterEmail', () => {
    it('detects postmaster@ sender', () => {
      expect(isBouncePostmasterEmail('postmaster@nep.com', 'Email Delivery Failure')).toBe(true);
    });

    it('detects MicrosoftExchange tenant sender', () => {
      expect(isBouncePostmasterEmail(
        'microsoftexchange329e71ec88ae4615bbc36ab6ce41109e@landjet.com',
        'Undeliverable: My Email',
      )).toBe(true);
    });

    it('detects mailer-daemon@', () => {
      expect(isBouncePostmasterEmail('mailer-daemon@gmail.com', 'failure notice')).toBe(true);
    });

    it('detects bounce by subject when sender unknown', () => {
      expect(isBouncePostmasterEmail('relay@somehost.com', 'Undeliverable: Test message')).toBe(true);
      expect(isBouncePostmasterEmail('relay@somehost.com', 'Mail Delivery Failed')).toBe(true);
      expect(isBouncePostmasterEmail('relay@somehost.com', 'Returned mail: not delivered')).toBe(true);
    });

    it('does NOT flag a normal email from a person', () => {
      expect(isBouncePostmasterEmail('amy@example.com', 'Quote request')).toBe(false);
    });

    it('does NOT flag an empty subject from unknown sender', () => {
      expect(isBouncePostmasterEmail('unknown@x.com', '')).toBe(false);
    });
  });

  describe('extractBouncedRecipient', () => {
    it('extracts from Outlook NDR "Recipient Address:" line', () => {
      expect(extractBouncedRecipient(OUTLOOK_NDR_BODY)).toBe('cgb@clarkstoncapital.com');
    });

    it('extracts from generic postmaster "-- email" pattern', () => {
      expect(extractBouncedRecipient(NEP_POSTMASTER_BODY)).toBe('aeveloff@nep.com');
    });

    it('extracts from "Your message to X couldn\'t be delivered" prose', () => {
      const body = `Your message to test@example.com couldn't be delivered.\nOther stuff here.`;
      expect(extractBouncedRecipient(body)).toBe('test@example.com');
    });

    it('extracts from HTML body (strips tags first)', () => {
      expect(extractBouncedRecipient(HTML_OUTLOOK_BODY)).toBe('jsullan@brookhavenpartners.com');
    });

    it('lowercases the extracted email', () => {
      const body = 'Recipient Address: Test.User@Example.Com';
      expect(extractBouncedRecipient(body)).toBe('test.user@example.com');
    });

    it('returns null when no recipient pattern matches', () => {
      expect(extractBouncedRecipient('this is just a regular email')).toBeNull();
    });

    it('returns null on empty body', () => {
      expect(extractBouncedRecipient('')).toBeNull();
    });
  });

  describe('Idempotency', () => {
    it('extracting from same body twice returns same result', () => {
      const a = extractBouncedRecipient(OUTLOOK_NDR_BODY);
      const b = extractBouncedRecipient(OUTLOOK_NDR_BODY);
      expect(a).toBe(b);
    });
  });
});
