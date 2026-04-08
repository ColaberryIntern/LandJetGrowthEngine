import { Op } from 'sequelize';
import { JobExecution, JobType, JobStatus, JOB_TYPES, JOB_STATUSES } from '../models/JobExecution';
import { ValidationError, NotFoundError } from '../middleware/errors';
import { logger } from '../config/logger';

export interface JobFilters {
  job_name?: string;
  job_type?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

/**
 * Record the start of a job execution.
 */
export async function recordJobStart(
  jobName: string,
  jobType: string,
  metadata?: object,
): Promise<JobExecution> {
  if (!jobName) throw new ValidationError('job_name is required');
  if (!JOB_TYPES.includes(jobType as JobType)) {
    throw new ValidationError(`Invalid job_type: ${jobType}. Valid: ${JOB_TYPES.join(', ')}`);
  }

  const job = await JobExecution.create({
    job_name: jobName,
    job_type: jobType as JobType,
    status: 'running',
    started_at: new Date(),
    metadata: metadata || null,
  });

  logger.info('Job started', { jobId: job.id, name: jobName, type: jobType });
  return job;
}

/**
 * Record successful completion of a job.
 */
export async function recordJobComplete(jobId: string, result?: object): Promise<JobExecution> {
  const job = await JobExecution.findByPk(jobId);
  if (!job) throw new NotFoundError('Job execution not found');

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - job.started_at.getTime();

  await job.update({
    status: 'completed',
    completed_at: completedAt,
    duration_ms: durationMs,
    result: result || null,
  });

  logger.info('Job completed', { jobId, name: job.job_name, durationMs });
  return job;
}

/**
 * Record job failure.
 */
export async function recordJobFailure(jobId: string, errorMessage: string): Promise<JobExecution> {
  const job = await JobExecution.findByPk(jobId);
  if (!job) throw new NotFoundError('Job execution not found');

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - job.started_at.getTime();

  await job.update({
    status: 'failed',
    completed_at: completedAt,
    duration_ms: durationMs,
    error_message: errorMessage,
  });

  logger.error('Job failed', { jobId, name: job.job_name, error: errorMessage });
  return job;
}

/**
 * List job executions with filters.
 */
export async function listJobs(filters: JobFilters) {
  const where: Record<string, unknown> = {};

  if (filters.job_name) where.job_name = filters.job_name;
  if (filters.job_type) where.job_type = filters.job_type;
  if (filters.status) where.status = filters.status;

  return JobExecution.findAndCountAll({
    where,
    order: [['started_at', 'DESC']],
    limit: filters.limit || 25,
    offset: filters.offset || 0,
  });
}

/**
 * Get job execution by ID.
 */
export async function getJobById(id: string): Promise<JobExecution> {
  const job = await JobExecution.findByPk(id);
  if (!job) throw new NotFoundError('Job execution not found');
  return job;
}

/**
 * Get aggregate stats for jobs.
 */
export async function getJobStats() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [total, running, completedToday, failedToday, recentFailures] = await Promise.all([
    JobExecution.count(),
    JobExecution.count({ where: { status: 'running' } }),
    JobExecution.count({ where: { status: 'completed', completed_at: { [Op.gte]: todayStart } } }),
    JobExecution.count({ where: { status: 'failed', completed_at: { [Op.gte]: todayStart } } }),
    JobExecution.findAll({
      where: { status: 'failed' },
      order: [['started_at', 'DESC']],
      limit: 5,
      attributes: ['id', 'job_name', 'job_type', 'error_message', 'started_at'],
    }),
  ]);

  // Average duration of completed jobs today
  const completedJobs = await JobExecution.findAll({
    where: { status: 'completed', completed_at: { [Op.gte]: todayStart }, duration_ms: { [Op.ne]: null } },
    attributes: ['duration_ms'],
    raw: true,
  }) as any[];

  const avgDurationMs = completedJobs.length > 0
    ? Math.round(completedJobs.reduce((sum: number, j: any) => sum + j.duration_ms, 0) / completedJobs.length)
    : 0;

  return {
    total,
    running,
    completed_today: completedToday,
    failed_today: failedToday,
    avg_duration_ms: avgDurationMs,
    recent_failures: recentFailures,
  };
}
