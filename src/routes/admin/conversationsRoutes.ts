/**
 * Conversations / responder tracker (deal-tracking Phase 2).
 *
 * Lists the leads who replied to outreach (validated inbound) with their
 * tracked category tag, current pipeline stage, a free-text next action, and a
 * booking flag (requested a trip quote). Lets an operator move a responder
 * through the funnel (replied -> meeting_scheduled -> proposal_sent -> ...) and
 * record the next step -- the "track what happened" surface.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { QueryTypes } from 'sequelize';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { getSequelize } from '../../config/database';
import { Lead, PIPELINE_STAGES } from '../../models/Lead';
import { classifyReply } from '../../services/replyClassification';
import { ValidationError, NotFoundError } from '../../middleware/errors';

const router = Router();
router.use(authenticate);

router.get('/', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await getSequelize().query<{
      id: number; name: string; email: string; company: string | null;
      pipeline_stage: string; next_action: string | null;
      subject: string | null; body: string | null; day: string; booked: boolean;
    }>(
      `SELECT DISTINCT ON (cl.lead_id)
          l.id, TRIM(l.first_name || ' ' || l.last_name) AS name, l.email, l.company,
          l.pipeline_stage::text AS pipeline_stage, l.notes->>'next_action' AS next_action,
          cl.subject, cl.body, cl.created_at::date::text AS day,
          EXISTS (SELECT 1 FROM reservation_quotes rq WHERE LOWER(rq.from_email) = LOWER(l.email)) AS booked
       FROM communication_logs cl JOIN leads l ON l.id = cl.lead_id
       WHERE cl.direction = 'inbound'
       ORDER BY cl.lead_id, cl.created_at DESC`,
      { type: QueryTypes.SELECT },
    );
    const responders = rows.map((r) => {
      const tag = classifyReply(r.subject, r.body);
      return {
        id: r.id,
        name: r.name || '(unknown)',
        email: r.email,
        company: r.company,
        pipeline_stage: r.pipeline_stage,
        next_action: r.next_action || '',
        tag: tag.label,
        tone: tag.tone,
        booked: !!r.booked,
        last_reply_day: r.day,
      };
    });
    res.json({ responders, total: responders.length, stages: PIPELINE_STAGES });
  } catch (error) { next(error); }
});

router.patch('/:leadId', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { pipeline_stage, next_action } = req.body as { pipeline_stage?: string; next_action?: string };
    if (pipeline_stage !== undefined && !PIPELINE_STAGES.includes(pipeline_stage as any)) {
      throw new ValidationError(`Invalid pipeline_stage. Allowed: ${PIPELINE_STAGES.join(', ')}`);
    }
    const lead = await Lead.findByPk(Number(req.params.leadId));
    if (!lead) throw new NotFoundError('Lead not found');

    if (pipeline_stage !== undefined) lead.pipeline_stage = pipeline_stage as any;
    if (next_action !== undefined) {
      lead.notes = { ...(lead.notes as Record<string, unknown> || {}), next_action: String(next_action).slice(0, 500) };
    }
    await lead.save();

    res.json({
      responder: {
        id: lead.id,
        pipeline_stage: lead.pipeline_stage,
        next_action: (lead.notes as any)?.next_action || '',
      },
    });
  } catch (error) { next(error); }
});

export default router;
