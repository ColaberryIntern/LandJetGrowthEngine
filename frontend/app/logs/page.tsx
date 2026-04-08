'use client';

import { useState, useEffect } from 'react';
import { getAuditLogs, getAuditStats } from '@/lib/api';

interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  new_value: any;
  ip_address: string | null;
  created_at: string;
}

interface AuditStatsData {
  total: number;
  today: number;
  byEntity: Record<string, number>;
  topActions: Record<string, number>;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<AuditStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const limit = 20;

  async function fetchData() {
    setLoading(true);
    try {
      const [logsRes, statsRes] = await Promise.allSettled([
        getAuditLogs({ action: filter || undefined, limit, offset: page * limit }),
        getAuditStats(),
      ]);
      if (logsRes.status === 'fulfilled') {
        setLogs(logsRes.value.logs);
        setTotal(logsRes.value.total);
      }
      if (statsRes.status === 'fulfilled') setStats(statsRes.value);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, [page, filter]);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Logging &amp; Monitoring</h1>
      <p className="mt-1 text-sm text-gray-500">Audit trail of all system actions for security and compliance</p>

      {/* Stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Total Logs</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{stats?.total ?? '—'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Today</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{stats?.today ?? '—'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Entity Types</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{stats ? Object.keys(stats.byEntity).length : '—'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Top Action Today</p>
          <p className="mt-1 text-lg font-semibold text-gray-900 truncate">
            {stats?.topActions ? Object.keys(stats.topActions)[0] || '—' : '—'}
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="mt-6 flex items-center gap-3">
        <input
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setPage(0); }}
          placeholder="Filter by action (e.g. campaign.create)"
          className="w-64 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
        />
        <span className="text-sm text-gray-400">{total} results</span>
      </div>

      {/* Log Table */}
      <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No audit logs found</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Entity ID</th>
                <th className="px-4 py-3">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{log.action}</td>
                  <td className="px-4 py-2.5 text-gray-500">{log.entity_type}</td>
                  <td className="px-4 py-2.5 text-gray-400 font-mono text-xs truncate max-w-[120px]">
                    {log.entity_id ? log.entity_id.substring(0, 8) + '...' : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{log.ip_address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total > limit && (
        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {page + 1} of {Math.ceil(total / limit)}
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={(page + 1) * limit >= total}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
