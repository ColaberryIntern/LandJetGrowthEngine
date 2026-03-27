import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { getUserById } from '../services/authService';
import { NotFoundError } from '../middleware/errors';

const router = Router();

router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await getUserById(req.user!.userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

export default router;
