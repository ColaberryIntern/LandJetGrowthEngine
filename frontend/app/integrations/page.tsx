'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getIntegrationStats,
  getIntegrations,
  createIntegration,
  updateIntegration,
  type ApiIntegration,
  type IntegrationStats,
} from '../../lib/api';

const PROVIDERS = ['openai', 'mandrill', 'synthflow', 'ghl', 'apollo', 'stripe', 'openclaw', 'custom'] as const;
const STATUSES = ['active', 'degraded', 'offline', 'pending'] as const;

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  degraded: 'bg-yellow-100 text-yellow-800',
  offline: 'bg-red-100 text-red-800',
  pending: 'bg-gray-100 text-gray-600',
};

const STATUS_DOT: Record<string, string> = {
  active: 'bg-green-500',
  degraded: 'bg-yellow-500',
  offline: 'bg-red-500',
  pending: 'bg-gray-400',
};

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  mandrill: 'Mandrill',
  synthflow: 'SynthFlow',
  ghl: 'GoHighLevel',
  apollo: 'Apollo',
  stripe: 'Stripe',
  openclaw: 'OpenClaw',
  custom: 'Custom',
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function IntegrationsPage() {
  const [stats, setStats] = useState<IntegrationStats | null>(null);
  const [integrations, setIntegrations] = useState<ApiIntegration[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterProvider, setFilterProvider] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Create form state
  const [formName, setFormName] = useState('');
  const [formProvider, setFormProvider] = useState<string>('openai');
  const [formBaseUrl, setFormBaseUrl] = useState('');
  const [formApiVersion, setFormApiVersion] = useState('');
  const [formAuthType, setFormAuthType] = useState('');
  const [formRateLimit, setFormRateLimit] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [s, r] = await Promise.all([
        getIntegrationStats(),
        getIntegrations({ provider: filterProvider || undefined, status: filterStatus || undefined }),
      ]);
      setStats(s);
      setIntegrations(r.integrations);
      setTotal(r.total);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filterProvider, filterStatus]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createIntegration({
        name: formName,
        provider: formProvider,
        base_url: formBaseUrl || undefined,
        api_version: formApiVersion || undefined,
        auth_type: formAuthType || undefined,
        rate_limit: formRateLimit ? parseInt(formRateLimit) : undefined,
      });
      setShowCreate(false);
      setFormName(''); setFormBaseUrl(''); setFormApiVersion(''); setFormAuthType(''); setFormRateLimit('');
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleStatusChange(id: string, status: string) {
    try {
      await updateIntegration(id, { status });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">API Integrations</h1>
          <p className="text-sm text-gray-500 mt-1">Manage external service connections and monitor health</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + Add Integration
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError('')} className="float-right font-bold">×</button>
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-5 gap-4 mb-6">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-xs text-gray-500 mt-1">Total</div>
          </div>
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="text-2xl font-bold text-green-700">{stats.active}</div>
            <div className="text-xs text-green-600 mt-1">Active</div>
          </div>
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
            <div className="text-2xl font-bold text-yellow-700">{stats.degraded}</div>
            <div className="text-xs text-yellow-600 mt-1">Degraded</div>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="text-2xl font-bold text-red-700">{stats.offline}</div>
            <div className="text-xs text-red-600 mt-1">Offline</div>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="text-2xl font-bold text-blue-700">{stats.health_rate}%</div>
            <div className="text-xs text-blue-600 mt-1">Health Rate</div>
          </div>
        </div>
      )}

      {/* Create Form */}
      {showCreate && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Add New Integration</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  required
                  placeholder="e.g. OpenAI GPT-4o"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                <select
                  value={formProvider}
                  onChange={e => setFormProvider(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                >
                  {PROVIDERS.map(p => (
                    <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
                <input
                  value={formBaseUrl}
                  onChange={e => setFormBaseUrl(e.target.value)}
                  placeholder="https://api.example.com"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API Version</label>
                <input
                  value={formApiVersion}
                  onChange={e => setFormApiVersion(e.target.value)}
                  placeholder="v1"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Auth Type</label>
                <input
                  value={formAuthType}
                  onChange={e => setFormAuthType(e.target.value)}
                  placeholder="bearer, api_key, oauth2"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rate Limit (req/min)</label>
                <input
                  type="number"
                  value={formRateLimit}
                  onChange={e => setFormRateLimit(e.target.value)}
                  placeholder="60"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
                Create Integration
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select
          value={filterProvider}
          onChange={e => setFilterProvider(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
        >
          <option value="">All Providers</option>
          {PROVIDERS.map(p => (
            <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
        >
          <option value="">All Statuses</option>
          {STATUSES.map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <span className="text-sm text-gray-500 self-center ml-auto">{total} integration{total !== 1 ? 's' : ''}</span>
      </div>

      {/* Integration Cards */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : integrations.length === 0 ? (
        <div className="text-center py-16 rounded-lg border-2 border-dashed border-gray-200">
          <div className="text-gray-400 text-4xl mb-3">⚡</div>
          <div className="text-gray-500 font-medium">No integrations found</div>
          <p className="text-sm text-gray-400 mt-1">Add your first API integration to get started</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            + Add Integration
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {integrations.map(int => (
            <div key={int.id} className="rounded-lg border border-gray-200 bg-white p-5 hover:border-gray-300 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[int.status]}`} />
                  <div>
                    <h3 className="font-semibold text-gray-900">{int.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{PROVIDER_LABELS[int.provider] || int.provider}</span>
                      {int.base_url && <span className="text-xs text-gray-400">· {int.base_url}</span>}
                      {int.api_version && <span className="text-xs text-gray-400">· {int.api_version}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[int.status]}`}>
                    {int.status}
                  </span>
                  {editingId === int.id ? (
                    <div className="flex gap-1">
                      {STATUSES.map(s => (
                        <button
                          key={s}
                          onClick={() => { handleStatusChange(int.id, s); setEditingId(null); }}
                          className={`rounded px-2 py-1 text-xs font-medium border ${s === int.status ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                        >
                          {s}
                        </button>
                      ))}
                      <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 ml-1">✕</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingId(int.id)}
                      className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>

              {/* Metrics row */}
              <div className="mt-4 flex gap-6">
                <div>
                  <div className="text-lg font-semibold text-gray-900">{int.total_calls.toLocaleString()}</div>
                  <div className="text-xs text-gray-500">Total Calls</div>
                </div>
                <div>
                  <div className={`text-lg font-semibold ${int.error_count > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {int.error_count.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500">Errors</div>
                </div>
                <div>
                  <div className="text-lg font-semibold text-gray-900">
                    {int.avg_latency_ms != null ? `${Math.round(int.avg_latency_ms)}ms` : '—'}
                  </div>
                  <div className="text-xs text-gray-500">Avg Latency</div>
                </div>
                {int.rate_limit && (
                  <div>
                    <div className="text-lg font-semibold text-gray-900">{int.rate_limit}/min</div>
                    <div className="text-xs text-gray-500">Rate Limit</div>
                  </div>
                )}
                <div>
                  <div className="text-lg font-semibold text-gray-900">
                    {int.total_calls > 0 ? `${((1 - int.error_count / int.total_calls) * 100).toFixed(1)}%` : '—'}
                  </div>
                  <div className="text-xs text-gray-500">Success Rate</div>
                </div>
                <div className="ml-auto text-right">
                  <div className="text-sm text-gray-500">{timeAgo(int.last_health_check)}</div>
                  <div className="text-xs text-gray-400">Last Check</div>
                </div>
              </div>

              {/* Last Error */}
              {int.last_error && (
                <div className="mt-3 rounded bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700 font-mono truncate">
                  {int.last_error}
                </div>
              )}

              {/* Auth type */}
              {int.auth_type && (
                <div className="mt-2 text-xs text-gray-400">
                  Auth: <span className="font-medium text-gray-500">{int.auth_type}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
