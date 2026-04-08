'use client';

import { useState, useEffect } from 'react';
import { getHealth } from '@/lib/api';

interface HealthData {
  status: string;
  db: string;
  timestamp: string;
  uptime: number;
}

const AGENTS = [
  { name: 'email_polisher', type: 'content_quality', department: 'outreach', schedule: 'On-demand' },
  { name: 'response_classifier', type: 'nlp', department: 'outreach', schedule: 'On-demand' },
  { name: 'campaign_qa', type: 'validation', department: 'campaigns', schedule: 'Every 15 min' },
  { name: 'campaign_repair', type: 'repair', department: 'campaigns', schedule: 'Every 20 min' },
  { name: 'self_healing', type: 'recovery', department: 'campaigns', schedule: 'Every 30 min' },
  { name: 'engagement_features', type: 'engagement_analysis', department: 'growth', schedule: 'Every 4 hours' },
];

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function SystemPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<string>('');

  async function fetchHealth() {
    try {
      setError(null);
      const res = await getHealth() as HealthData;
      setHealth(res);
      setLastChecked(new Date().toLocaleTimeString());
    } catch (e) {
      setError('Backend unreachable');
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchHealth(); }, []);

  const isHealthy = health?.status === 'ok';
  const dbConnected = health?.db === 'connected';

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">System Reliability &amp; Performance</h1>
          <p className="mt-1 text-sm text-gray-500">Monitor system health, agents, and infrastructure status</p>
        </div>
        <div className="flex items-center gap-3">
          {lastChecked && <span className="text-xs text-gray-400">Checked {lastChecked}</span>}
          <button
            onClick={() => { setLoading(true); fetchHealth(); }}
            disabled={loading}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? 'Checking...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Health Status */}
      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`h-3 w-3 rounded-full ${isHealthy ? 'bg-emerald-500' : loading ? 'bg-gray-300' : 'bg-red-500'}`} />
            <div>
              <p className="font-medium text-gray-900">Backend Health</p>
              <p className="text-sm text-gray-500">
                {loading ? 'Checking...' : isHealthy ? 'All systems operational' : 'System degraded or unreachable'}
              </p>
            </div>
          </div>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            isHealthy ? 'bg-emerald-100 text-emerald-700' : loading ? 'bg-gray-100 text-gray-500' : 'bg-red-100 text-red-700'
          }`}>
            {loading ? 'checking' : health?.status || 'unreachable'}
          </span>
        </div>
      </div>

      {/* System Metrics */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Metrics</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">Uptime</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">
              {health ? formatUptime(health.uptime) : '—'}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">Database</p>
            <p className={`mt-1 text-2xl font-semibold ${dbConnected ? 'text-emerald-600' : 'text-gray-400'}`}>
              {loading ? '—' : dbConnected ? 'Connected' : 'Disconnected'}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">API Status</p>
            <p className={`mt-1 text-2xl font-semibold ${isHealthy ? 'text-emerald-600' : 'text-gray-400'}`}>
              {loading ? '—' : isHealthy ? 'Healthy' : 'Degraded'}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">Last Heartbeat</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">
              {health ? new Date(health.timestamp).toLocaleTimeString() : '—'}
            </p>
          </div>
        </div>
      </section>

      {/* Agent Status */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">AI Agents</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3">Agent</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Department</th>
                <th className="px-5 py-3">Schedule</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {AGENTS.map((agent) => (
                <tr key={agent.name} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-5 py-3 font-medium text-gray-900">{agent.name}</td>
                  <td className="px-5 py-3 text-gray-500">{agent.type}</td>
                  <td className="px-5 py-3 text-gray-500">{agent.department}</td>
                  <td className="px-5 py-3 text-gray-500">{agent.schedule}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      isHealthy ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {isHealthy ? 'active' : 'unknown'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* System Info */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Infrastructure</h2>
        <div className="mt-3 rounded-lg border border-gray-200 bg-white p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-gray-400">Runtime</p>
              <p className="text-sm text-gray-900">Node.js + TypeScript</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400">Database</p>
              <p className="text-sm text-gray-900">PostgreSQL (Sequelize ORM)</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400">AI Provider</p>
              <p className="text-sm text-gray-900">OpenAI (gpt-4o)</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400">Email</p>
              <p className="text-sm text-gray-900">Mandrill SMTP + Fallback</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400">Scheduler</p>
              <p className="text-sm text-gray-900">5-min cycle, 40 actions/cycle max</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400">Send Window</p>
              <p className="text-sm text-gray-900">8AM–5PM CT, Mon–Fri</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
