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
      pipeline_stage: string; next_action: string | null; deal_amount: string | null;
      subject: string | null; body: string | null; day: string; booked: boolean;
    }>(
      `SELECT DISTINCT ON (cl.lead_id)
          l.id, TRIM(l.first_name || ' ' || l.last_name) AS name, l.email, l.company,
          l.pipeline_stage::text AS pipeline_stage, l.notes->>'next_action' AS next_action,
          l.notes->>'deal_amount' AS deal_amount,
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
        deal_amount: r.deal_amount ? Number(r.deal_amount) : null,
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
    const { pipeline_stage, next_action, deal_amount } = req.body as { pipeline_stage?: string; next_action?: string; deal_amount?: number | string | null };
    if (pipeline_stage !== undefined && !PIPELINE_STAGES.includes(pipeline_stage as any)) {
      throw new ValidationError(`Invalid pipeline_stage. Allowed: ${PIPELINE_STAGES.join(', ')}`);
    }
    let dealNum: number | null | undefined;
    if (deal_amount !== undefined) {
      if (deal_amount === null || deal_amount === '') dealNum = null;
      else {
        dealNum = Number(deal_amount);
        if (!Number.isFinite(dealNum) || dealNum < 0) throw new ValidationError('deal_amount must be a non-negative number');
      }
    }
    const lead = await Lead.findByPk(Number(req.params.leadId));
    if (!lead) throw new NotFoundError('Lead not found');

    const notes = { ...(lead.notes as Record<string, unknown> || {}) };
    if (pipeline_stage !== undefined) lead.pipeline_stage = pipeline_stage as any;
    if (next_action !== undefined) notes.next_action = String(next_action).slice(0, 500);
    if (dealNum !== undefined) { if (dealNum === null) delete notes.deal_amount; else notes.deal_amount = dealNum; }
    lead.notes = notes;
    await lead.save();

    res.json({
      responder: {
        id: lead.id,
        pipeline_stage: lead.pipeline_stage,
        next_action: notes.next_action || '',
        deal_amount: (notes.deal_amount as number) ?? null,
      },
    });
  } catch (error) { next(error); }
});

export default router;
