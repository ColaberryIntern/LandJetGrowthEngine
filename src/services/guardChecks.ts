import { ScheduledEmail } from '../models/ScheduledEmail';
import { Campaign } from '../models/Campaign';
import { SCHEDULER } from '../config/schedulerConstants';

export interface GuardResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check if the current time is within the send window for a channel.
 */
export function isInSendWindow(channel: string, now: Date = new Date()): GuardResult {
  // Get hours in CT (approximate - for production use a proper timezone library)
  const utcHour = now.getUTCHours();
  const ctOffset = -5; // CDT approximate
  const ctHour = (utcHour + ctOffset + 24) % 24;
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon...

  // Check if weekday
  if (!SCHEDULER.CALL_ACTIVE_DAYS.includes(dayOfWeek)) {
    return { allowed: false, reason: 'Outside business days (Mon-Fri)' };
  }

  if (channel === 'voice') {
    if (ctHour < SCHEDULER.CALL_WINDOW_START || ctHour >= SCHEDULER.CALL_WINDOW_END) {
      return { allowed: false, reason: `Voice calls only ${SCHEDULER.CALL_WINDOW_START}AM-${SCHEDULER.CALL_WINDOW_END}PM CT` };
    }
  } else {
    if (ctHour < SCHEDULER.SEND_WINDOW_START || ctHour >= SCHEDULER.SEND_WINDOW_END) {
      return { allowed: false, reason: `Sends only ${SCHEDULER.SEND_WINDOW_START}AM-${SCHEDULER.SEND_WINDOW_END}PM CT` };
    }
  }

  return { allowed: true };
}

/**
 * Check if campaign is active.
 */
export async function isCampaignActive(campaignId: string | null): Promise<GuardResult> {
  if (!campaignId) return { allowed: true };

  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign) return { allowed: false, reason: 'Campaign not found' };
  if (campaign.status !== 'active') {
    return { allowed: false, reason: `Campaign status is '${campaign.status}', not active` };
  }
  return { allowed: true };
}

/**
 * Check test safety - test actions can only target test domains.
 */
export function isTestSafe(action: ScheduledEmail): GuardResult {
  if (!action.is_test_action) return { allowed: true };

  const testDomain = process.env.CAMPAIGN_TEST_EMAIL_DOMAIN || 'test.landjet.com';

  if (action.channel === 'email' && action.to_email) {
    if (!action.to_email.endsWith(`@${testDomain}`)) {
      return { allowed: false, reason: 'Test action can only target test email domain' };
    }
  }

  return { allowed: true };
}

/**
 * Calculate pacing limit for current cycle.
 * Auto-calculate max sends per cycle based on remaining time window.
 */
export function calculatePacingLimit(
  pendingToday: number,
  hoursRemaining: number,
  cyclesPerHour: number = 12, // every 5 min
): number {
  if (hoursRemaining <= 0) return 0;
  return Math.max(1, Math.ceil((pendingToday / hoursRemaining) / cyclesPerHour));
}

/**
 * Interleave actions by campaign to prevent single campaign monopolization.
 * [A,A,A,B,B,B] -> [A,B,A,B,A,B]
 */
export function interleaveActions<T extends { campaign_id: string | null }>(actions: T[]): T[] {
  const byCampaign = new Map<string, T[]>();

  for (const action of actions) {
    const key = action.campaign_id || '__none__';
    if (!byCampaign.has(key)) byCampaign.set(key, []);
    byCampaign.get(key)!.push(action);
  }

  const result: T[] = [];
  const queues = Array.from(byCampaign.values());
  let maxLen = Math.max(0, ...queues.map(q => q.length));

  for (let i = 0; i < maxLen; i++) {
    for (const queue of queues) {
      if (i < queue.length) {
        result.push(queue[i]);
      }
    }
  }

  return result;
}
