'use client';

import { useState, useEffect } from 'react';
import { getDecisions, getDecisionStats, updateDecisionStatus, type IntelligenceDecision, type DecisionStats } from '@/lib/api';

interface ErrorRecord {
  id: string;
  campaign_id: string;
  component: string;
  severity: string;
  error_message: string;
  resolved: boolean;
  created_at: string;
}

interface Incident {
  id: string;
  title: string;
  incident_type: string;
  severity: string;
  status: string;
  created_at: string;
}

const SEV_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  error: 'bg-red-100 text-red-700',
  high: 'bg-red-100 text-red-700',
  warning: 'bg-amber-100 text-amber-700',
  medium: 'bg-amber-100 text-amber-700',
  info: 'bg-blue-100 text-blue-700',
  low: 'bg-blue-100 text-blue-700',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-100 text-red-700',
  investigating: 'bg-amber-100 text-amber-700',
  mitigated: 'bg-blue-100 text-blue-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-gray-100 text-gray-500',
};

const DECISION_STATUS_COLORS: Record<string, string> = {
  proposed: 'bg-blue-100 text-blue-700',
  approved: 'bg-emerald-100 text-emerald-700',
  executing: 'bg-amber-100 text-amber-700',
  executed: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-gray-100 text-gray-500',
  failed: 'bg-red-100 text-red-700',
  rolled_back: 'bg-red-100 text-red-700',
};

const RISK_COLORS: Record<string, string> = {
  safe: 'bg-emerald-100 text-emerald-700',
  moderate: 'bg-amber-100 text-amber-700',
  risky: 'bg-red-100 text-red-700',
  dangerous: 'bg-red-100 text-red-700',
};

export default function IncidentsPage() {
  const [tab, setTab] = useState<'errors' | 'incidents' | 'decisions'>('errors');
  const [errors, setErrors] = useState<ErrorRecord[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [decisions, setDecisions] = useState<IntelligenceDecision[]>([]);
  const [errorStats, setErrorStats] = useState<any>(null);
  const [incidentStats, setIncidentStats] = useState<any>(null);
  const [decisionStats, setDecisionStats] = useState<DecisionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  async function load() {
    try {
      const token = localStorage.getItem('token');
      const h = { Authorization: `Bearer ${token}` };
      const [eRes, eSt, iRes, iSt, dRes, dSt] = await Promise.allSettled([
        fetch('/api/admin/errors', { headers: h }).then(r => r.json()),
        fetch('/api/admin/errors/stats', { headers: h }).then(r => r.json()),
        fetch('/api/admin/incidents', { headers: h }).then(r => r.json()),
        fetch('/api/admin/incidents/stats', { headers: h }).then(r => r.json()),
        getDecisions({ limit: 25 }),
        getDecisionStats(),
      ]);
      if (eRes.status === 'fulfilled') setErrors(eRes.value.errors || []);
      if (eSt.status === 'fulfilled') setErrorStats(eSt.value);
      if (iRes.status === 'fulfilled') setIncidents(iRes.value.incidents || []);
      if (iSt.status === 'fulfilled') setIncidentStats(iSt.value);
      if (dRes.status === 'fulfilled') setDecisions((dRes.value as any).decisions || []);
      if (dSt.status === 'fulfilled') setDecisionStats(dSt.value);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleDecisionAction(id: string, status: string) {
    setUpdating(id);
    try {
      await updateDecisionStatus(id, status);
      await load();
    } catch {}
    setUpdating(null);
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Error Tracking &amp; Incidents</h1>
      <p className="mt-1 text-sm text-gray-500">Campaign errors, security incidents, and intelligence decisions</p>

      {/* Stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-5">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Unresolved Errors</p>
          <p className="mt-1 text-2xl font-semibold text-red-600">{errorStats?.unresolved ?? '-'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Errors Today</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{errorStats?.today ?? '-'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Open Incidents</p>
          <p className="mt-1 text-2xl font-semibold text-amber-600">{incidentStats?.open ?? '-'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Pending Decisions</p>
          <p className="mt-1 text-2xl font-semibold text-blue-600">{decisionStats?.proposed ?? '-'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Avg Confidence</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{decisionStats ? `${decisionStats.avg_confidence}%` : '-'}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 border-b border-gray-200">
        {([
          { key: 'errors' as const, label: `Errors (${errors.length})` },
          { key: 'incidents' as const, label: `Incidents (${incidents.length})` },
          { key: 'decisions' as const, label: `Decisions (${decisions.length})` },
        ]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
        ) : tab === 'errors' ? (
          errors.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">No errors</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-5 py-3">Component</th>
                  <th className="px-5 py-3">Severity</th>
                  <th className="px-5 py-3">Message</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {errors.map(e => (
                  <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-5 py-3 font-medium text-gray-900">{e.component}</td>
                    <td className="px-5 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEV_COLORS[e.severity] || 'bg-gray-100 text-gray-500'}`}>{e.severity}</span></td>
                    <td className="px-5 py-3 text-gray-500 truncate max-w-xs">{e.error_message}</td>
                    <td className="px-5 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${e.resolved ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{e.resolved ? 'resolved' : 'open'}</span></td>
                    <td className="px-5 py-3 text-xs text-gray-400">{new Date(e.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : tab === 'incidents' ? (
          incidents.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">No incidents</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-5 py-3">Title</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Severity</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map(i => (
                  <tr key={i.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-5 py-3 font-medium text-gray-900">{i.title}</td>
                    <td className="px-5 py-3 text-gray-500">{i.incident_type}</td>
                    <td className="px-5 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEV_COLORS[i.severity] || 'bg-gray-100 text-gray-500'}`}>{i.severity}</span></td>
                    <td className="px-5 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[i.status] || 'bg-gray-100 text-gray-500'}`}>{i.status}</span></td>
                    <td className="px-5 py-3 text-xs text-gray-400">{new Date(i.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          decisions.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">No decisions recorded</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-5 py-3">Problem</th>
                  <th className="px-5 py-3">Action</th>
                  <th className="px-5 py-3">Risk</th>
                  <th className="px-5 py-3">Confidence</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {decisions.map(d => (
                  <tr key={d.decision_id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-5 py-3 font-medium text-gray-900 max-w-xs truncate">{d.problem_detected}</td>
                    <td className="px-5 py-3 text-xs text-gray-500">{d.recommended_action.replace(/_/g, ' ')}</td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RISK_COLORS[d.risk_tier] || 'bg-gray-100 text-gray-500'}`}>
                        {d.risk_tier} ({d.risk_score})
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`font-semibold ${d.confidence_score >= 70 ? 'text-emerald-600' : d.confidence_score >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                        {d.confidence_score}%
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${DECISION_STATUS_COLORS[d.execution_status] || 'bg-gray-100 text-gray-500'}`}>
                        {d.execution_status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-400">{new Date(d.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-3">
                      {d.execution_status === 'proposed' && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleDecisionAction(d.decision_id, 'approved')}
                            disabled={updating === d.decision_id}
                            className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleDecisionAction(d.decision_id, 'rejected')}
                            disabled={updating === d.decision_id}
                            className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  );
}
