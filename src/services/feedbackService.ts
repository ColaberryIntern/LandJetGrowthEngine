import { Op } from 'sequelize';
import { UserFeedback, FEEDBACK_TYPES } from '../models/UserFeedback';
import { UserConsent, CONSENT_TYPES } from '../models/UserConsent';
import { ValidationError, NotFoundError } from '../middleware/errors';
import { logger } from '../config/logger';

// --- Feedback ---

export async function submitFeedback(input: {
  user_id?: string; type: string; subject: string; body: string;
  rating?: number; page_context?: string;
}) {
  if (!input.subject?.trim() || !input.body?.trim()) throw new ValidationError('subject and body required');
  if (!FEEDBACK_TYPES.includes(input.type as any)) throw new ValidationError(`Invalid type. Valid: ${FEEDBACK_TYPES.join(', ')}`);

  return UserFeedback.create({
    user_id: input.user_id || null, type: input.type as any, status: 'submitted',
    subject: input.subject.trim(), body: input.body.trim(),
    rating: input.rating || null, page_context: input.page_context || null, metadata: null,
  });
}

export async function listFeedback(filters: { type?: string; status?: string; limit?: number; offset?: number }) {
  const where: Record<string, unknown> = {};
  if (filters.type) where.type = filters.type;
  if (filters.status) where.status = filters.status;
  return UserFeedback.findAndCountAll({
    where, order: [['created_at', 'DESC']], limit: filters.limit || 25, offset: filters.offset || 0,
  });
}

export async function respondToFeedback(id: string, response: string, newStatus: string) {
  const fb = await UserFeedback.findByPk(id);
  if (!fb) throw new NotFoundError('Feedback not found');
  const data: any = { response, status: newStatus };
  if (newStatus === 'resolved') data.resolved_at = new Date();
  await fb.update(data);
  return fb;
}

export async function getFeedbackStats() {
  const [total, submitted, resolved, avgRating] = await Promise.all([
    UserFeedback.count(),
    UserFeedback.count({ where: { status: 'submitted' } }),
    UserFeedback.count({ where: { status: 'resolved' } }),
    UserFeedback.findOne({
      attributes: [[UserFeedback.sequelize!.fn('AVG', UserFeedback.sequelize!.col('rating')), 'avg']],
      where: { rating: { [Op.ne]: null } }, raw: true,
    }),
  ]);
  return { total, pending: submitted, resolved, avg_rating: Math.round(((avgRating as any)?.avg || 0) * 10) / 10 };
}

// --- Unexpected Engagement Logging ---

export async function logUnexpectedEngagement(input: {
  user_id?: string;
  description: string;
  page_context?: string;
  metadata?: object;
}) {
  if (!input.description?.trim()) throw new ValidationError('description is required');

  return UserFeedback.create({
    user_id: input.user_id || null,
    type: 'general' as any,
    status: 'submitted',
    subject: 'Unexpected user engagement',
    body: input.description.trim(),
    rating: null,
    page_context: input.page_context || null,
    metadata: { engagement_type: 'unexpected_behavior', ...(input.metadata || {}) },
  });
}

// --- Consent Management (GDPR/CCPA) ---

export async function setConsent(userId: string, consentType: string, granted: boolean, ipAddress?: string) {
  if (!CONSENT_TYPES.includes(consentType as any)) throw new ValidationError(`Invalid consent type. Valid: ${CONSENT_TYPES.join(', ')}`);

  const [consent, created] = await UserConsent.findOrCreate({
    where: { user_id: userId, consent_type: consentType as any },
    defaults: {
      user_id: userId, consent_type: consentType as any, granted,
      granted_at: granted ? new Date() : null, ip_address: ipAddress || null,
    },
  });

  if (!created) {
    await consent.update({
      granted,
      granted_at: granted ? new Date() : consent.granted_at,
      revoked_at: !granted ? new Date() : null,
      ip_address: ipAddress || consent.ip_address,
    });
  }

  logger.info('Consent updated', { userId, consentType, granted });
  return consent;
}

export async function getUserConsents(userId: string) {
  return UserConsent.findAll({ where: { user_id: userId }, order: [['consent_type', 'ASC']] });
}

export async function getConsentStats() {
  const stats: Record<string, { granted: number; revoked: number }> = {};
  for (const type of CONSENT_TYPES) {
    const [granted, revoked] = await Promise.all([
      UserConsent.count({ where: { consent_type: type, granted: true } }),
      UserConsent.count({ where: { consent_type: type, granted: false } }),
    ]);
    stats[type] = { granted, revoked };
  }
  return stats;
}
