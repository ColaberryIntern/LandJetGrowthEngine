'use client';

import { useState, useEffect } from 'react';
import {
  getSecurityAudit,
  getConsentStats,
  getEtlPipelines,
  getEtlStats,
  getAuditLogs,
  getAuditStats,
  type SecurityAuditResult,
  type ConsentStats,
  type EtlPipelineRecord,
  type EtlStats,
} from '../../lib/api';

const CHECK_COLORS: Record<string, string> = {
  pass: 'bg-emerald-100 text-emerald-700',
  fail: 'bg-red-100 text-red-700',
  warn: 'bg-amber-100 text-amber-700',
  info: 'bg-blue-100 text-blue-700',
};

const PIPELINE_STATUS_COLORS: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  pending: 'bg-gray-100 text-gray-500',
  extracting: 'bg-blue-100 text-blue-700',
  transforming: 'bg-blue-100 text-blue-700',
  loading: 'bg-amber-100 text-amber-700',
};

function formatDuration(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export default function PrivacyPage() {
  const [tab, setTab] = useState<'compliance' | 'consent' | 'data' | 'audit'>('compliance');
  const [audit, setAudit] = useState<SecurityAuditResult | null>(null);
  const [consent, setConsent] = useState<ConsentStats | null>(null);
  const [pipelines, setPipelines] = useState<EtlPipelineRecord[]>([]);
  const [etlStats, setEtlStats] = useState<EtlStats | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditStats, setAuditStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    try {
      const [a, c, p, es, al, as2] = await Promise.allSettled([
        getSecurityAudit(),
        getConsentStats(),
        getEtlPipelines({ limit: 20 }),
        getEtlStats(),
        getAuditLogs({ limit: 20 }),
        getAuditStats(),
      ]);
      if (a.status === 'fulfilled') setAudit(a.value);
      if (c.status === 'fulfilled') setConsent(c.value);
      if (p.status === 'fulfilled') setPipelines((p.value as any).pipelines || []);
      if (es.status === 'fulfilled') setEtlStats(es.value);
      if (al.status === 'fulfilled') setAuditLogs((al.value as any).logs || []);
      if (as2.status === 'fulfilled') setAuditStats(as2.value);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  const scoreColor = (audit?.compliance_score ?? 0) >= 80 ? 'text-emerald-600' : (audit?.compliance_score ?? 0) >= 60 ? 'text-amber-600' : 'text-red-600';

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Data Management &amp; Privacy</h1>
          <p className="mt-1 text-sm text-gray-500">Compliance, consent tracking, data processing, and audit trail</p>
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
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Compliance Score</p>
          <p className={`mt-1 text-2xl font-semibold ${scoreColor}`}>
            {audit ? `${audit.compliance_score}%` : '-'}
          </p>
          <p className="mt-1 text-xs text-gray-400">{audit?.health || 'checking...'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">ETL Success Rate</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{etlStats ? `${etlStats.success_rate}%` : '-'}</p>
          <p className="mt-1 text-xs text-gray-400">{etlStats?.total ?? 0} pipelines total</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Records Processed</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{etlStats?.total_records_loaded?.toLocaleString() ?? '-'}</p>
          <p className="mt-1 text-xs text-gray-400">total loaded</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Audit Events</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{auditStats?.total ?? '-'}</p>
          <p className="mt-1 text-xs text-gray-400">{auditStats?.today ?? 0} today</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 border-b border-gray-200">
        {([
          { key: 'compliance' as const, label: 'Compliance' },
          { key: 'consent' as const, label: 'Consent' },
          { key: 'data' as const, label: 'Data Processing' },
          { key: 'audit' as const, label: 'Audit Trail' },
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
        ) : tab === 'compliance' ? (
          <ComplianceTab audit={audit} />
        ) : tab === 'consent' ? (
          <ConsentTab consent={consent} />
        ) : tab === 'data' ? (
          <DataProcessingTab pipelines={pipelines} stats={etlStats} />
        ) : (
          <AuditTrailTab logs={auditLogs} stats={auditStats} />
        )}
      </div>
    </div>
  );
}

// --- Compliance Tab ---

function ComplianceTab({ audit }: { audit: SecurityAuditResult | null }) {
  if (!audit) return <div className="p-8 text-center text-sm text-gray-400">No audit data</div>;

  const passed = audit.checks.filter(c => c.status === 'pass').length;
  const failed = audit.checks.filter(c => c.status === 'fail').length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Checks Passed</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">{passed}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Checks Failed</p>
          <p className={`mt-1 text-2xl font-semibold ${failed > 0 ? 'text-red-600' : 'text-gray-900'}`}>{failed}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Health Status</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900 capitalize">{audit.health}</p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Security Checks</h3>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3">Check</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {audit.checks.map((check, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-5 py-3 font-medium text-gray-900">{check.name}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CHECK_COLORS[check.status] || 'bg-gray-100 text-gray-500'}`}>
                      {check.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500">{check.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {audit.recommendations.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">Recommendations</h3>
          <div className="space-y-2">
            {audit.recommendations.map((r, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
                <span className="mt-0.5 h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />
                <p className="text-sm text-blue-800">{r}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Consent Tab ---

const CONSENT_LABELS: Record<string, string> = {
  data_processing: 'Data Processing',
  marketing_emails: 'Marketing Emails',
  analytics_tracking: 'Analytics Tracking',
  third_party_sharing: 'Third-Party Sharing',
};

function ConsentTab({ consent }: { consent: ConsentStats | null }) {
  if (!consent) return <div className="p-8 text-center text-sm text-gray-400">No consent data</div>;

  const types = Object.keys(consent);
  if (types.length === 0) return <div className="p-8 text-center text-sm text-gray-400">No consent records</div>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {types.map(type => {
          const data = consent[type];
          const total = data.granted + data.revoked;
          const pct = total > 0 ? Math.round((data.granted / total) * 100) : 0;
          return (
            <div key={type} className="rounded-lg border border-gray-200 bg-white p-5">
              <p className="text-sm font-medium text-gray-900">{CONSENT_LABELS[type] || type}</p>
              <div className="mt-3 flex items-end justify-between">
                <div>
                  <p className="text-2xl font-semibold text-emerald-600">{data.granted}</p>
                  <p className="text-xs text-gray-400">granted</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold text-gray-400">{data.revoked}</p>
                  <p className="text-xs text-gray-400">revoked</p>
                </div>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-gray-100">
                <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 text-xs text-gray-400 text-right">{pct}% consent rate</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Data Processing Tab ---

function DataProcessingTab({ pipelines, stats }: { pipelines: EtlPipelineRecord[]; stats: EtlStats | null }) {
  return (
    <div className="space-y-6">
      {stats && (
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">Completed</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-600">{stats.completed}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">Failed</p>
            <p className={`mt-1 text-2xl font-semibold ${stats.failed > 0 ? 'text-red-600' : 'text-gray-900'}`}>{stats.failed}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">Running</p>
            <p className="mt-1 text-2xl font-semibold text-blue-600">{stats.running}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">Avg Duration</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{formatDuration(stats.avg_duration_ms)}</p>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {pipelines.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No data pipelines</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3">Pipeline</th>
                <th className="px-5 py-3">Source</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Records</th>
                <th className="px-5 py-3">Duration</th>
                <th className="px-5 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {pipelines.map(p => (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-5 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-5 py-3 text-gray-500">{p.source}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PIPELINE_STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-500'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500">{p.records_loaded?.toLocaleString() ?? '-'}</td>
                  <td className="px-5 py-3 text-gray-500">{formatDuration(p.duration_ms)}</td>
                  <td className="px-5 py-3 text-xs text-gray-400">{new Date(p.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// --- Audit Trail Tab ---

function AuditTrailTab({ logs, stats }: { logs: any[]; stats: any }) {
  return (
    <div className="space-y-6">
      {stats && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">Total Events</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{stats.total?.toLocaleString() ?? '-'}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">Today</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{stats.today ?? '-'}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">Entity Types</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{stats.byEntity ? Object.keys(stats.byEntity).length : '-'}</p>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {logs.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No audit logs</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3">Action</th>
                <th className="px-5 py-3">Entity</th>
                <th className="px-5 py-3">Entity ID</th>
                <th className="px-5 py-3">IP</th>
                <th className="px-5 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log: any) => (
                <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-5 py-3 font-medium text-gray-900">{log.action}</td>
                  <td className="px-5 py-3 text-gray-500">{log.entity_type}</td>
                  <td className="px-5 py-3 text-xs font-mono text-gray-400 truncate max-w-[120px]">{log.entity_id || '-'}</td>
                  <td className="px-5 py-3 text-xs text-gray-400">{log.ip_address || '-'}</td>
                  <td className="px-5 py-3 text-xs text-gray-400">{new Date(log.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
