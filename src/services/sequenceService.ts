import { FollowUpSequence, SequenceStep } from '../models/FollowUpSequence';
import { ValidationError, NotFoundError } from '../middleware/errors';

const MAX_STEPS = 12;
const MAX_DURATION_DAYS = 45;
const MIN_GAP_DAYS = 2;
const MIN_VOICE_GAP_DAYS = 3;

export interface SequenceValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateSequenceSteps(steps: SequenceStep[]): SequenceValidationResult {
  const errors: string[] = [];

  if (steps.length === 0) {
    errors.push('Sequence must have at least 1 step');
    return { valid: false, errors };
  }

  if (steps.length > MAX_STEPS) {
    errors.push(`Sequence cannot have more than ${MAX_STEPS} steps (got ${steps.length})`);
  }

  // Check max duration
  const maxDelay = Math.max(...steps.map((s) => s.delay_days));
  if (maxDelay > MAX_DURATION_DAYS) {
    errors.push(`Campaign duration cannot exceed ${MAX_DURATION_DAYS} days (got ${maxDelay})`);
  }

  // Sort by delay_days for gap checking
  const sorted = [...steps].sort((a, b) => a.delay_days - b.delay_days);

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const gap = curr.delay_days - prev.delay_days;

    // Same day handling: email+SMS allowed, duplicate channels blocked, voice blocked
    if (gap === 0) {
      if (prev.channel === curr.channel) {
        errors.push(`Duplicate channel '${curr.channel}' on day ${curr.delay_days}`);
      }
      const channels = new Set([prev.channel, curr.channel]);
      if (channels.has('voice')) {
        errors.push(`Voice cannot share a day with another channel on day ${curr.delay_days}`);
      }
      // email+SMS on same day is allowed - skip gap check
      continue;
    }

    // Min gap between steps on different days
    const minGap = curr.channel === 'voice' || prev.channel === 'voice'
      ? MIN_VOICE_GAP_DAYS
      : MIN_GAP_DAYS;

    if (gap < minGap) {
      errors.push(
        `Insufficient gap between step ${i} (day ${prev.delay_days}) and step ${i + 1} (day ${curr.delay_days}). Minimum: ${minGap} days`,
      );
    }
  }

  // Validate each step has required fields
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step.channel) errors.push(`Step ${i + 1}: channel is required`);
    if (!step.ai_instructions && !step.body_template) {
      errors.push(`Step ${i + 1}: ai_instructions or body_template is required`);
    }
    if (step.delay_days < 0) errors.push(`Step ${i + 1}: delay_days cannot be negative`);
    if (!step.max_attempts || step.max_attempts < 1) {
      errors.push(`Step ${i + 1}: max_attempts must be at least 1`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export async function createSequence(input: {
  name: string;
  description?: string;
  steps: SequenceStep[];
}) {
  if (!input.name) throw new ValidationError('Sequence name is required');

  const validation = validateSequenceSteps(input.steps);
  if (!validation.valid) {
    throw new ValidationError(`Sequence validation failed: ${validation.errors.join('; ')}`);
  }

  return FollowUpSequence.create({
    name: input.name,
    description: input.description || null,
    steps: input.steps,
  });
}

export async function updateSequence(id: string, input: {
  name?: string;
  description?: string;
  steps?: SequenceStep[];
}) {
  const sequence = await FollowUpSequence.findByPk(id);
  if (!sequence) throw new NotFoundError('Sequence not found');

  if (input.steps) {
    const validation = validateSequenceSteps(input.steps);
    if (!validation.valid) {
      throw new ValidationError(`Sequence validation failed: ${validation.errors.join('; ')}`);
    }
  }

  await sequence.update(input);
  return sequence;
}

export async function getSequenceById(id: string) {
  const sequence = await FollowUpSequence.findByPk(id);
  if (!sequence) throw new NotFoundError('Sequence not found');
  return sequence;
}

export async function listSequences() {
  return FollowUpSequence.findAll({ order: [['created_at', 'DESC']] });
}
