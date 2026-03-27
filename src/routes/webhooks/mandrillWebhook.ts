import { Router, Request, Response, NextFunction } from 'express';
import { InteractionOutcome } from '../../models/InteractionOutcome';
import { CommunicationLog } from '../../models/CommunicationLog';
import { Unsubscribe } from '../../models/Unsubscribe';
import { logger } from '../../config/logger';

const router = Router();

interface MandrillEvent {
  event: string;
  msg: {
    _id: string;
    email: string;
    subject: string;
    tags: string[];
    metadata?: Record<string, string>;
  };
  ts: number;
}

const EVENT_OUTCOME_MAP: Record<string, string> = {
  send: 'sent',
  open: 'opened',
  click: 'clicked',
  hard_bounce: 'bounced',
  soft_bounce: 'bounced',
  reject: 'bounced',
  unsub: 'unsubscribed',
};

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let events: MandrillEvent[] = [];

    // Mandrill sends events as form-encoded JSON in 'mandrill_events' field
    if (req.body.mandrill_events) {
      events = JSON.parse(req.body.mandrill_events);
    } else if (Array.isArray(req.body)) {
      events = req.body;
    }

    for (const event of events) {
      const outcome = EVENT_OUTCOME_MAP[event.event];
      if (!outcome) continue;

      const campaignId = event.msg.tags?.[0] || null;
      const leadId = event.msg.metadata?.lead_id ? parseInt(event.msg.metadata.lead_id) : null;

      // Update communication log status
      if (event.msg._id) {
        await CommunicationLog.update(
          { status: outcome as any },
          { where: { provider_message_id: event.msg._id } },
        );
      }

      // Create interaction outcome if we have a lead_id
      if (leadId) {
        await InteractionOutcome.create({
          lead_id: leadId,
          campaign_id: campaignId,
          scheduled_email_id: null,
          channel: 'email',
          step_index: 0,
          outcome: outcome as any,
          lead_industry: null,
          lead_title_category: null,
          lead_company_size_bucket: null,
          lead_source_type: null,
          metadata: { mandrill_event: event.event, mandrill_id: event.msg._id },
        });
      }

      // Auto-add to unsubscribe list on unsub event
      if (event.event === 'unsub' && event.msg.email) {
        await Unsubscribe.findOrCreate({
          where: { email: event.msg.email.toLowerCase() },
          defaults: {
            email: event.msg.email.toLowerCase(),
            reason: 'Mandrill unsubscribe webhook',
            source: 'mandrill',
          },
        });
      }

      logger.info('Mandrill webhook processed', {
        event: event.event,
        email: event.msg.email,
        outcome,
      });
    }

    res.status(200).json({ received: events.length });
  } catch (error) {
    logger.error('Mandrill webhook error', { error: (error as Error).message });
    next(error);
  }
});

// Mandrill sends HEAD request to verify webhook URL
router.head('/', (_req: Request, res: Response) => {
  res.status(200).end();
});

export default router;
