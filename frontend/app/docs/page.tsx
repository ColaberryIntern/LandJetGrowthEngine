'use client';

import { useState, useEffect, useMemo } from 'react';
import { getApiDocs, type ApiDocs, type ApiEndpoint } from '../../lib/api';

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-100 text-emerald-700',
  POST: 'bg-blue-100 text-blue-700',
  PATCH: 'bg-amber-100 text-amber-700',
  PUT: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-red-100 text-red-700',
};

export default function DocsPage() {
  const [docs, setDocs] = useState<ApiDocs | null>(null);
  const [tab, setTab] = useState<'endpoints' | 'roles'>('endpoints');
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await getApiDocs();
        setDocs(res);
      } catch {}
      setLoading(false);
    }
    load();
  }, []);

  const filteredEndpoints = useMemo(() => {
    if (!docs) return [];
    return docs.endpoints.filter(ep => {
      if (methodFilter && ep.method !== methodFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return ep.path.toLowerCase().includes(s) || ep.description.toLowerCase().includes(s);
      }
      return true;
    });
  }, [docs, search, methodFilter]);

  const methods = useMemo(() => {
    if (!docs) return [];
    return [...new Set(docs.endpoints.map(e => e.method))];
  }, [docs]);

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">API Documentation</h1>
        <p className="mt-4 text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!docs) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">API Documentation</h1>
        <p className="mt-4 text-sm text-gray-500">Failed to load documentation</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{docs.title}</h1>
          <p className="mt-1 text-sm text-gray-500">v{docs.version} -- {docs.endpoints.length} endpoints, {docs.roles.length} roles</p>
        </div>
        <span className="text-xs text-gray-400">Generated {new Date(docs.generated_at).toLocaleString()}</span>
      </div>

      {/* Stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Total Endpoints</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{docs.endpoints.length}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Roles</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{docs.roles.length}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Public</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">{docs.endpoints.filter(e => !e.auth).length}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Protected</p>
          <p className="mt-1 text-2xl font-semibold text-blue-600">{docs.endpoints.filter(e => e.auth).length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 border-b border-gray-200">
        {([
          { key: 'endpoints' as const, label: `Endpoints (${docs.endpoints.length})` },
          { key: 'roles' as const, label: `Roles (${docs.roles.length})` },
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
        {tab === 'endpoints' ? (
          <div>
            {/* Filters */}
            <div className="flex gap-3 mb-4">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search endpoints..."
                className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
              />
              <select
                value={methodFilter}
                onChange={e => setMethodFilter(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
              >
                <option value="">All Methods</option>
                {methods.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <span className="text-sm text-gray-500 self-center">{filteredEndpoints.length} results</span>
            </div>

            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <th className="px-5 py-3">Method</th>
                    <th className="px-5 py-3">Path</th>
                    <th className="px-5 py-3">Description</th>
                    <th className="px-5 py-3">Auth</th>
                    <th className="px-5 py-3">Permission</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEndpoints.map((ep, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-5 py-3">
                        <span className={`rounded px-1.5 py-0.5 text-xs font-mono font-semibold ${METHOD_COLORS[ep.method] || 'bg-gray-100 text-gray-600'}`}>
                          {ep.method}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-gray-900">{ep.path}</td>
                      <td className="px-5 py-3 text-gray-500">{ep.description}</td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ep.auth ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {ep.auth ? 'JWT' : 'public'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-400 font-mono">{ep.permission || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {docs.roles.map(role => (
              <div key={role.name} className="rounded-lg border border-gray-200 bg-white p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900">{role.name}</h3>
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                    {role.permissions.length === 1 && role.permissions[0] === '*' ? 'all' : `${role.permissions.length} permissions`}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {role.permissions.map(p => (
                    <span key={p} className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-mono text-gray-600">
                      {p}
                    </span>
                  ))}
                </div>
                <div className="mt-3 text-xs text-gray-400">
                  Accessible endpoints: {docs.endpoints.filter(ep =>
                    !ep.auth || !ep.permission ||
                    role.permissions.includes('*') ||
                    role.permissions.includes(ep.permission)
                  ).length}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
