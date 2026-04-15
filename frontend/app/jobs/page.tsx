'use client';

import { useState, useEffect } from 'react';
import { getHealth, getJobStats, getJobs, retryJob, type JobExecution, type JobStats } from '@/lib/api';

interface HealthData {
  status: string;
  db: string;
  timestamp: string;
  uptime: number;
  environment: string;
}

const SCHEDULED_JOBS = [
  { name: 'Scheduler Engine', schedule: 'Every 5 min', description: 'Claims and processes pending/approved actions', maxPerCycle: 40, details: 'Processes up to 40 actions per cycle with round-robin per-campaign enforcement. Validates send window, campaign status, and DNC lists before dispatching.' },
  { name: 'Draft Generation', schedule: 'Daily (9 AM CT)', description: 'AI generates and polishes CEO intro drafts', maxPerCycle: null, details: 'Uses OpenAI GPT-4o to generate personalized outreach emails. Applies The Polisher agent for grammar, readability, and CTA validation.' },
  { name: 'Health Scanner', schedule: 'Every 15 min', description: 'Computes campaign health scores (0-100)', maxPerCycle: null, details: 'Evaluates open rate, reply rate, bounce rate, error count, and AI generation success. Scores: 80+ healthy, 60-79 degraded, <60 critical.' },
  { name: 'Self-Healing', schedule: 'Every 30 min', description: 'Retries failed actions from last 6 hours', maxPerCycle: 50, details: 'Finds failed scheduled emails within retry limit and reschedules them with a 5-minute delay. Skips actions that have exceeded max attempts.' },
  { name: 'Repair Agent', schedule: 'Every 20 min', description: 'Email retry, voice fallback, bounce cleanup', maxPerCycle: 20, details: 'Three repair strategies: (1) Reset failed emails for retry, (2) Create email fallback for failed voice calls, (3) Remove bounced leads from active campaigns.' },
  { name: 'QA Agent', schedule: 'Every 15 min (weekdays)', description: 'Validates sequences, lead data, send simulation', maxPerCycle: null, details: 'Checks each active campaign for: linked sequence, AI instructions on each step, channel configuration. Updates campaign qa_status field.' },
  { name: 'Engagement Agent', schedule: 'Every 4 hours', description: 'Analyzes lead engagement signals', maxPerCycle: null, details: 'Classifies leads as cold/warming/hot/active based on opens, clicks, replies. Creates notifications for high-priority leads (score >= 70).' },
  { name: 'Model Management', schedule: 'Daily', description: 'Monitors AI model performance and token usage', maxPerCycle: null, details: 'Evaluates AI model health, token efficiency, and success rates. Flags models with >1500 tokens/call as excessive or <80% success as critical.' },
];

const SCHEDULER_CONFIG = [
  { key: 'Cycle Interval', value: '5 minutes' },
  { key: 'Max Actions / Cycle', value: '40' },
  { key: 'Max Actions / Campaign', value: '10' },
  { key: 'Send Window', value: '8 AM - 5 PM CT' },
  { key: 'Call Window', value: '9 AM - 5 PM CT' },
  { key: 'Active Days', value: 'Mon - Fri' },
  { key: 'Max Daily Calls', value: '50' },
  { key: 'Retry Delay', value: '30 minutes' },
  { key: 'Stale Threshold', value: '10 minutes' },
  { key: 'Rate Limit', value: '2 emails / day / lead' },
];

