import { Op } from 'sequelize';
import { Notification } from '../models/Notification';
import { ValidationError, NotFoundError } from '../middleware/errors';
import { logger } from '../config/logger';

export interface CreateNotificationInput {
  user_id: string;
  type: 'email' | 'in_app';
  channel?: string;
  subject: string;
  body: string;
  metadata?: object | null;
}

export async function createNotification(input: CreateNotificationInput) {
  if (!input.user_id) throw new ValidationError('user_id is required');
  if (!input.type) throw new ValidationError('type is required');
  if (!input.subject?.trim()) throw new ValidationError('subject is required');
  if (!input.body?.trim()) throw new ValidationError('body is required');
  if (!['email', 'in_app'].includes(input.type)) {
    throw new ValidationError('type must be "email" or "in_app"');
  }

  try {
    const notification = await Notification.create({
      user_id: input.user_id,
      type: input.type,
      channel: input.channel || 'system',
      subject: input.subject.trim(),
      body: input.body.trim(),
      status: input.type === 'in_app' ? 'sent' : 'pending',
      metadata: input.metadata || null,
    });
    logger.info('Notification created', { id: notification.id, userId: input.user_id, type: input.type });
    return notification;
  } catch (error) {
    logger.error('Failed to create notification', { userId: input.user_id, error: (error as Error).message });
    throw error;
  }
}

export async function listNotifications(
  userId: string,
  filters: { status?: string; limit?: number; offset?: number } = {},
) {
  if (!userId) throw new ValidationError('userId is required');

  const where: Record<string, unknown> = { user_id: userId };
  if (filters.status) where.status = filters.status;

  const limit = Math.min(Math.max(filters.limit || 25, 1), 100);
  const offset = Math.max(filters.offset || 0, 0);

  return Notification.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit,
    offset,
  });
}

export async function markAsRead(notificationId: string, userId: string) {
  if (!notificationId) throw new ValidationError('notificationId is required');
  if (!userId) throw new ValidationError('userId is required');

  const notification = await Notification.findOne({
    where: { id: notificationId, user_id: userId },
  });

  if (!notification) throw new NotFoundError('Notification not found');

  if (notification.status === 'read') return notification;

  try {
    await notification.update({ status: 'read', read_at: new Date() });
    return notification;
  } catch (error) {
    logger.error('Failed to mark notification as read', { notificationId, error: (error as Error).message });
    throw error;
  }
}

export async function getUnreadCount(userId: string): Promise<number> {
  if (!userId) return 0;

  try {
    return await Notification.count({
      where: { user_id: userId, status: { [Op.ne]: 'read' } },
    });
  } catch (error) {
    logger.error('Failed to get unread count', { userId, error: (error as Error).message });
    return 0;
  }
}
