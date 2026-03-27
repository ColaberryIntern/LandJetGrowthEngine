import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import {
  createNotification,
  listNotifications,
  markAsRead,
} from '../services/notificationService';

const router = Router();

router.use(authenticate);

// Admin can create notifications for any user
router.post('/', authorize('notifications:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notification = await createNotification(req.body);
    res.status(201).json({ notification });
  } catch (error) {
    next(error);
  }
});

// Users see their own notifications
router.get('/', authorize('notifications:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await listNotifications(req.user!.userId, {
      status: req.query.status as string,
      limit: req.query.limit ? Number(req.query.limit) : 25,
      offset: req.query.offset ? Number(req.query.offset) : 0,
    });

    res.json({
      notifications: result.rows,
      total: result.count,
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/read', authorize('notifications:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notification = await markAsRead(req.params.id as string, req.user!.userId);
    res.json({ notification });
  } catch (error) {
    next(error);
  }
});

export default router;
