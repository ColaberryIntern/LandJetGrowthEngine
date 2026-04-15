'use client';

import { useState, useEffect } from 'react';
import {
  getDeployments,
  getDeploymentStats,
  getCapacityReport,
  getResourceConfig,
  updateResourceConfig,
  getHealth,
  type DeploymentRecord,
  type DeploymentStats,
  type CapacityReport,
  type ResourceConfig,
} from '../../lib/api';

const DEPLOY_STATUS_COLORS: Record<string, string> = {
  planned: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  deployed: 'bg-emerald-100 text-emerald-700',
  rolled_back: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
};

const ENV_COLORS: Record<string, string> = {
  production: 'bg-red-50 text-red-700',
  staging: 'bg-amber-50 text-amber-700',
  development: 'bg-blue-50 text-blue-700',
};

function formatDuration(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export default function InfrastructurePage() {
  const [tab, setTab] = useState<'deployments' | 'capacity' | 'resources'>('deployments');
  const [deployments, setDeployments] = useState<DeploymentRecord[]>([]);
  const [deployStats, setDeployStats] = useState<DeploymentStats | null>(null);
  const [capacity, setCapacity] = useState<CapacityReport | null>(null);
  const [resources, setResources] = useState<ResourceConfig | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [resourceForm, setResourceForm] = useState<ResourceConfig>({ max_per_cycle: 40, max_per_campaign: 10, send_window_start: 8, send_window_end: 17, max_daily_calls: 50, api_rate_limit: 100, retry_delay_minutes: 30 });
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    try {
      const [d, ds, c, r, h] = await Promise.allSettled([
        getDeployments(),
        getDeploymentStats(),
        getCapacityReport(),
        getResourceConfig(),
        getHealth(),
      ]);
      if (d.status === 'fulfilled') setDeployments((d.value as any).deployments || []);
      if (ds.status === 'fulfilled') setDeployStats(ds.value);
      if (c.status === 'fulfilled') setCapacity(c.value);
      if (r.status === 'fulfilled') { setResources(r.value); setResourceForm(r.value); }
      if (h.status === 'fulfilled') setHealth(h.value);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  async function handleResourceSave() {
    setSaving(true);
    try {
      const updated = await updateResourceConfig(resourceForm);
      setResources(updated);
      setEditing(false);
    } catch {}
    setSaving(false);
  }

  const isUp = health?.status === 'ok';
  const env = health?.environment || 'unknown';

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Infrastructure &amp; Resources</h1>
            <p className="mt-1 text-sm text-gray-500">Deployments, capacity planning, and resource allocation</p>
          </div>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${isUp ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
            {isUp ? 'healthy' : 'degraded'}
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ENV_COLORS[env] || 'bg-gray-100 text-gray-500'}`}>
            {env}
          </span>
        </div>
        <button
          onClick={() => { setLoading(true); loadAll(); }}
          disabled={loading}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Stats Row */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Deployments</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{deployStats?.total ?? '-'}</p>
          <p className="mt-1 text-xs text-gray-400">{deployStats ? `${deployStats.success_rate}% success` : ''}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Total Leads</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{capacity?.current.total_leads?.toLocaleString() ?? '-'}</p>
          <p className="mt-1 text-xs text-gray-400">in system</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Daily Throughput</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{capacity?.current.daily_throughput ?? '-'}</p>
          <p className="mt-1 text-xs text-gray-400">emails/day</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Pending Actions</p>
          <p className={`mt-1 text-2xl font-semibold ${(capacity?.current.pending_actions ?? 0) > 100 ? 'text-amber-600' : 'text-gray-900'}`}>
            {capacity?.current.pending_actions ?? '-'}
          </p>
          <p className="mt-1 text-xs text-gray-400">in queue</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Growth Rate</p>
          <p className={`mt-1 text-2xl font-semibold ${(capacity?.weekly_growth_multiplier ?? 0) > 1.5 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {capacity ? `${capacity.weekly_growth_multiplier.toFixed(2)}x` : '-'}
          </p>
          <p className="mt-1 text-xs text-gray-400">weekly</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 border-b border-gray-200">
        {([
          { key: 'deployments' as const, label: `Deployments (${deployments.length})` },
          { key: 'capacity' as const, label: 'Capacity Planning' },
          { key: 'resources' as const, label: 'Resource Config' },
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
        ) : tab === 'deployments' ? (
          <DeploymentsTab deployments={deployments} stats={deployStats} />
        ) : tab === 'capacity' ? (
          <CapacityTab capacity={capacity} />
        ) : (
          <ResourcesTab
            resources={resources}
            editing={editing}
            form={resourceForm}
            saving={saving}
            onEdit={() => setEditing(true)}
            onCancel={() => { setEditing(false); if (resources) setResourceForm(resources); }}
            onChange={setResourceForm}
            onSave={handleResourceSave}
          />
        )}
      </div>
    </div>
  );
}

// --- Deployments Tab ---

function DeploymentsTab({ deployments, stats }: { deployments: DeploymentRecord[]; stats: DeploymentStats | null }) {
  return (
    <div className="space-y-6">
      {stats && (
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">Deployed</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-600">{stats.deployed}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">Failed</p>
            <p className={`mt-1 text-2xl font-semibold ${stats.failed > 0 ? 'text-red-600' : 'text-gray-900'}`}>{stats.failed}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">Rolled Back</p>
            <p className="mt-1 text-2xl font-semibold text-amber-600">{stats.rolled_back}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">Success Rate</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{stats.success_rate}%</p>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {deployments.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No deployments recorded</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3">Version</th>
                <th className="px-5 py-3">Environment</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Duration</th>
                <th className="px-5 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {deployments.map(d => (
                <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-5 py-3 font-medium text-gray-900">{d.version}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ENV_COLORS[d.environment] || 'bg-gray-100 text-gray-500'}`}>
                      {d.environment}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${DEPLOY_STATUS_COLORS[d.status] || 'bg-gray-100 text-gray-500'}`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500">{formatDuration(d.duration_ms)}</td>
                  <td className="px-5 py-3 text-xs text-gray-400">{new Date(d.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// --- Capacity Tab ---

function CapacityTab({ capacity }: { capacity: CapacityReport | null }) {
  if (!capacity) return <div className="p-8 text-center text-sm text-gray-400">No capacity data</div>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: 'Total Leads', value: capacity.current.total_leads.toLocaleString() },
          { label: 'Active Campaigns', value: capacity.current.active_campaigns },
          { label: 'Active Users', value: capacity.current.active_users },
          { label: 'Pending Actions', value: capacity.current.pending_actions, warn: capacity.current.pending_actions > 100 },
          { label: 'Failed Jobs', value: capacity.current.failed_jobs, warn: capacity.current.failed_jobs > 5 },
          { label: 'Throughput', value: `${capacity.current.daily_throughput}/day` },
        ].map(item => (
          <div key={item.label} className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500">{item.label}</p>
            <p className={`mt-1 text-xl font-semibold ${(item as any).warn ? 'text-amber-600' : 'text-gray-900'}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Growth Analysis */}
      {capacity.growth && Object.keys(capacity.growth).length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">Growth Analysis</h3>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-5 py-3">Period</th>
                  <th className="px-5 py-3">Leads</th>
                  <th className="px-5 py-3">Emails</th>
                  <th className="px-5 py-3">Interactions</th>
                  <th className="px-5 py-3">Jobs</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(capacity.growth).map(([period, g]: [string, any]) => (
                  <tr key={period} className="border-b border-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{period}</td>
                    <td className="px-5 py-3 text-gray-900">{g.leads?.toLocaleString()}</td>
                    <td className="px-5 py-3 text-gray-900">{g.emails?.toLocaleString()}</td>
                    <td className="px-5 py-3 text-gray-900">{g.interactions?.toLocaleString()}</td>
                    <td className="px-5 py-3 text-gray-900">{g.jobs?.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bottlenecks */}
      {capacity.bottlenecks.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">Bottlenecks</h3>
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

// --- Resources Tab ---

function ResourcesTab({
  resources, editing, form, saving, onEdit, onCancel, onChange, onSave,
}: {
  resources: ResourceConfig | null;
  editing: boolean;
  form: ResourceConfig;
  saving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onChange: (f: ResourceConfig) => void;
  onSave: () => void;
}) {
  if (!resources) return <div className="p-8 text-center text-sm text-gray-400">Loading resource config...</div>;

  const fields: { key: keyof ResourceConfig; label: string; min: number; max: number; unit: string }[] = [
    { key: 'max_per_cycle', label: 'Max Actions / Cycle', min: 1, max: 200, unit: 'actions' },
    { key: 'max_per_campaign', label: 'Max Actions / Campaign', min: 1, max: 50, unit: 'actions' },
    { key: 'send_window_start', label: 'Send Window Start', min: 0, max: 23, unit: 'hour (CT)' },
    { key: 'send_window_end', label: 'Send Window End', min: 1, max: 24, unit: 'hour (CT)' },
    { key: 'max_daily_calls', label: 'Max Daily Calls', min: 0, max: 500, unit: 'calls' },
    { key: 'api_rate_limit', label: 'API Rate Limit', min: 10, max: 1000, unit: 'req/15min' },
    { key: 'retry_delay_minutes', label: 'Retry Delay', min: 1, max: 120, unit: 'minutes' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">Scheduler and infrastructure resource limits</p>
        {!editing && (
          <button onClick={onEdit} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Edit
          </button>
        )}
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        {editing ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {fields.map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={form[f.key]}
                      onChange={e => onChange({ ...form, [f.key]: Number(e.target.value) })}
                      min={f.min}
                      max={f.max}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                    />
                    <span className="text-xs text-gray-400 whitespace-nowrap">{f.unit}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={onSave} disabled={saving} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={onCancel} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map(f => (
              <div key={f.key}>
                <p className="text-xs font-medium text-gray-400">{f.label}</p>
                <p className="text-sm text-gray-900">{resources[f.key]} {f.unit}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
