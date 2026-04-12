'use client';

import { useState, useEffect } from 'react';

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

export default function IncidentsPage() {
  const [tab, setTab] = useState<'errors' | 'incidents'>('errors');
  const [errors, setErrors] = useState<ErrorRecord[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [errorStats, setErrorStats] = useState<any>(null);
  const [incidentStats, setIncidentStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const token = localStorage.getItem('token');
        const h = { Authorization: `Bearer ${token}` };
        const [eRes, eSt, iRes, iSt] = await Promise.allSettled([
          fetch('/api/admin/errors', { headers: h }).then(r => r.json()),
          fetch('/api/admin/errors/stats', { headers: h }).then(r => r.json()),
          fetch('/api/admin/incidents', { headers: h }).then(r => r.json()),
          fetch('/api/admin/incidents/stats', { headers: h }).then(r => r.json()),
        ]);
        if (eRes.status === 'fulfilled') setErrors(eRes.value.errors || []);
        if (eSt.status === 'fulfilled') setErrorStats(eSt.value);
        if (iRes.status === 'fulfilled') setIncidents(iRes.value.incidents || []);
        if (iSt.status === 'fulfilled') setIncidentStats(iSt.value);
      } catch {}
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Error Tracking &amp; Incidents</h1>
      <p className="mt-1 text-sm text-gray-500">Campaign errors and security incidents</p>

      {/* Stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Unresolved Errors</p>
          <p className="mt-1 text-2xl font-semibold text-red-600">{errorStats?.unresolved ?? '—'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Errors Today</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{errorStats?.today ?? '—'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Open Incidents</p>
          <p className="mt-1 text-2xl font-semibold text-amber-600">{incidentStats?.open ?? '—'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Critical</p>
          <p className="mt-1 text-2xl font-semibold text-red-600">{incidentStats?.critical ?? '—'}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 border-b border-gray-200">
        {(['errors', 'incidents'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t === 'errors' ? `Errors (${errors.length})` : `Incidents (${incidents.length})`}
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
        ) : (
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
        )}
      </div>
    </div>
  );
}
