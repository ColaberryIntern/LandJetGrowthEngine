import { logger } from '../config/logger';

export interface VoiceCallOptions {
  phone: string;
  name: string;
  prompt: string;
  agentType: 'welcome' | 'interest';
  customVariables?: { key: string; value: string }[];
}

export interface VoiceCallResult {
  success: boolean;
  callId?: string;
  error?: string;
}

function getAgentModelId(agentType: 'welcome' | 'interest'): string {
  if (agentType === 'welcome') {
    return process.env.SYNTHFLOW_WELCOME_AGENT_ID || '';
  }
  return process.env.SYNTHFLOW_INTEREST_AGENT_ID || '';
}

/**
 * Initiate a voice call via Synthflow API.
 */
export async function initiateCall(options: VoiceCallOptions): Promise<VoiceCallResult> {
  const apiKey = process.env.SYNTHFLOW_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'SYNTHFLOW_API_KEY not configured' };
  }

  if (process.env.ENABLE_VOICE_CALLS !== 'true') {
    logger.info('Voice calls disabled, skipping', { phone: options.phone });
    return { success: false, error: 'Voice calls are disabled' };
  }

  const modelId = getAgentModelId(options.agentType);
  if (!modelId) {
    return { success: false, error: `No agent ID configured for type: ${options.agentType}` };
  }

  const payload = {
    model_id: modelId,
    phone: options.phone,
    name: options.name,
    prompt: options.prompt,
    custom_variables: options.customVariables || [],
  };

  try {
    const response = await fetch('https://api.synthflow.ai/v2/calls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Synthflow API error', { status: response.status, error: errorText });
      return { success: false, error: `API error: ${response.status}` };
    }

    const data = (await response.json()) as Record<string, any>;
    logger.info('Voice call initiated', { phone: options.phone, callId: data.call_id });
    return { success: true, callId: data.call_id };
  } catch (error) {
    logger.error('Synthflow call failed', { error: (error as Error).message });
    return { success: false, error: (error as Error).message };
  }
}
