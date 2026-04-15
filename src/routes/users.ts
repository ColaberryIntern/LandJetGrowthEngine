import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { getUserById } from '../services/authService';
import { NotFoundError } from '../middleware/errors';
import { getLocalePreferences } from '../utils/formatLocale';

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

router.get('/me/profile', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await getUserById(req.user!.userId);
    if (!user) throw new NotFoundError('User not found');

    const requiredFields = ['email', 'first_name', 'last_name', 'role'];
    const optionalFields = ['last_login_at'];
    const allFields = [...requiredFields, ...optionalFields];

    const filled = allFields.filter(f => {
      const val = (user as any)[f];
      return val !== null && val !== undefined && val !== '';
    });
    const missing = allFields.filter(f => !filled.includes(f));
    const score = Math.round((filled.length / allFields.length) * 100);

    const locale = await getLocalePreferences();

    res.json({
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        status: user.status,
        last_login_at: user.last_login_at,
      },
      completeness: {
        score,
        filled,
        missing,
        is_complete: missing.length === 0,
      },
      locale,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
