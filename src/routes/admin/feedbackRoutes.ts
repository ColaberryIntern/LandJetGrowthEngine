import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import {
  submitFeedback, listFeedback, respondToFeedback, getFeedbackStats,
  setConsent, getUserConsents, getConsentStats,
} from '../../services/feedbackService';
import { createAuditLog } from '../../services/auditLogService';

const router = Router();
router.use(authenticate);

// Feedback
router.get('/stats', authorize('campaigns:read'), async (_req, res, next) => {
  try { res.json(await getFeedbackStats()); } catch (e) { next(e); }
});
router.get('/', authorize('campaigns:read'), async (req, res, next) => {
  try {
    const r = await listFeedback({ type: req.query.type as string, status: req.query.status as string, limit: req.query.limit ? Number(req.query.limit) : 25, offset: req.query.offset ? Number(req.query.offset) : 0 });
    res.json({ feedback: r.rows, total: r.count });
  } catch (e) { next(e); }
});
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fb = await submitFeedback({ ...req.body, user_id: req.user!.userId });
    res.status(201).json({ feedback: fb });
  } catch (e) { next(e); }
});
router.patch('/:id/respond', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fb = await respondToFeedback(req.params.id as string, req.body.response, req.body.status || 'reviewed');
    await createAuditLog({ userId: req.user!.userId, action: 'feedback.respond', entityType: 'user_feedback', entityId: fb.id, newValue: { status: req.body.status }, ipAddress: req.ip || null });
    res.json({ feedback: fb });
  } catch (e) { next(e); }
});

// Consent Management
router.get('/consents/stats', authorize('campaigns:read'), async (_req, res, next) => {
  try { res.json(await getConsentStats()); } catch (e) { next(e); }
});
router.get('/consents/:userId', authorize('campaigns:read'), async (req, res, next) => {
  try { res.json({ consents: await getUserConsents(req.params.userId as string) }); } catch (e) { next(e); }
});
router.post('/consents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const consent = await setConsent(req.user!.userId, req.body.consent_type, req.body.granted, req.ip || undefined);
    res.json({ consent });
  } catch (e) { next(e); }
});

export default router;
