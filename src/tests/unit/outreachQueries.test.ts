import { Op } from 'sequelize';

jest.mock('../../models/Contact', () => {
  const mockFindAll = jest.fn();
  return {
    Contact: {
      findAll: mockFindAll,
    },
  };
});

import { Contact } from '../../models/Contact';
import { getContactsForToday, computePriorityScore } from '../../services/outreachQueryService';

const mockFindAll = Contact.findAll as jest.MockedFunction<typeof Contact.findAll>;

function makeContact(overrides: Partial<any> = {}): any {
  return {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'John Doe',
    email: 'john@example.com',
    phone: '555-1234',
    company: null,
    relationship_type: 'PAST_CLIENT',
    sequence_stage: 1,
    last_contacted_at: null,
    next_action_at: null,
    status: 'ACTIVE',
    priority_score: 0,
    vertical: null,
    tier: null,
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('computePriorityScore', () => {
  it('should give +3 for stage 1', () => {
    const contact = makeContact({ sequence_stage: 1, last_contacted_at: new Date() });
    expect(computePriorityScore(contact)).toBe(3);
  });

  it('should give +2 for stage 2', () => {
    const contact = makeContact({ sequence_stage: 2, last_contacted_at: new Date() });
    expect(computePriorityScore(contact)).toBe(2);
  });

  it('should give +1 for stage 3', () => {
    const contact = makeContact({ sequence_stage: 3, last_contacted_at: new Date() });
    expect(computePriorityScore(contact)).toBe(1);
  });

  it('should give +3 for never contacted', () => {
    const contact = makeContact({ sequence_stage: 99, last_contacted_at: null });
    expect(computePriorityScore(contact)).toBe(3);
  });

  it('should give +6 for stage 1 + never contacted', () => {
    const contact = makeContact({ sequence_stage: 1, last_contacted_at: null });
    expect(computePriorityScore(contact)).toBe(6);
  });

  it('should give 0 for stage 4+ with prior contact and no tier', () => {
    const contact = makeContact({ sequence_stage: 4, last_contacted_at: new Date() });
    expect(computePriorityScore(contact)).toBe(0);
  });

  it('should give +5 for tier 1', () => {
    const contact = makeContact({ sequence_stage: 4, last_contacted_at: new Date(), tier: 1 });
    expect(computePriorityScore(contact)).toBe(5);
  });

  it('should give +3 for tier 2', () => {
    const contact = makeContact({ sequence_stage: 4, last_contacted_at: new Date(), tier: 2 });
    expect(computePriorityScore(contact)).toBe(3);
  });

  it('should give +1 for tier 3', () => {
    const contact = makeContact({ sequence_stage: 4, last_contacted_at: new Date(), tier: 3 });
    expect(computePriorityScore(contact)).toBe(1);
  });

  it('should give 0 for null tier', () => {
    const contact = makeContact({ sequence_stage: 4, last_contacted_at: new Date(), tier: null });
    expect(computePriorityScore(contact)).toBe(0);
  });

  it('should stack tier + stage + never contacted', () => {
    const contact = makeContact({ sequence_stage: 1, last_contacted_at: null, tier: 1 });
    // stage 1 (+3) + never contacted (+3) + tier 1 (+5) = 11
    expect(computePriorityScore(contact)).toBe(11);
  });
});

describe('getContactsForToday', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return contacts with priority_score attached', async () => {
    mockFindAll.mockResolvedValue([makeContact()] as any);

    const result = await getContactsForToday();

    expect(result).toHaveLength(1);
    expect(result[0].priority_score).toBe(6); // stage 1 (+3) + never contacted (+3)
  });

  it('should sort by priority_score DESC then created_at ASC', async () => {
    const contactA = makeContact({
      id: 'aaa',
      name: 'Stage 3 contacted',
      sequence_stage: 3,
      last_contacted_at: new Date(),
      created_at: new Date('2026-01-01'),
    });
    const contactB = makeContact({
      id: 'bbb',
      name: 'Stage 1 never contacted',
      sequence_stage: 1,
      last_contacted_at: null,
      created_at: new Date('2026-01-15'),
    });
    const contactC = makeContact({
      id: 'ccc',
      name: 'Stage 1 never contacted earlier',
      sequence_stage: 1,
      last_contacted_at: null,
      created_at: new Date('2026-01-02'),
    });

    mockFindAll.mockResolvedValue([contactA, contactB, contactC] as any);

    const result = await getContactsForToday();

    // contactC and contactB both score 6, but contactC has earlier created_at
    // contactA scores 1
    expect(result[0].id).toBe('ccc');  // score 6, earlier date
    expect(result[1].id).toBe('bbb');  // score 6, later date
    expect(result[2].id).toBe('aaa');  // score 1
  });

  it('should query with correct filters', async () => {
    mockFindAll.mockResolvedValue([]);

    await getContactsForToday();

    expect(mockFindAll).toHaveBeenCalledTimes(1);
    const callArgs = mockFindAll.mock.calls[0][0] as any;

    expect(callArgs.where.status).toBe('ACTIVE');
    expect(callArgs.where[Op.or]).toBeDefined();
    expect(callArgs.limit).toBe(200);
  });

  it('should limit final results to 50', async () => {
    const manyContacts = Array.from({ length: 100 }, (_, i) =>
      makeContact({ id: `id-${i}`, email: `user${i}@test.com`, created_at: new Date('2026-01-01') })
    );

    mockFindAll.mockResolvedValue(manyContacts as any);

    const result = await getContactsForToday();

    expect(result).toHaveLength(50);
  });

  it('should rank tier 1 contact above non-tier contact', async () => {
    const noTier = makeContact({
      id: 'no-tier',
      sequence_stage: 1,
      last_contacted_at: null,
      tier: null,
      created_at: new Date('2026-01-01'),
    });
    const tier1 = makeContact({
      id: 'tier-1',
      sequence_stage: 1,
      last_contacted_at: null,
      tier: 1,
      created_at: new Date('2026-01-15'),
    });

    mockFindAll.mockResolvedValue([noTier, tier1] as any);

    const result = await getContactsForToday();

    // tier1: 3+3+5=11, noTier: 3+3+0=6
    expect(result[0].id).toBe('tier-1');
    expect(result[1].id).toBe('no-tier');
  });

  it('should return empty array when no contacts match', async () => {
    mockFindAll.mockResolvedValue([]);

    const result = await getContactsForToday();

    expect(result).toEqual([]);
  });
});
