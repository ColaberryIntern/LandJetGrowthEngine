import { searchFaqs, looksLikeFaq, LANDJET_FAQS } from '../../services/landjetFaqService';

describe('LandJet FAQ Service', () => {

  describe('LANDJET_FAQS data', () => {
    it('contains 12 entries (current as of 2026-05-07 scrape)', () => {
      expect(LANDJET_FAQS).toHaveLength(12);
    });

    it('every entry has unique id, non-empty question, non-empty answer', () => {
      const seen = new Set<number>();
      for (const e of LANDJET_FAQS) {
        expect(e.id).toBeGreaterThan(0);
        expect(seen.has(e.id)).toBe(false);
        seen.add(e.id);
        expect(e.question.length).toBeGreaterThan(5);
        expect(e.answer.length).toBeGreaterThan(10);
      }
    });
  });

  describe('searchFaqs (happy path)', () => {
    it('finds the cancellation FAQ for a cancellation question', () => {
      const matches = searchFaqs('How do I cancel my trip?');
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].entry.question.toLowerCase()).toContain('cancel');
    });

    it('finds the gratuity FAQ for a tip question', () => {
      const matches = searchFaqs('Can I add a tip / gratuity for my driver?');
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].entry.question.toLowerCase()).toContain('gratuity');
    });

    it('finds the overnight FAQ for an overnight question', () => {
      const matches = searchFaqs('Can I stay overnight on my trip?');
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].entry.question.toLowerCase()).toContain('overnight');
    });

    it('finds the weather FAQ', () => {
      const matches = searchFaqs('What happens if there is bad weather?');
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].entry.question.toLowerCase()).toContain('weather');
    });

    it('finds the confidentiality FAQ', () => {
      const matches = searchFaqs('Is my conversation kept confidential?');
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].entry.question.toLowerCase()).toContain('confidentially');
    });
  });

  describe('searchFaqs (boundary cases)', () => {
    it('returns empty array for empty query', () => {
      expect(searchFaqs('')).toEqual([]);
    });

    it('returns empty array for stopword-only query', () => {
      expect(searchFaqs('hi how are you')).toEqual([]);
    });

    it('respects the limit option', () => {
      const matches = searchFaqs('trip pilot', { limit: 2, threshold: 0 });
      expect(matches.length).toBeLessThanOrEqual(2);
    });

    it('respects the threshold option (high threshold filters out weak matches)', () => {
      const lowMatches = searchFaqs('something completely unrelated', { threshold: 0.1 });
      const highMatches = searchFaqs('something completely unrelated', { threshold: 0.9 });
      expect(highMatches.length).toBeLessThanOrEqual(lowMatches.length);
    });

    it('orders matches by score desc', () => {
      const matches = searchFaqs('overnight pilot stay hotel', { threshold: 0 });
      expect(matches.length).toBeGreaterThan(1);
      for (let i = 0; i < matches.length - 1; i++) {
        expect(matches[i].score).toBeGreaterThanOrEqual(matches[i + 1].score);
      }
    });
  });

  describe('looksLikeFaq', () => {
    it('returns true for a clear FAQ-style question', () => {
      expect(looksLikeFaq('What is your cancellation policy?')).toBe(true);
    });

    it('returns false for a quote request', () => {
      // A trip request should NOT trigger the FAQ path
      expect(looksLikeFaq('I need a ride from Davenport to Chicago next Tuesday')).toBe(false);
    });

    it('returns false for empty input', () => {
      expect(looksLikeFaq('')).toBe(false);
    });

    it('returns false for greeting-only input', () => {
      expect(looksLikeFaq('Hi, hope you are well')).toBe(false);
    });
  });

  describe('Idempotency', () => {
    it('repeated calls with same input return identical results', () => {
      const a = searchFaqs('overnight stay policy');
      const b = searchFaqs('overnight stay policy');
      expect(a.length).toBe(b.length);
      a.forEach((m, i) => {
        expect(m.entry.id).toBe(b[i].entry.id);
        expect(m.score).toBe(b[i].score);
      });
    });
  });
});
