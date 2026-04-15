'use client';

import { useState, useEffect } from 'react';
import {
  getPerformanceStats,
  getRequestTimingSummary,
  getPerformanceMetrics,
  getCapacityReport,
  type RequestTimingSummary,
  type PerformanceStats,
  type PerformanceMetricRecord,
  type CapacityReport,
} from '../../lib/api';

const STATUS_COLORS: Record<string, string> = {
  normal: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-700',
};

const CATEGORY_LABELS: Record<string, string> = {
  api_latency: 'API Latency',
  db_query: 'DB Query',
  ai_generation: 'AI Generation',
  email_delivery: 'Email Delivery',
  scheduler_cycle: 'Scheduler Cycle',
  memory_usage: 'Memory Usage',
  throughput: 'Throughput',
};

const CATEGORIES = ['api_latency', 'db_query', 'ai_generation', 'email_delivery', 'scheduler_cycle', 'memory_usage', 'throughput'];

export default function PerformancePage() {
  const [tab, setTab] = useState<'timing' | 'capacity' | 'metrics'>('timing');
  const [timing, setTiming] = useState<RequestTimingSummary | null>(null);
  const [stats, setStats] = useState<PerformanceStats | null>(null);
  const [metrics, setMetrics] = useState<PerformanceMetricRecord[]>([]);
  const [metricsTotal, setMetricsTotal] = useState(0);
  const [capacity, setCapacity] = useState<CapacityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');

  async function loadAll() {
    try {
      const [t, s, c] = await Promise.allSettled([
        getRequestTimingSummary(),
        getPerformanceStats(),
        getCapacityReport(),
      ]);
      if (t.status === 'fulfilled') setTiming(t.value);
      if (s.status === 'fulfilled') setStats(s.value);
      if (c.status === 'fulfilled') setCapacity(c.value);
    } catch {}
    setLoading(false);
  }

  async function loadMetrics() {
    try {
      const res = await getPerformanceMetrics({ category: categoryFilter || undefined, limit: 50 });
      setMetrics(res.metrics || []);
      setMetricsTotal(res.total || 0);
    } catch {}
  }

  useEffect(() => { loadAll(); loadMetrics(); }, []);
  useEffect(() => { loadMetrics(); }, [categoryFilter]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Scalability &amp; Performance</h1>
          <p className="mt-1 text-sm text-gray-500">System throughput, latency percentiles, and capacity monitoring</p>
        </div>
        <button
          onClick={() => { setLoading(true); loadAll(); loadMetrics(); }}
          disabled={loading}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Stats Row */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Avg Response</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {timing ? `${timing.avg_duration_ms}ms` : '-'}
          </p>
          <p className="mt-1 text-xs text-gray-400">mean latency</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">p95 Latency</p>
          <p className={`mt-1 text-2xl font-semibold ${(timing?.p95_ms ?? 0) > 1000 ? 'text-amber-600' : 'text-gray-900'}`}>
            {timing ? `${timing.p95_ms}ms` : '-'}
          </p>
          <p className="mt-1 text-xs text-gray-400">95th percentile</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Throughput</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {timing ? `${timing.requests_per_minute}/min` : '-'}
          </p>
          <p className="mt-1 text-xs text-gray-400">requests per minute</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Slow Requests</p>
          <p className={`mt-1 text-2xl font-semibold ${(timing?.slow_requests ?? 0) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {timing?.slow_requests ?? '-'}
          </p>
          <p className="mt-1 text-xs text-gray-400">&gt; 2000ms threshold</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Warnings</p>
          <p className={`mt-1 text-2xl font-semibold ${(stats?.warning ?? 0) + (stats?.critical ?? 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {stats ? stats.warning + stats.critical : '-'}
          </p>
          <p className="mt-1 text-xs text-gray-400">threshold violations</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 border-b border-gray-200">
        {([
          { key: 'timing' as const, label: 'Request Timing' },
          { key: 'capacity' as const, label: 'Capacity Planning' },
          { key: 'metrics' as const, label: 'Metrics' },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
        ) : tab === 'timing' ? (
          <RequestTimingTab timing={timing} stats={stats} />
        ) : tab === 'capacity' ? (
          <CapacityTab capacity={capacity} />
        ) : (
          <MetricsTab
            metrics={metrics}
            total={metricsTotal}
            categoryFilter={categoryFilter}
            onCategoryChange={setCategoryFilter}
          />
        )}
      </div>
    </div>
  );
}

// --- Request Timing Tab ---

function RequestTimingTab({ timing, stats }: { timing: RequestTimingSummary | null; stats: PerformanceStats | null }) {
  return (
    <div className="space-y-6">
      {/* Latency Percentiles */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Latency Percentiles</h3>
        <div className="grid gap-4 sm:grid-cols-4">
          {[
            { label: 'p50 (Median)', value: timing?.p50_ms },
            { label: 'p95', value: timing?.p95_ms },
            { label: 'p99', value: timing?.p99_ms },
            { label: 'Total Requests', value: timing?.total_requests, suffix: '' },
          ].map(item => (
            <div key={item.label} className="rounded-lg border border-gray-200 bg-white p-5">
              <p className="text-sm text-gray-500">{item.label}</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">
                {item.value != null ? `${item.value}${item.suffix ?? 'ms'}` : '-'}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Slowest Endpoints */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Slowest Endpoints</h3>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {timing && timing.slowest_endpoints.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-5 py-3">Method</th>
                  <th className="px-5 py-3">Path</th>
                  <th className="px-5 py-3">Avg Latency</th>
                  <th className="px-5 py-3">Requests</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {timing.slowest_endpoints.map((ep, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-5 py-3">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono font-medium text-gray-700">{ep.method}</span>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-gray-900">{ep.path}</td>
                    <td className="px-5 py-3">
                      <span className={`font-semibold ${ep.avg_ms > 2000 ? 'text-red-600' : ep.avg_ms > 500 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {ep.avg_ms}ms
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500">{ep.count}</td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        ep.avg_ms > 2000 ? 'bg-red-100 text-red-700' : ep.avg_ms > 500 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {ep.avg_ms > 2000 ? 'slow' : ep.avg_ms > 500 ? 'moderate' : 'fast'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-sm text-gray-400">No request data yet</div>
          )}
        </div>
      </div>

      {/* Recent Averages by Category */}
      {stats && stats.recent_averages.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">Hourly Averages by Category</h3>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Metric</th>
                  <th className="px-5 py-3">Avg</th>
                  <th className="px-5 py-3">Max</th>
                  <th className="px-5 py-3">Unit</th>
                  <th className="px-5 py-3">Samples</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent_averages.map((avg, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="px-5 py-3 text-gray-500">{CATEGORY_LABELS[avg.category] || avg.category}</td>
                    <td className="px-5 py-3 font-medium text-gray-900">{avg.metric_name}</td>
                    <td className="px-5 py-3 text-gray-900">{avg.avg_value.toFixed(1)}</td>
                    <td className="px-5 py-3 text-gray-500">{avg.max_value.toFixed(1)}</td>
                    <td className="px-5 py-3 text-xs text-gray-400">{avg.unit}</td>
                    <td className="px-5 py-3 text-gray-500">{avg.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Capacity Tab ---

function CapacityTab({ capacity }: { capacity: CapacityReport | null }) {
  if (!capacity) return <div className="p-8 text-center text-sm text-gray-400">No capacity data</div>;

  return (
    <div className="space-y-6">
      {/* Current Capacity */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Current Capacity</h3>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: 'Total Leads', value: capacity.current.total_leads.toLocaleString() },
            { label: 'Active Campaigns', value: capacity.current.active_campaigns },
            { label: 'Active Users', value: capacity.current.active_users },
            { label: 'Pending Actions', value: capacity.current.pending_actions, warn: capacity.current.pending_actions > 100 },
            { label: 'Failed Jobs', value: capacity.current.failed_jobs, warn: capacity.current.failed_jobs > 5 },
            { label: 'Daily Throughput', value: `${capacity.current.daily_throughput}/day` },
          ].map(item => (
            <div key={item.label} className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs text-gray-500">{item.label}</p>
              <p className={`mt-1 text-xl font-semibold ${(item as any).warn ? 'text-amber-600' : 'text-gray-900'}`}>
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Growth Multiplier */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">Weekly Growth Rate</p>
            <p className="text-xs text-gray-400">Comparing last 7 days to average weekly rate</p>
          </div>
          <p className={`text-2xl font-semibold ${capacity.weekly_growth_multiplier > 1.5 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {capacity.weekly_growth_multiplier.toFixed(2)}x
          </p>
        </div>
      </div>

      {/* Growth Analysis Table */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Growth Analysis</h3>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3">Period</th>
                <th className="px-5 py-3">Leads Created</th>
                <th className="px-5 py-3">Emails Sent</th>
                <th className="px-5 py-3">Interactions</th>
                <th className="px-5 py-3">Jobs Run</th>
              </tr>
            </thead>
            <tbody>
              {capacity.growth.map(g => (
                <tr key={g.period} className="border-b border-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{g.period}</td>
                  <td className="px-5 py-3 text-gray-900">{g.leads.toLocaleString()}</td>
                  <td className="px-5 py-3 text-gray-900">{g.emails.toLocaleString()}</td>
                  <td className="px-5 py-3 text-gray-900">{g.interactions.toLocaleString()}</td>
                  <td className="px-5 py-3 text-gray-900">{g.jobs.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottlenecks */}
      {capacity.bottlenecks.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">Bottlenecks Detected</h3>
          <div className="space-y-2">
            {capacity.bottlenecks.map((b, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <span className="mt-0.5 h-2 w-2 rounded-full bg-amber-500 flex-shrink-0" />
                <p className="text-sm text-amber-800">{b}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Recommendations</h3>
        <div className="space-y-2">
          {capacity.recommendations.map((r, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <span className="mt-0.5 h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />
              <p className="text-sm text-blue-800">{r}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Metrics Tab ---

function MetricsTab({
  metrics,
  total,
  categoryFilter,
  onCategoryChange,
}: {
  metrics: PerformanceMetricRecord[];
  total: number;
  categoryFilter: string;
  onCategoryChange: (c: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{total} metric{total !== 1 ? 's' : ''} recorded</p>
        <select
          value={categoryFilter}
          onChange={e => onCategoryChange(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {metrics.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No metrics recorded yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Metric</th>
                <th className="px-5 py-3">Value</th>
                <th className="px-5 py-3">Threshold</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Recorded</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map(m => (
                <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-5 py-3 text-gray-500">{CATEGORY_LABELS[m.category] || m.category}</td>
                  <td className="px-5 py-3 font-medium text-gray-900">{m.metric_name}</td>
                  <td className="px-5 py-3 text-gray-900">{m.value.toFixed(1)} {m.unit}</td>
                  <td className="px-5 py-3 text-xs text-gray-400">
                    {m.threshold_warning != null ? `W: ${m.threshold_warning}` : ''}
                    {m.threshold_critical != null ? ` C: ${m.threshold_critical}` : ''}
                    {m.threshold_warning == null && m.threshold_critical == null ? '-' : ''}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[m.status] || 'bg-gray-100 text-gray-500'}`}>
                      {m.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-400">{new Date(m.recorded_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
