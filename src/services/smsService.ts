import { logger } from '../config/logger';
import { SystemSetting } from '../models/SystemSetting';

export interface SmsOptions {
  to: string;
  body: string;
}

export interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

const SMS_RAMP_LEVELS: Record<number, number> = {
  1: 100, 2: 250, 3: 500, 4: 750,
  5: 1500, 6: 2250, 7: 3000, 8: Infinity,
};

/**
 * Clean SMS content per Blueprint Section 7 rules:
 * - Max 160 chars, no "Reply STOP", no AI agent names, plain text only.
 */
export function cleanSmsContent(body: string): string {
  let cleaned = body
    .replace(/Reply STOP[^.]*\.?/gi, '')
    .replace(/\bCory\b/gi, '')
    .replace(/\bAI Assistant\b/gi, '')
    .replace(/<[^>]+>/g, '')       // strip HTML
    .replace(/\s+/g, ' ')          // normalize whitespace
    .trim();

  if (cleaned.length > 160) {
    cleaned = cleaned.substring(0, 157) + '...';
  }

  return cleaned;
}

/**
 * Get current SMS ramp level and daily limit.
 */
export async function getSmsRampLevel(): Promise<{ level: number; dailyLimit: number }> {
  try {
    const setting = await SystemSetting.findByPk('ghl_sms_level');
    const level = setting ? (setting.value as any).level || 1 : 1;
    return { level, dailyLimit: SMS_RAMP_LEVELS[level] || 100 };
  } catch {
    return { level: 1, dailyLimit: 100 };
  }
}

/**
 * Send SMS via GoHighLevel API.
 */
export async function sendSms(options: SmsOptions): Promise<SmsResult> {
  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'GHL_API_KEY not configured' };
  }

  const cleanedBody = cleanSmsContent(options.body);

  try {
    const response = await fetch('https://rest.gohighlevel.com/v1/custom-values/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ type: 'sms', phone: options.to, message: cleanedBody }),
    });

    if (!response.ok) {
      return { success: false, error: `GHL API error: ${response.status}` };
    }

    const data = (await response.json()) as Record<string, any>;
    logger.info('SMS sent via GHL', { to: options.to, length: cleanedBody.length });
    return { success: true, messageId: data.id };
  } catch (error) {
    logger.error('SMS send failed', { error: (error as Error).message });
    return { success: false, error: (error as Error).message };
  }
}
