import { Notification } from '../models/Notification';
import { ValidationError, NotFoundError } from '../middleware/errors';

export interface CreateNotificationInput {
  user_id: string;
  type: 'email' | 'in_app';
  channel?: string;
  subject: string;
  body: string;
  metadata?: object | null;
}

export async function createNotification(input: CreateNotificationInput) {
  if (!input.user_id || !input.subject || !input.body || !input.type) {
    throw new ValidationError('user_id, type, subject, and body are required');
  }

  return Notification.create({
    user_id: input.user_id,
    type: input.type,
    channel: input.channel || 'system',
    subject: input.subject,
    body: input.body,
    status: input.type === 'in_app' ? 'sent' : 'pending',
    metadata: input.metadata || null,
  });
}

export async function listNotifications(
  userId: string,
  filters: { status?: string; limit?: number; offset?: number } = {},
) {
  const where: Record<string, unknown> = { user_id: userId };
  if (filters.status) where.status = filters.status;

  return Notification.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit: filters.limit || 25,
    offset: filters.offset || 0,
  });
}

export async function markAsRead(notificationId: string, userId: string) {
  const notification = await Notification.findOne({
    where: { id: notificationId, user_id: userId },
  });

  if (!notification) throw new NotFoundError('Notification not found');

  await notification.update({ status: 'read', read_at: new Date() });
  return notification;
}

export async function getUnreadCount(userId: string): Promise<number> {
  return Notification.count({
    where: { user_id: userId, status: { $ne: 'read' } as any },
  });
}
