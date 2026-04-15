import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import {
  recordJobStart, recordJobComplete, recordJobFailure,
  listJobs, getJobById, getJobStats, retryJob,
} from '../../services/jobManagementService';
import { createAuditLog } from '../../services/auditLogService';
import { getLocalePreferences, updateLocalePreferences, validateLocale, validateTimezone } from '../../utils/formatLocale';

const router = Router();
router.use(authenticate);

router.get('/stats', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await getJobStats();
    res.json(stats);
  } catch (error) { next(error); }
});

router.get('/', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await listJobs({
      job_name: req.query.job_name as string,
      job_type: req.query.job_type as string,
      status: req.query.status as string,
      limit: req.query.limit ? Number(req.query.limit) : 25,
      offset: req.query.offset ? Number(req.query.offset) : 0,
    });
    res.json({ jobs: result.rows, total: result.count });
  } catch (error) { next(error); }
});

router.get('/:id', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await getJobById(req.params.id as string);
    res.json({ job });
  } catch (error) { next(error); }
});

router.post('/', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { job_name, job_type, metadata } = req.body;
    const job = await recordJobStart(job_name, job_type, metadata);
    res.status(201).json({ job });
  } catch (error) { next(error); }
});

router.patch('/:id/complete', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await recordJobComplete(req.params.id as string, req.body.result);
    res.json({ job });
  } catch (error) { next(error); }
});

router.patch('/:id/fail', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await recordJobFailure(req.params.id as string, req.body.error_message || 'Unknown error');
    res.json({ job });
  } catch (error) { next(error); }
});

// --- Locale Settings ---

router.get('/locale/settings', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const prefs = await getLocalePreferences();
    res.json(prefs);
  } catch (error) { next(error); }
});

router.post('/locale/settings', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { locale, timezone, currency, date_format } = req.body;
    if (locale && !validateLocale(locale)) {
      return res.status(400).json({ error: `Invalid locale: ${locale}` });
    }
    if (timezone && !validateTimezone(timezone)) {
      return res.status(400).json({ error: `Invalid timezone: ${timezone}` });
    }
    const prefs = await updateLocalePreferences({ locale, timezone, currency, date_format });
    res.json(prefs);
  } catch (error) { next(error); }
});

// --- Job Retry ---

router.post('/:id/retry', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await retryJob(req.params.id as string);
    await createAuditLog({
      userId: req.user!.userId,
      action: 'job.retry',
      entityType: 'job_execution',
      entityId: job.id,
      newValue: { retried_from: req.params.id, job_name: job.job_name },
      ipAddress: req.ip || null,
    });
    res.status(201).json({ job });
  } catch (error) { next(error); }
});

export default router;
