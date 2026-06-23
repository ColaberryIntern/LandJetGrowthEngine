/**
 * reservationFeedbackService.ts
 * The "tell us what's wrong and we fix it + learn" layer. Operators report issues
 * on a reservation (category + free text + optional one-click correction); the
 * structured part is applied automatically, and classification corrections become
 * learned rules the ingest classifier consults so the same mistake is not repeated.
 */
import { logger } from '../config/logger';
import { ReservationQuote, ReservationLifecycle } from '../models/ReservationQuote';
import { ReservationFeedback } from '../models/ReservationFeedback';
import { learnRule } from './reservationClassifierRules';
import { setReservationLifecycle, reprocessReservationFromThread } from './reservationQuoteService';

/** Reclassify a reservation as a quote / not a quote AND learn the rule. */
export async function reclassifyReservation(id: number, decision: 'quote' | 'not_quote', createdBy?: string): Promise<{ id: number; lifecycle: string }> {
  const rq = await ReservationQuote.findByPk(id);
  if (!rq) throw new Error('Reservation quote not found');
  const lifecycle: ReservationLifecycle = decision === 'not_quote' ? 'not_quote' : 'needs_reply';
  await setReservationLifecycle(id, lifecycle);
  await learnRule(rq.from_email, decision, 'reclassify');
  await ReservationFeedback.create({
    reservation_id: id, category: 'misclassified',
    comment: null, action: decision === 'not_quote' ? 'reclassify_not_quote' : 'reclassify_quote',
    created_by: createdBy || null,
  } as any);
  return { id, lifecycle };
}

export interface FeedbackInput {
  category: string;            // misclassified | wrong_price | wrong_route | wrong_trip | wrong_reply | wrong_status | other
  comment?: string;
  action?: string;            // reclassify_not_quote | reclassify_quote | set_lifecycle:<x> | re_extract
  createdBy?: string;
}

/**
 * Record operator feedback and apply any deterministic correction it carries.
 * Free text is always stored as training data. Returns what was applied.
 */
export async function submitFeedback(id: number, input: FeedbackInput): Promise<{ stored: true; applied: string | null }> {
  const rq = await ReservationQuote.findByPk(id);
  if (!rq) throw new Error('Reservation quote not found');

  let applied: string | null = null;
  const action = input.action || '';
  if (action === 'reclassify_not_quote') { await reclassifyReservation(id, 'not_quote', input.createdBy); applied = 'filed as Not a quote (and learned the sender rule)'; }
  else if (action === 'reclassify_quote') { await reclassifyReservation(id, 'quote', input.createdBy); applied = 'restored as a quote request (and learned the sender rule)'; }
  else if (action.startsWith('set_lifecycle:')) {
    const lc = action.split(':')[1] as ReservationLifecycle;
    if (['needs_reply', 'awaiting_customer', 'completed', 'booked', 'closed', 'not_quote'].includes(lc)) {
      await setReservationLifecycle(id, lc); applied = `status set to ${lc}`;
    }
  } else if (action === 're_extract') {
    const ok = await reprocessReservationFromThread(id); applied = ok ? 're-read the conversation and updated the trip/price' : 'no new details found in the conversation';
  }

  await ReservationFeedback.create({
    reservation_id: id, category: input.category, comment: input.comment || null,
    action: action || null, created_by: input.createdBy || null,
  } as any);
  logger.info('reservation feedback recorded', { id, category: input.category, action: action || null, applied });
  return { stored: true, applied };
}

export async function getReservationFeedback(id: number): Promise<ReservationFeedback[]> {
  return ReservationFeedback.findAll({ where: { reservation_id: id } as any, order: [['created_at', 'DESC']] });
}
