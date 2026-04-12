'use client';

import { useState, useEffect } from 'react';

interface Deployment {
  id: string;
  version: string;
  environment: string;
  status: string;
  description: string | null;
  changes: string[] | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  created_at: string;
}

interface Stats {
  total: number;
  deployed: number;
  failed: number;
  rolled_back: number;
  success_rate: number;
}

const STATUS_COLORS: Record<string, string> = {
  planned: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  deployed: 'bg-emerald-100 text-emerald-700',
  rolled_back: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
};

export default function DeploymentsPage() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      try {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const [dRes, sRes] = await Promise.allSettled([
          window.fetch('/api/admin/deployments', { headers }).then(r => r.json()),
          window.fetch('/api/admin/deployments/stats', { headers }).then(r => r.json()),
        ]);
        if (dRes.status === 'fulfilled') setDeployments(dRes.value.deployments || []);
        if (sRes.status === 'fulfilled') setStats(sRes.value);
      } catch {}
      setLoading(false);
    }
    fetch();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Deployments &amp; Version Control</h1>
      <p className="mt-1 text-sm text-gray-500">Track system deployments across environments</p>

      {/* Stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Total</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{stats?.total ?? '—'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Deployed</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">{stats?.deployed ?? '—'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Failed</p>
          <p className="mt-1 text-2xl font-semibold text-red-600">{stats?.failed ?? '—'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Success Rate</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{stats ? `${stats.success_rate}%` : '—'}</p>
        </div>
      </div>

      {/* Deployments Table */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">History</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
          ) : deployments.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">No deployments recorded</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-5 py-3">Version</th>
                  <th className="px-5 py-3">Environment</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Duration</th>
                </tr>
              </thead>
              <tbody>
                {deployments.map((d) => (
                  <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-5 py-3 font-medium text-gray-900">{d.version}</td>
                    <td className="px-5 py-3 text-gray-500">{d.environment}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[d.status] || 'bg-gray-100 text-gray-500'}`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{new Date(d.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{d.duration_ms ? `${Math.round(d.duration_ms / 1000)}s` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
