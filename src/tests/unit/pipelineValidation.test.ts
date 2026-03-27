import { validatePipelineTransition } from '../../services/leadService';

describe('Pipeline Stage Validation', () => {
  it('should allow forward progression by one step', () => {
    expect(() => validatePipelineTransition('new_lead', 'contacted')).not.toThrow();
    expect(() => validatePipelineTransition('contacted', 'meeting_scheduled')).not.toThrow();
    expect(() => validatePipelineTransition('meeting_scheduled', 'proposal_sent')).not.toThrow();
    expect(() => validatePipelineTransition('proposal_sent', 'negotiation')).not.toThrow();
    expect(() => validatePipelineTransition('negotiation', 'enrolled')).not.toThrow();
  });

  it('should allow marking as lost from any stage', () => {
    expect(() => validatePipelineTransition('new_lead', 'lost')).not.toThrow();
    expect(() => validatePipelineTransition('contacted', 'lost')).not.toThrow();
    expect(() => validatePipelineTransition('meeting_scheduled', 'lost')).not.toThrow();
    expect(() => validatePipelineTransition('negotiation', 'lost')).not.toThrow();
  });

  it('should reject skipping stages', () => {
    expect(() => validatePipelineTransition('new_lead', 'meeting_scheduled')).toThrow(
      'Cannot skip',
    );
    expect(() => validatePipelineTransition('new_lead', 'enrolled')).toThrow('Cannot skip');
    expect(() => validatePipelineTransition('contacted', 'negotiation')).toThrow('Cannot skip');
  });

  it('should reject backward movement', () => {
    expect(() => validatePipelineTransition('contacted', 'new_lead')).toThrow('Cannot move backward');
    expect(() => validatePipelineTransition('enrolled', 'contacted')).toThrow('Cannot move backward');
  });

  it('should stay on same stage (no-op allowed)', () => {
    // Same stage means currentOrder === nextOrder, not > currentOrder + 1 and not < currentOrder
    // Actually this passes all checks since nextOrder is not > currentOrder + 1 and not < currentOrder
    expect(() => validatePipelineTransition('contacted', 'contacted')).not.toThrow();
  });
});
