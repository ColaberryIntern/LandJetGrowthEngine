// Test the approval flow state machine logic directly
describe('Campaign Approval Flow', () => {
  const VALID_TRANSITIONS: Record<string, string[]> = {
    draft: ['pending_approval'],
    pending_approval: ['approved', 'draft'],
    approved: ['live', 'paused'],
    live: ['paused', 'completed'],
    paused: ['live', 'completed', 'draft'],
    completed: [],
  };

  function canTransition(from: string, to: string): boolean {
    return (VALID_TRANSITIONS[from] || []).includes(to);
  }

  describe('valid transitions', () => {
    it('draft -> pending_approval', () => expect(canTransition('draft', 'pending_approval')).toBe(true));
    it('pending_approval -> approved', () => expect(canTransition('pending_approval', 'approved')).toBe(true));
    it('pending_approval -> draft (reject)', () => expect(canTransition('pending_approval', 'draft')).toBe(true));
    it('approved -> live', () => expect(canTransition('approved', 'live')).toBe(true));
    it('approved -> paused', () => expect(canTransition('approved', 'paused')).toBe(true));
    it('live -> paused', () => expect(canTransition('live', 'paused')).toBe(true));
    it('live -> completed', () => expect(canTransition('live', 'completed')).toBe(true));
    it('paused -> live (resume)', () => expect(canTransition('paused', 'live')).toBe(true));
    it('paused -> completed', () => expect(canTransition('paused', 'completed')).toBe(true));
    it('paused -> draft (reset)', () => expect(canTransition('paused', 'draft')).toBe(true));
  });

  describe('invalid transitions', () => {
    it('draft -> live (skip approval)', () => expect(canTransition('draft', 'live')).toBe(false));
    it('draft -> completed', () => expect(canTransition('draft', 'completed')).toBe(false));
    it('live -> draft', () => expect(canTransition('live', 'draft')).toBe(false));
    it('completed -> anything', () => {
      expect(canTransition('completed', 'draft')).toBe(false);
      expect(canTransition('completed', 'live')).toBe(false);
      expect(canTransition('completed', 'paused')).toBe(false);
    });
    it('live -> approved (backward)', () => expect(canTransition('live', 'approved')).toBe(false));
  });
});
