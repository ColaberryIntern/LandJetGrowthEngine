'use client';

import { useState, useEffect } from 'react';
import { getHealth, getLocaleSettings, updateLocaleSettings, getResourceConfig, updateResourceConfig, getApolloCredits, getOutreachUsage, type LocalePreferences, type ResourceConfig, type UsageSummary } from '@/lib/api';
import { useTranslation, SUPPORTED_LANGUAGES, LANGUAGE_LABELS, type Language } from '@/lib/i18n';

interface HealthData {
  status: string;
  db: string;
  timestamp: string;
  uptime: number;
  environment: string;
}

const ENV_COLORS: Record<string, string> = {
  production: 'bg-emerald-100 text-emerald-700',
  development: 'bg-blue-100 text-blue-700',
  test: 'bg-amber-100 text-amber-700',
};

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function SystemPage() {
  const { lang, setLang, t } = useTranslation();
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<string>('');
  const [locale, setLocale] = useState<LocalePreferences | null>(null);
  const [editingLocale, setEditingLocale] = useState(false);
  const [localeForm, setLocaleForm] = useState({ timezone: '', date_format: '', currency: '', locale: '' });
  const [localeSaving, setLocaleSaving] = useState(false);
  const [resources, setResources] = useState<ResourceConfig | null>(null);
  const [editingResources, setEditingResources] = useState(false);
  const [resourceForm, setResourceForm] = useState({ max_per_cycle: 40, max_per_campaign: 10, send_window_start: 8, send_window_end: 17, max_daily_calls: 50, api_rate_limit: 100, retry_delay_minutes: 30 });
  const [resourceSaving, setResourceSaving] = useState(false);
  const [apolloCredits, setApolloCredits] = useState<{ used: number; limit: number } | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);

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

  async function fetchLocale() {
    try {
      const prefs = await getLocaleSettings();
      setLocale(prefs);
      setLocaleForm({ timezone: prefs.timezone, date_format: prefs.date_format, currency: prefs.currency, locale: prefs.locale });
    } catch {}
  }

  async function fetchResources() {
    try {
      const cfg = await getResourceConfig();
      setResources(cfg);
      setResourceForm(cfg);
    } catch {}
  }

  useEffect(() => {
    fetchHealth(); fetchLocale(); fetchResources();
    getApolloCredits().then(setApolloCredits).catch(() => {});
    getOutreachUsage().then(setUsage).catch(() => {});
  }, []);

  async function handleLocaleSave() {
    setLocaleSaving(true);
    try {
      const updated = await updateLocaleSettings(localeForm);
      setLocale(updated);
      setEditingLocale(false);
    } catch {}
    setLocaleSaving(false);
  }

  async function handleResourceSave() {
    setResourceSaving(true);
    try {
      const updated = await updateResourceConfig(resourceForm);
      setResources(updated);
      setEditingResources(false);
    } catch {}
    setResourceSaving(false);
  }

  const isHealthy = health?.status === 'ok';
  const dbConnected = health?.db === 'connected';
  const env = health?.environment || 'unknown';

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">System Reliability &amp; Performance</h1>
            <p className="mt-1 text-sm text-gray-500">Monitor system health, agents, and infrastructure status</p>
          </div>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ENV_COLORS[env] || 'bg-gray-100 text-gray-500'}`}>
            {env}
          </span>
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

      {/* Outreach Usage Widget */}
      {usage && (() => {
        const maxSends = Math.max(1, ...usage.daily.map(d => d.sends));
        const lastActiveAgo = usage.last_active
          ? Math.round((Date.now() - new Date(usage.last_active).getTime()) / 3600000)
          : null;
        return (
          <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Outreach Activity</p>
                <p className="mt-0.5 text-sm text-gray-500">
                  {lastActiveAgo !== null
                    ? lastActiveAgo < 24 ? `Last send ${lastActiveAgo}h ago` : `Last send ${Math.round(lastActiveAgo / 24)}d ago`
                    : 'No sends yet'}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-6 text-right">
                <div>
                  <p className="text-2xl font-bold text-gray-900">{usage.sends_last_7d}</p>
                  <p className="text-xs text-gray-500">last 7d</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{usage.sends_last_30d}</p>
                  <p className="text-xs text-gray-500">last 30d</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{usage.avg_sends_per_active_day}</p>
                  <p className="text-xs text-gray-500">avg/active day</p>
                </div>
              </div>
            </div>

            {/* Sparkline (oldest left, newest right) */}
            {usage.daily.length > 0 && (
              <div className="mt-4">
                <div className="flex items-end gap-1 h-20">
                  {[...usage.daily].reverse().map(d => {
                    const h = Math.max(2, Math.round((d.sends / maxSends) * 80));
                    return (
                      <div key={d.day} className="flex-1 flex flex-col items-center justify-end" title={`${d.day}: ${d.sends} sends`}>
                        <div className={`w-full rounded-t ${d.sends > 0 ? 'bg-emerald-500' : 'bg-gray-200'}`} style={{ height: `${h}px` }} />
                      </div>
                    );
                  })}
                </div>
                <div className="mt-1 flex justify-between text-xs text-gray-400">
                  <span>{usage.daily[usage.daily.length - 1]?.day.slice(5)}</span>
                  <span>{usage.daily[0]?.day.slice(5)}</span>
                </div>
              </div>
            )}

            {/* Top campaigns */}
            {usage.by_campaign.length > 0 && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Top campaigns (30d)</p>
                <div className="space-y-1">
                  {usage.by_campaign.slice(0, 5).map(c => (
                    <div key={c.campaign_name} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 truncate">{c.campaign_name}</span>
                      <span className="text-gray-500 ml-3 whitespace-nowrap">{c.sends_30d}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Apollo Credits Widget */}
      {apolloCredits && (() => {
        const used = apolloCredits.used;
        const limit = apolloCredits.limit;
        const pct = Math.min(100, Math.round((used / limit) * 100));
        const remaining = limit - used;
        const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
        const textColor = pct >= 90 ? 'text-red-700' : pct >= 70 ? 'text-amber-700' : 'text-emerald-700';
        return (
          <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Apollo Lead Sourcing Credits</p>
                <p className="mt-0.5 text-sm text-gray-500">Used to pull and enrich cold leads. Resets monthly.</p>
              </div>
              <div className="text-right">
                <p className={`text-2xl font-bold ${textColor}`}>{used.toLocaleString()} / {limit.toLocaleString()}</p>
                <p className="text-xs text-gray-500">{remaining.toLocaleString()} remaining ({100 - pct}% available)</p>
              </div>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })()}

      {/* System Metrics */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Metrics</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">Uptime</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">
              {health ? formatUptime(health.uptime) : '-'}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">Database</p>
            <p className={`mt-1 text-2xl font-semibold ${dbConnected ? 'text-emerald-600' : 'text-gray-400'}`}>
              {loading ? '-' : dbConnected ? 'Connected' : 'Disconnected'}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">API Status</p>
            <p className={`mt-1 text-2xl font-semibold ${isHealthy ? 'text-emerald-600' : 'text-gray-400'}`}>
              {loading ? '-' : isHealthy ? 'Healthy' : 'Degraded'}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">Environment</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{env}</p>
            <p className="mt-1 text-xs text-gray-400">NODE_ENV</p>
          </div>
        </div>
      </section>

      {/* Language Selection */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">{t('system.language')}</h2>
        <div className="mt-3 rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-4">
            <p className="text-sm text-gray-700">Select your preferred language:</p>
            <div className="flex gap-2">
              {SUPPORTED_LANGUAGES.map(l => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    lang === l
                      ? 'bg-gray-900 text-white'
                      : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {LANGUAGE_LABELS[l]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Locale & Formatting */}
      <section className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">{t('system.locale')}</h2>
          {!editingLocale && locale && (
            <button
              onClick={() => setEditingLocale(true)}
              className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Edit
            </button>
          )}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          {!locale ? (
            <p className="text-sm text-gray-400">Loading locale settings...</p>
          ) : editingLocale ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                  <input
                    value={localeForm.timezone}
                    onChange={e => setLocaleForm({ ...localeForm, timezone: e.target.value })}
                    placeholder="America/Chicago"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Locale</label>
                  <input
                    value={localeForm.locale}
                    onChange={e => setLocaleForm({ ...localeForm, locale: e.target.value })}
                    placeholder="en-US"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date Format</label>
                  <select
                    value={localeForm.date_format}
                    onChange={e => setLocaleForm({ ...localeForm, date_format: e.target.value })}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                  >
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                  <input
                    value={localeForm.currency}
                    onChange={e => setLocaleForm({ ...localeForm, currency: e.target.value })}
                    placeholder="USD"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleLocaleSave}
                  disabled={localeSaving}
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {localeSaving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => setEditingLocale(false)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-gray-400">Timezone</p>
                <p className="text-sm text-gray-900">{locale.timezone}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400">Locale</p>
                <p className="text-sm text-gray-900">{locale.locale}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400">Date Format</p>
                <p className="text-sm text-gray-900">{locale.date_format}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400">Currency</p>
                <p className="text-sm text-gray-900">{locale.currency}</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Resource Allocation */}
      <section className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Resource Allocation</h2>
          {!editingResources && resources && (
            <button
              onClick={() => setEditingResources(true)}
              className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Edit
            </button>
          )}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          {!resources ? (
            <p className="text-sm text-gray-400">Loading resource config...</p>
          ) : editingResources ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { key: 'max_per_cycle' as const, label: 'Max Actions / Cycle', min: 1, max: 200 },
                  { key: 'max_per_campaign' as const, label: 'Max Actions / Campaign', min: 1, max: 50 },
                  { key: 'send_window_start' as const, label: 'Send Window Start (hour)', min: 0, max: 23 },
                  { key: 'send_window_end' as const, label: 'Send Window End (hour)', min: 1, max: 24 },
                  { key: 'max_daily_calls' as const, label: 'Max Daily Calls', min: 0, max: 500 },
                  { key: 'api_rate_limit' as const, label: 'API Rate Limit (req/15min)', min: 10, max: 1000 },
                  { key: 'retry_delay_minutes' as const, label: 'Retry Delay (minutes)', min: 1, max: 120 },
                ].map(field => (
                  <div key={field.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
                    <input
                      type="number"
                      value={resourceForm[field.key]}
                      onChange={e => setResourceForm({ ...resourceForm, [field.key]: Number(e.target.value) })}
                      min={field.min}
                      max={field.max}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleResourceSave}
                  disabled={resourceSaving}
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {resourceSaving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => { setEditingResources(false); if (resources) setResourceForm(resources); }}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-xs font-medium text-gray-400">Max Actions / Cycle</p>
                <p className="text-sm text-gray-900">{resources.max_per_cycle}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400">Max Actions / Campaign</p>
                <p className="text-sm text-gray-900">{resources.max_per_campaign}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400">Send Window</p>
                <p className="text-sm text-gray-900">{resources.send_window_start}:00 - {resources.send_window_end}:00 CT</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400">Max Daily Calls</p>
                <p className="text-sm text-gray-900">{resources.max_daily_calls}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400">API Rate Limit</p>
                <p className="text-sm text-gray-900">{resources.api_rate_limit} req/15min</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400">Retry Delay</p>
                <p className="text-sm text-gray-900">{resources.retry_delay_minutes} min</p>
              </div>
            </div>
          )}
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
              <p className="text-sm text-gray-900">8AM-5PM CT, Mon-Fri</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
