'use client';

import { useState, useEffect } from 'react';
import { ensureAuth } from '@/lib/auth';

type Role = 'admin' | 'manager' | 'user';
type Status = 'active' | 'inactive' | 'suspended';

interface UserRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  status: Status;
  // 2026-06-14 refactor: per-user state scope lives on default_filters.states
  // (string[] of 2-letter codes). Empty / missing = sees all. Replaces the
  // 3-value territory_default enum so the model scales to N owners.
  default_filters: { states?: string[]; [k: string]: unknown };
  last_login_at: string | null;
  created_at: string;
}

interface ListResponse { users: UserRow[]; total: number; }

const API_BASE = '/api/admin/user-management';

const ROLE_OPTIONS: Role[] = ['admin', 'manager', 'user'];
const STATUS_OPTIONS: Status[] = ['active', 'inactive', 'suspended'];

const STATUS_BADGE: Record<Status, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  inactive: 'bg-gray-100 text-gray-700',
  suspended: 'bg-red-100 text-red-800',
};

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function getStates(u: UserRow): string[] {
  const raw = u.default_filters?.states;
  return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === 'string') : [];
}

function parseStatesInput(s: string): string[] {
  return Array.from(new Set(
    s.split(/[,\s]+/).map(t => t.trim().toUpperCase()).filter(t => /^[A-Z]{2}$/.test(t)),
  ));
}

interface CreateForm {
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  states_input: string; // raw text the user types; parsed on submit
}