const JOB_STATUS_COLORS: Record<string, string> = {
  running: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

const STAT_CARD_COLORS: Record<string, { border: string; bg: string }> = {
  scheduler: { border: 'border-emerald-200', bg: 'bg-emerald-50' },
  running: { border: 'border-blue-200', bg: 'bg-blue-50' },
  completed: { border: 'border-emerald-200', bg: 'bg-emerald-50' },
  failed: { border: 'border-red-200', bg: 'bg-red-50' },
  uptime: { border: 'border-gray-200', bg: 'bg-white' },
};

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function JobsPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [stats, setStats] = useState<JobStats | null>(null);
  const [executions, setExecutions] = useState<JobExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  async function fetchAll() {
    try {
      const filters: any = { limit: 25 };
      if (statusFilter) filters.status = statusFilter;
      const [h, s, j] = await Promise.allSettled([
        getHealth(),
        getJobStats(),
        getJobs(filters),
      ]);
      if (h.status === 'fulfilled') setHealth(h.value as HealthData);
      if (s.status === 'fulfilled') setStats(s.value);
      if (j.status === 'fulfilled') {
        let jobs = (j.value as any).jobs || [];
        if (typeFilter) jobs = jobs.filter((job: JobExecution) => job.job_type === typeFilter);
        setExecutions(jobs);
      }
    } catch {}
    setLoading(false);
  }

  useEffect(() => { fetchAll(); }, [statusFilter, typeFilter]);

  async function handleRetry(jobId: string) {
    setRetrying(jobId);
    try {
      await retryJob(jobId);
      await fetchAll();
    } catch {}
    setRetrying(null);
  }

  const isUp = health?.status === 'ok';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Job Management</h1>
          <p className="mt-1 text-sm text-gray-500">Background jobs, scheduled agents, and system configuration</p>
        </div>
        <button
          onClick={() => { setLoading(true); fetchAll(); }}
          disabled={loading}
          className="self-start rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 sm:self-auto"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Loading indicator */}
      {loading && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <span className="text-sm text-blue-700">Loading job data...</span>
        </div>
      )}

      {/* Stats Cards - responsive grid */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <div className={`rounded-lg border ${STAT_CARD_COLORS.scheduler.border} ${STAT_CARD_COLORS.scheduler.bg} p-4`}>
          <div className="flex items-center gap-2">
            <div className={`h-2.5 w-2.5 rounded-full ${isUp ? 'bg-emerald-500' : 'bg-gray-300'}`} />
            <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Scheduler</p>
          </div>
          <p className="mt-2 text-2xl font-bold text-gray-900">5 min</p>
          <p className="text-xs text-gray-500">cycle interval</p>
        </div>
        <div className={`rounded-lg border ${STAT_CARD_COLORS.running.border} ${STAT_CARD_COLORS.running.bg} p-4`}>
          <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Running</p>
          <p className="mt-2 text-2xl font-bold text-blue-700">{stats?.running ?? '-'}</p>
          <p className="text-xs text-gray-500">active jobs</p>
        </div>
        <div className={`rounded-lg border ${STAT_CARD_COLORS.completed.border} ${STAT_CARD_COLORS.completed.bg} p-4`}>
          <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Completed</p>
          <p className="mt-2 text-2xl font-bold text-emerald-700">{stats?.completed_today ?? '-'}</p>
          <p className="text-xs text-gray-500">today</p>
        </div>
        <div className={`rounded-lg border ${STAT_CARD_COLORS.failed.border} ${STAT_CARD_COLORS.failed.bg} p-4`}>
          <p className="text-xs font-medium text-red-600 uppercase tracking-wide">Failed</p>
          <p className={`mt-2 text-2xl font-bold ${(stats?.failed_today ?? 0) > 0 ? 'text-red-700' : 'text-gray-900'}`}>
            {stats?.failed_today ?? '-'}
          </p>
          <p className="text-xs text-gray-500">need attention</p>
        </div>
        <div className={`rounded-lg border ${STAT_CARD_COLORS.uptime.border} ${STAT_CARD_COLORS.uptime.bg} p-4 col-span-2 sm:col-span-1`}>
          <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Uptime</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{health ? formatUptime(health.uptime) : '-'}</p>
          <p className="text-xs text-gray-500">{stats ? `avg ${formatDuration(stats.avg_duration_ms)}` : 'checking...'}</p>
        </div>
      </div>

      {/* Recent Executions */}
      <section>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">Recent Executions</h2>
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              aria-label="Filter by job type"
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
            >
              <option value="">All Types</option>
              <option value="scheduler">Scheduler</option>
              <option value="agent">Agent</option>
              <option value="draft_engine">Draft Engine</option>
              <option value="repair">Repair</option>
              <option value="health_scan">Health Scan</option>
              <option value="data_enrichment">Data Enrichment</option>
              <option value="email_dispatch">Email Dispatch</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          {executions.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">
              {loading ? 'Loading...' : 'No job executions found'}
            </div>
          ) : (
            <>
              {/* Mobile card view */}
              <div className="sm:hidden divide-y divide-gray-100">
                {executions.map(job => (
                  <div key={job.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-900 text-sm">{job.job_name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${JOB_STATUS_COLORS[job.status] || 'bg-gray-100 text-gray-500'}`}>
                        {job.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>{job.job_type}</span>
                      <span>{formatDuration(job.duration_ms)}</span>
                      <span>{timeAgo(job.started_at)}</span>
                    </div>
                    {job.error_message && (
                      <p className="text-xs text-red-600 truncate">{job.error_message}</p>
                    )}
                    {job.status === 'failed' && (
                      <button
                        onClick={() => handleRetry(job.id)}
                        disabled={retrying === job.id}
                        className="mt-1 w-full rounded-md bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                      >
                        {retrying === job.id ? 'Retrying...' : 'Retry Job'}
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop table view */}
              <table className="hidden sm:table w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <th className="px-5 py-3">Job</th>
                    <th className="px-5 py-3">Type</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Duration</th>
                    <th className="px-5 py-3">Started</th>
                    <th className="px-5 py-3">Error</th>
                    <th className="px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {executions.map(job => (
                    <tr key={job.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-5 py-3 font-semibold text-gray-900">{job.job_name}</td>
                      <td className="px-5 py-3 text-gray-500">{job.job_type}</td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${JOB_STATUS_COLORS[job.status] || 'bg-gray-100 text-gray-500'}`}>
                          {job.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-500">{formatDuration(job.duration_ms)}</td>
                      <td className="px-5 py-3 text-xs text-gray-400">{timeAgo(job.started_at)}</td>
                      <td className="px-5 py-3 text-xs text-red-600 max-w-xs truncate">{job.error_message || '-'}</td>
                      <td className="px-5 py-3">
                        {job.status === 'failed' && (
                          <button
                            onClick={() => handleRetry(job.id)}
                            disabled={retrying === job.id}
                            className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                          >
                            {retrying === job.id ? 'Retrying...' : 'Retry'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </section>

      {/* Scheduled Jobs */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Scheduled Jobs</h2>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          {/* Mobile card view */}
          <div className="sm:hidden divide-y divide-gray-100">
            {SCHEDULED_JOBS.map(job => (
              <div key={job.name} className="p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-900 text-sm">{job.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${isUp ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {isUp ? 'active' : 'unknown'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-blue-600 font-medium">{job.schedule}</p>
                <p className="mt-1 text-xs text-gray-500">{job.description}</p>
                {job.maxPerCycle && <p className="mt-1 text-xs text-gray-400">{job.maxPerCycle}/cycle capacity</p>}
                <button
                  onClick={() => setExpandedJob(expandedJob === job.name ? null : job.name)}
                  className="mt-2 text-xs text-blue-600 hover:text-blue-800"
                >
                  {expandedJob === job.name ? 'Hide details' : 'Show details'}
                </button>
                {expandedJob === job.name && (
                  <p className="mt-2 text-xs text-gray-500 bg-gray-50 rounded p-2">{job.details}</p>
                )}
              </div>
            ))}
          </div>

          {/* Desktop table view */}
          <table className="hidden sm:table w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3">Job</th>
                <th className="px-5 py-3">Schedule</th>
                <th className="px-5 py-3">Description</th>
                <th className="px-5 py-3">Capacity</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {SCHEDULED_JOBS.map(job => (
                <tr
                  key={job.name}
                  className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer"
                  onClick={() => setExpandedJob(expandedJob === job.name ? null : job.name)}
                >
                  <td className="px-5 py-3 font-semibold text-gray-900">{job.name}</td>
                  <td className="px-5 py-3 text-blue-600 font-medium">{job.schedule}</td>
                  <td className="px-5 py-3 text-gray-500">
                    {job.description}
                    {expandedJob === job.name && (
                      <p className="mt-2 text-xs text-gray-400 bg-gray-50 rounded p-2">{job.details}</p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-500">{job.maxPerCycle ? `${job.maxPerCycle}/cycle` : '-'}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      isUp ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {isUp ? 'active' : 'unknown'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Scheduler Configuration - collapsible */}
      <section>
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="flex items-center gap-2 text-base font-semibold text-gray-900 hover:text-gray-700"
        >
          <span className={`text-xs transition-transform ${showConfig ? 'rotate-90' : ''}`}>&#9654;</span>
          Scheduler Configuration
        </button>
        {showConfig && (
          <div className="mt-3 rounded-lg border border-gray-200 bg-white">
            <div className="grid gap-0 sm:grid-cols-2">
              {SCHEDULER_CONFIG.map((item, i) => (
                <div key={item.key} className={`flex items-center justify-between px-5 py-3 ${i < SCHEDULER_CONFIG.length - 2 ? 'border-b border-gray-50' : ''}`}>
                  <span className="text-sm text-gray-500">{item.key}</span>
                  <span className="text-sm font-semibold text-gray-900">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
