import { ScheduledEmail } from '../models/ScheduledEmail';
import { CommunicationLog } from '../models/CommunicationLog';
import { sendEmail, applyTestMode } from './emailService';
import { initiateCall } from './synthflowService';
import { sendSms, cleanSmsContent } from './smsService';
import { logger } from '../config/logger';

export interface DispatchResult {
  success: boolean;
  provider: string;
  messageId?: string;
  error?: string;
}

/**
 * Unified channel dispatcher - routes a scheduled action to the correct channel.
 */
export async function dispatchAction(
  action: ScheduledEmail,
  options: { deliveryMode: 'production' | 'test_redirect'; redirect?: { email?: string; phone?: string } } = { deliveryMode: 'production' },
): Promise<DispatchResult> {
  const { channel } = action;

  try {
    let result: DispatchResult;

    switch (channel) {
      case 'email':
        result = await dispatchEmail(action, options);
        break;
      case 'voice':
        result = await dispatchVoice(action);
        break;
      case 'sms':
        result = await dispatchSms(action, options);
        break;
      default:
        result = { success: false, provider: 'unknown', error: `Unknown channel: ${channel}` };
    }

    // Log communication
    if (result.success) {
      await CommunicationLog.create({
        lead_id: action.lead_id,
        campaign_id: action.campaign_id,
        channel: action.channel,
        direction: 'outbound',
        delivery_mode: options.deliveryMode === 'test_redirect' ? 'test' : 'live',
        status: 'sent',
        to_address: action.channel === 'email' ? action.to_email : action.to_phone,
        from_address: process.env.EMAIL_FROM || null,
        subject: action.subject,
        body: action.body,
        provider: result.provider,
        provider_message_id: result.messageId || null,
        provider_response: null,
        metadata: null,
      });
    }

    return result;
  } catch (error) {
    logger.error('Channel dispatch failed', { channel, error: (error as Error).message });
    return { success: false, provider: channel, error: (error as Error).message };
  }
}

async function dispatchEmail(
  action: ScheduledEmail,
  options: { deliveryMode: string; redirect?: { email?: string; phone?: string } },
): Promise<DispatchResult> {
  let emailOptions: { to: string; subject: string; html: string; campaignId?: string } = {
    to: action.to_email || '',
    subject: action.subject || 'No Subject',
    html: action.body || '',
    ...(action.campaign_id ? { campaignId: action.campaign_id } : {}),
  };

  if (options.deliveryMode === 'test_redirect' && options.redirect?.email) {
    emailOptions = applyTestMode(emailOptions, options.redirect.email);
  }

  const result = await sendEmail(emailOptions);
  return { success: result.success, provider: result.provider, messageId: result.messageId, error: result.error };
}

async function dispatchVoice(action: ScheduledEmail): Promise<DispatchResult> {
  const result = await initiateCall({
    phone: action.to_phone || '',
    name: '', // Will be populated from lead data
    prompt: action.body || action.ai_instructions || '',
    agentType: (action.voice_agent_type as 'welcome' | 'interest') || 'interest',
  });
  return { success: result.success, provider: 'synthflow', messageId: result.callId, error: result.error };
}

async function dispatchSms(
  action: ScheduledEmail,
  options: { deliveryMode: string; redirect?: { email?: string; phone?: string } },
): Promise<DispatchResult> {
  const to = options.deliveryMode === 'test_redirect' && options.redirect?.phone
    ? options.redirect.phone
    : action.to_phone || '';

  const result = await sendSms({ to, body: action.body || '' });
  return { success: result.success, provider: 'ghl', messageId: result.messageId, error: result.error };
}
