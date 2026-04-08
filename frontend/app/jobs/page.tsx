'use client';

import { useState, useEffect } from 'react';
import { getHealth } from '@/lib/api';

interface HealthData {
  status: string;
  db: string;
  timestamp: string;
  uptime: number;
}

const SCHEDULED_JOBS = [
  { name: 'Scheduler Engine', schedule: 'Every 5 min', description: 'Claims and processes pending/approved actions', maxPerCycle: 40 },
  { name: 'Draft Generation', schedule: 'Daily (9 AM CT)', description: 'AI generates and polishes CEO intro drafts', maxPerCycle: null },
  { name: 'Health Scanner', schedule: 'Every 15 min', description: 'Computes campaign health scores (0-100)', maxPerCycle: null },
  { name: 'Self-Healing', schedule: 'Every 30 min', description: 'Retries failed actions from last 6 hours', maxPerCycle: 50 },
  { name: 'Repair Agent', schedule: 'Every 20 min', description: 'Email retry, voice fallback, bounce cleanup', maxPerCycle: 20 },
  { name: 'QA Agent', schedule: 'Every 15 min (weekdays)', description: 'Validates sequences, lead data, send simulation', maxPerCycle: null },
  { name: 'Engagement Agent', schedule: 'Every 4 hours', description: 'Analyzes lead engagement signals', maxPerCycle: null },
  { name: 'Model Management', schedule: 'Daily', description: 'Monitors AI model performance and token usage', maxPerCycle: null },
];

const SCHEDULER_CONFIG = [
  { key: 'Cycle Interval', value: '5 minutes' },
  { key: 'Max Actions / Cycle', value: '40' },
  { key: 'Max Actions / Campaign', value: '10' },
  { key: 'Send Window', value: '8 AM – 5 PM CT' },
  { key: 'Call Window', value: '9 AM – 5 PM CT' },
  { key: 'Active Days', value: 'Mon – Fri' },
  { key: 'Max Daily Calls', value: '50' },
  { key: 'Retry Delay', value: '30 minutes' },
  { key: 'Stale Threshold', value: '10 minutes' },
  { key: 'Rate Limit', value: '2 emails / day / lead' },
];

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function JobsPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchHealth() {
    try {
      const res = await getHealth() as HealthData;
      setHealth(res);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { fetchHealth(); }, []);

  const isUp = health?.status === 'ok';

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Job Management</h1>
          <p className="mt-1 text-sm text-gray-500">Background jobs, scheduled agents, and system configuration</p>
        </div>
        <button
          onClick={() => { setLoading(true); fetchHealth(); }}
          disabled={loading}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Job Summary Cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <div className={`h-2.5 w-2.5 rounded-full ${isUp ? 'bg-emerald-500' : 'bg-gray-300'}`} />
            <p className="text-sm font-medium text-gray-900">Scheduler</p>
          </div>
          <p className="mt-2 text-2xl font-semibold text-gray-900">5 min</p>
          <p className="text-xs text-gray-500">cycle interval</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <div className={`h-2.5 w-2.5 rounded-full ${isUp ? 'bg-emerald-500' : 'bg-gray-300'}`} />
            <p className="text-sm font-medium text-gray-900">Draft Engine</p>
          </div>
          <p className="mt-2 text-2xl font-semibold text-gray-900">Daily</p>
          <p className="text-xs text-gray-500">9 AM CT, Mon–Fri</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <div className={`h-2.5 w-2.5 rounded-full ${isUp ? 'bg-emerald-500' : 'bg-gray-300'}`} />
            <p className="text-sm font-medium text-gray-900">Health Scanner</p>
          </div>
          <p className="mt-2 text-2xl font-semibold text-gray-900">15 min</p>
          <p className="text-xs text-gray-500">campaign health check</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm font-medium text-gray-900">Uptime</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{health ? formatUptime(health.uptime) : '—'}</p>
          <p className="text-xs text-gray-500">{health ? `since ${new Date(Date.now() - health.uptime * 1000).toLocaleDateString()}` : 'checking...'}</p>
        </div>
      </div>

      {/* Scheduled Jobs Table */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Scheduled Jobs</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
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
              {SCHEDULED_JOBS.map((job) => (
                <tr key={job.name} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-5 py-3 font-medium text-gray-900">{job.name}</td>
                  <td className="px-5 py-3 text-gray-500">{job.schedule}</td>
                  <td className="px-5 py-3 text-gray-500">{job.description}</td>
                  <td className="px-5 py-3 text-gray-500">{job.maxPerCycle ? `${job.maxPerCycle}/cycle` : '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
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

      {/* Scheduler Configuration */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Scheduler Configuration</h2>
        <div className="mt-3 rounded-lg border border-gray-200 bg-white">
          <div className="grid gap-0 sm:grid-cols-2">
            {SCHEDULER_CONFIG.map((item, i) => (
              <div key={item.key} className={`flex items-center justify-between px-5 py-3 ${i < SCHEDULER_CONFIG.length - 2 ? 'border-b border-gray-50' : ''}`}>
                <span className="text-sm text-gray-500">{item.key}</span>
                <span className="text-sm font-medium text-gray-900">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
