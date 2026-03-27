import { Lead, PipelineStage, PIPELINE_ORDER } from '../models/Lead';
import { validatePipelineTransition } from './leadService';
import { logger } from '../config/logger';

const OUTCOME_TO_STAGE: Record<string, PipelineStage> = {
  sent: 'contacted',
  booked_meeting: 'meeting_scheduled',
  converted: 'enrolled',
};

/**
 * Auto-advance lead pipeline stage based on interaction outcome.
 */
export async function autoAdvancePipeline(leadId: number, outcome: string): Promise<void> {
  const targetStage = OUTCOME_TO_STAGE[outcome];
  if (!targetStage) return;

  const lead = await Lead.findByPk(leadId);
  if (!lead) return;

  const currentOrder = PIPELINE_ORDER[lead.pipeline_stage];
  const targetOrder = PIPELINE_ORDER[targetStage];

  // Only advance forward, never backward
  if (targetOrder <= currentOrder) return;

  // Only advance by one step
  if (targetOrder > currentOrder + 1) return;

  try {
    validatePipelineTransition(lead.pipeline_stage, targetStage);
    await lead.update({ pipeline_stage: targetStage });
    logger.info('Pipeline auto-advanced', { leadId, from: lead.pipeline_stage, to: targetStage, outcome });
  } catch {
    // Transition not valid, skip
  }
}
