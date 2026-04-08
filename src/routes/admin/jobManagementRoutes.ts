import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import {
  recordJobStart, recordJobComplete, recordJobFailure,
  listJobs, getJobById, getJobStats,
} from '../../services/jobManagementService';

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

export default router;
