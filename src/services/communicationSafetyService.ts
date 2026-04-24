import { Op } from 'sequelize';
import { Unsubscribe } from '../models/Unsubscribe';
import { DncList } from '../models/DncList';
import { CommunicationLog } from '../models/CommunicationLog';
import { Campaign } from '../models/Campaign';
import { recordAgentRun } from '../intelligence/agents/agentRegistry';

export interface SafetyEvaluation {
  allowed: boolean;
  blockedReason?: string;
  deliveryMode: 'production' | 'test_redirect';
  redirect?: { email?: string; phone?: string };
}

export interface SafetyInput {
  leadId: number;
  leadEmail: string;
  leadPhone?: string | null;
  campaignId?: string | null;
  channel: 'email' | 'sms' | 'voice';
  isTestAction?: boolean;
}

const MAX_EMAILS_PER_DAY_PER_LEAD = 2;

/**
 * Evaluate whether a communication can be sent per Blueprint Section 18.
 * Checks: unsubscribe, DNC, hard bounce, rate limit, test mode, domain validation.
 */
export async function evaluateSend(input: SafetyInput): Promise<SafetyEvaluation> {
  // 1. Check unsubscribe list
  if (input.leadEmail) {
    const unsub = await Unsubscribe.findOne({ where: { email: input.leadEmail.toLowerCase() } });
    if (unsub) {
      recordAgentRun('communication_safety', { leadId: input.leadId, channel: input.channel, allowed: false, reason: 'unsubscribed' }).catch(() => {});
      return { allowed: false, blockedReason: 'Lead is unsubscribed', deliveryMode: 'production' };
    }
  }

  // 2. Check Do-Not-Contact list
  const dncWhere: any[] = [];
  if (input.leadEmail) dncWhere.push({ email: input.leadEmail.toLowerCase() });
  if (input.leadPhone) dncWhere.push({ phone: input.leadPhone });

  if (dncWhere.length > 0) {
    const dnc = await DncList.findOne({ where: { [Op.or]: dncWhere } });
    if (dnc) {
      recordAgentRun('communication_safety', { leadId: input.leadId, channel: input.channel, allowed: false, reason: 'dnc' }).catch(() => {});
      return { allowed: false, blockedReason: 'Lead is on Do-Not-Contact list', deliveryMode: 'production' };
    }
  }

  // 3. Check hard bounce (from communication_logs)
  if (input.leadEmail && input.channel === 'email') {
    const hardBounce = await CommunicationLog.findOne({
      where: {
        lead_id: input.leadId,
        channel: 'email',
        status: 'bounced',
      },
    });
    if (hardBounce) {
      recordAgentRun('communication_safety', { leadId: input.leadId, channel: input.channel, allowed: false, reason: 'hard_bounce' }).catch(() => {});
      return { allowed: false, blockedReason: 'Lead has hard bounced - never retry', deliveryMode: 'production' };
    }
  }

  // 4. Rate limiting (max 2 emails/day per lead)
  if (input.channel === 'email') {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const sentToday = await CommunicationLog.count({
      where: {
        lead_id: input.leadId,
        channel: 'email',
        status: { [Op.in]: ['sent', 'delivered'] },
        created_at: { [Op.gte]: todayStart },
      },
    });

    if (sentToday >= MAX_EMAILS_PER_DAY_PER_LEAD) {
      recordAgentRun('communication_safety', { leadId: input.leadId, channel: input.channel, allowed: false, reason: 'rate_limit' }).catch(() => {});
      return { allowed: false, blockedReason: `Rate limit: max ${MAX_EMAILS_PER_DAY_PER_LEAD} emails/day per lead`, deliveryMode: 'production' };
    }
  }

  // 5. Test mode handling
  let deliveryMode: 'production' | 'test_redirect' = 'production';
  let redirect: { email?: string; phone?: string } | undefined;

  if (input.campaignId) {
    const campaign = await Campaign.findByPk(input.campaignId);
    if (campaign?.settings?.test_mode_enabled) {
      deliveryMode = 'test_redirect';
      redirect = {
        email: campaign.settings.test_email,
        phone: campaign.settings.test_phone,
      };
    }
  }

  // 6. Test action domain validation
  if (input.isTestAction && deliveryMode !== 'test_redirect') {
    const testDomain = process.env.CAMPAIGN_TEST_EMAIL_DOMAIN || 'test.landjet.com';
    if (input.leadEmail && !input.leadEmail.endsWith(`@${testDomain}`)) {
      return { allowed: false, blockedReason: 'Test actions can only target test domains', deliveryMode: 'production' };
    }
  }

  recordAgentRun('communication_safety', { leadId: input.leadId, channel: input.channel, allowed: true, deliveryMode }).catch(() => {});
  return { allowed: true, deliveryMode, redirect };
}