const EMPTY_FORM: CreateForm = {
  email: '',
  first_name: '',
  last_name: '',
  role: 'user',
  states_input: '',
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);

  const [savingField, setSavingField] = useState<{ id: string; field: 'role' | 'status' | 'states' } | null>(null);
  // Track in-progress text edits for the states column so the user can type
  // freely before we PATCH. Empty key = not editing.
  const [statesDraft, setStatesDraft] = useState<Record<string, string>>({});

  async function fetchList() {
    setLoading(true);
    try {
      const r = await fetch(API_BASE, { headers: authHeaders() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: ListResponse = await r.json();
      setUsers(data.users);
      setTotal(data.total);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally { setLoading(false); }
  }

  useEffect(() => { (async () => { await ensureAuth(); await fetchList(); })(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const states = parseStatesInput(createForm.states_input);
      const body = {
        email: createForm.email,
        first_name: createForm.first_name,
        last_name: createForm.last_name,
        role: createForm.role,
        states,
      };
      const r = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      });
      const resBody = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((resBody as { error?: string }).error || `HTTP ${r.status}`);

      setTempPassword({ email: createForm.email.trim().toLowerCase(), password: resBody.temp_password });
      setShowCreate(false);
      setCreateForm(EMPTY_FORM);
      setNotice(`User ${createForm.email} created. Temp password shown below for one-time handoff.`);
      setTimeout(() => setNotice(null), 6000);
      await fetchList();
    } catch (e) {
      setCreateError((e as Error).message);
    } finally { setCreating(false); }
  }

  async function patchField(id: string, field: 'role' | 'status' | 'states', value: string | string[]) {
    setSavingField({ id, field });
    setError(null);
    try {
      const path = `/${id}/${field}`;
      const body = field === 'states'
        ? { states: value as string[] }
        : { [field]: value };
      const r = await fetch(`${API_BASE}${path}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((data as { error?: string }).error || `HTTP ${r.status}`);
      setUsers(prev => prev.map(u => {
        if (u.id !== id) return u;
        if (field === 'role') return { ...u, role: value as Role };
        if (field === 'status') return { ...u, status: value as Status };
        return { ...u, default_filters: { ...(u.default_filters || {}), states: value as string[] } };
      }));
      if (field === 'states') {
        setStatesDraft(prev => { const next = { ...prev }; delete next[id]; return next; });
      }
    } catch (e) {
      setError(`Update ${field}: ${(e as Error).message}`);
    } finally { setSavingField(null); }
  }

  function commitStatesDraft(u: UserRow) {
    const draft = statesDraft[u.id];
    if (draft === undefined) return;
    const parsed = parseStatesInput(draft);
    const current = getStates(u);
    // No-op if the parsed list matches what we already have
    if (parsed.length === current.length && parsed.every((s, i) => s === current[i])) {
      setStatesDraft(prev => { const next = { ...prev }; delete next[u.id]; return next; });
      return;
    }
    void patchField(u.id, 'states', parsed);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Account Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage who can log in, what role they hold, and which states they default to filtering by. Empty states = sees all leads (full visibility). One or more 2-letter codes (e.g., <code>TX</code>, <code>TX, IA</code>) scopes the Outreach screen to those states.
          </p>
        </div>
        <button onClick={() => { setShowCreate(true); setCreateError(null); }}
          className="shrink-0 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
          + Create user
        </button>
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>}
      {notice && <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{notice}</div>}

      {tempPassword && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm text-amber-900">
              <strong>Temp password for {tempPassword.email}:</strong>{' '}
              <code className="ml-1 rounded bg-white px-2 py-0.5 font-mono text-amber-900 ring-1 ring-amber-300">{tempPassword.password}</code>
              <p className="mt-1 text-xs text-amber-800">Shown once. Hand it off to the user out-of-band (Slack DM, in person, password manager share). They should change it on first login.</p>
            </div>
            <button onClick={() => setTempPassword(null)} className="shrink-0 text-xs font-medium text-amber-700 hover:text-amber-900">Dismiss</button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="border-b border-gray-200 px-5 py-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Users ({total})</h2>
          <button onClick={fetchList} className="text-xs text-blue-600 hover:text-blue-800">Refresh</button>
        </div>
        {loading ? (
          <div className="p-5 text-sm text-gray-500">Loading…</div>
        ) : users.length === 0 ? (
          <div className="p-5 text-sm text-gray-500">No users yet. Use the Create user button above to provision the first one.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                <th className="px-5 py-2 font-medium">Email</th>
                <th className="px-5 py-2 font-medium">Name</th>
                <th className="px-5 py-2 font-medium">Role</th>
                <th className="px-5 py-2 font-medium">Status</th>
                <th className="px-5 py-2 font-medium">States</th>
                <th className="px-5 py-2 font-medium">Last login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => {
                const saving = savingField?.id === u.id;
                const current = getStates(u);
                const draft = statesDraft[u.id];
                const displayValue = draft !== undefined ? draft : current.join(', ');
                return (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-mono text-xs text-gray-900">{u.email}</td>
                    <td className="px-5 py-3 text-xs text-gray-700">{u.first_name} {u.last_name}</td>
                    <td className="px-5 py-3 text-xs">
                      <select value={u.role}
                        onChange={e => patchField(u.id, 'role', e.target.value)}
                        disabled={saving && savingField?.field === 'role'}
                        className="rounded border border-gray-300 bg-white px-2 py-1 text-xs">
                        {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td className="px-5 py-3 text-xs">
                      <select value={u.status}
                        onChange={e => patchField(u.id, 'status', e.target.value)}
                        disabled={saving && savingField?.field === 'status'}
                        className={`rounded px-2 py-1 text-xs ${STATUS_BADGE[u.status]} border-0`}>
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="px-5 py-3 text-xs">
                      <input type="text" value={displayValue}
                        placeholder="empty = sees all"
                        onChange={e => setStatesDraft(prev => ({ ...prev, [u.id]: e.target.value }))}
                        onBlur={() => commitStatesDraft(u)}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        disabled={saving && savingField?.field === 'states'}
                        className="w-32 rounded border border-gray-300 bg-white px-2 py-1 text-xs font-mono uppercase" />
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-600">{fmtDate(u.last_login_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !creating && setShowCreate(false)}>
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Create user</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input type="email" required value={createForm.email}
                  onChange={e => setCreateForm({ ...createForm, email: e.target.value })}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">First name</label>
                  <input type="text" required value={createForm.first_name}
                    onChange={e => setCreateForm({ ...createForm, first_name: e.target.value })}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Last name</label>
                  <input type="text" required value={createForm.last_name}
                    onChange={e => setCreateForm({ ...createForm, last_name: e.target.value })}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
                <select value={createForm.role}
                  onChange={e => setCreateForm({ ...createForm, role: e.target.value as Role })}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
                  {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Default states</label>
                <input type="text" value={createForm.states_input}
                  onChange={e => setCreateForm({ ...createForm, states_input: e.target.value })}
                  placeholder="e.g., TX or TX, IA -- leave empty for full visibility"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono uppercase" />
                <p className="mt-1 text-xs text-gray-500">Comma-separated 2-letter codes. Empty = sees all leads (admin / Ryan-style visibility).</p>
              </div>

              {createError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{createError}</div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} disabled={creating}
                  className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50">
                  Cancel
                </button>
                <button type="submit" disabled={creating}
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
