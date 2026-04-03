import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { getAuthUrl, handleAuthCallback } from '../../services/gmailService';
import { ingestEmails, processEmails, runPipeline } from '../../services/communicationOrchestratorService';
import { EmailThread } from '../../models/EmailThread';
import { TopicThreadMap } from '../../models/TopicThreadMap';
import { CommunicationFeedback } from '../../models/CommunicationFeedback';
import { generateDailySummary } from '../../services/dailySummaryService';
import { getFeedbackStats, getStalledTopics, getRecurringTopics } from '../../services/communicationFeedbackService';
import { logger } from '../../config/logger';

const router = Router();

// --- Gmail OAuth (callback must be unauthenticated) ---

router.get('/gmail/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const code = req.query.code as string;
    if (!code) {
      return res.status(400).json({ error: 'Missing authorization code' });
    }
    const result = await handleAuthCallback(code);
    res.json({
      message: 'Gmail OAuth successful. Save the refresh token to your .env file as GMAIL_REFRESH_TOKEN.',
      refresh_token: result.refresh_token,
    });
  } catch (error) { next(error); }
});

// All remaining routes require authentication
router.use(authenticate);

// --- Gmail OAuth ---

router.get('/gmail/auth', authorize('campaigns:write'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const url = getAuthUrl();
    res.json({ auth_url: url });
  } catch (error) { next(error); }
});

// --- Pipeline Operations ---

router.post('/ingest', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lookbackHours = req.query.lookback_hours ? Number(req.query.lookback_hours) : 24;
    const result = await ingestEmails(lookbackHours);
    res.json(result);
  } catch (error) { next(error); }
});

router.post('/process', authorize('campaigns:write'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await processEmails();
    res.json(result);
  } catch (error) { next(error); }
});

router.post('/run', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lookbackHours = req.query.lookback_hours ? Number(req.query.lookback_hours) : 24;
    const result = await runPipeline(lookbackHours);
    res.json(result);
  } catch (error) { next(error); }
});

// --- Threads ---

router.get('/threads', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 25;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    const where: any = {};
    if (req.query.processed !== undefined) where.processed = req.query.processed === 'true';
    if (req.query.skipped !== undefined) where.skipped = req.query.skipped === 'true';

    const result = await EmailThread.findAndCountAll({
      where,
      limit,
      offset,
      order: [['received_at', 'DESC']],
    });

    res.json({ threads: result.rows, total: result.count });
  } catch (error) { next(error); }
});

router.get('/threads/:id', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const thread = await EmailThread.findByPk(req.params.id as string);
    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    const mapping = await TopicThreadMap.findOne({
      where: { gmail_thread_id: thread.gmail_thread_id },
      include: [{ model: CommunicationFeedback, as: 'feedback' }],
    });

    // Get all emails in this Gmail thread
    const relatedEmails = await EmailThread.findAll({
      where: { gmail_thread_id: thread.gmail_thread_id },
      order: [['received_at', 'ASC']],
    });

    res.json({ thread, mapping, related_emails: relatedEmails });
  } catch (error) { next(error); }
});

// --- Summary & Feedback ---

router.get('/summary', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const date = req.query.date ? new Date(req.query.date as string) : undefined;
    const summary = await generateDailySummary(date);
    res.json(summary);
  } catch (error) { next(error); }
});

router.get('/feedback', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await getFeedbackStats();
    const stalled = await getStalledTopics();
    const recurring = await getRecurringTopics();
    res.json({ stats, stalled, recurring });
  } catch (error) { next(error); }
});

export default router;
