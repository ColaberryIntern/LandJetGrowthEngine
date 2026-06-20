'use client';

// Conversations / responder tracker (deal-tracking Phase 2). Lists leads who
// replied to outreach with their category tag + booking flag, and lets you move
// each through the pipeline (replied -> meeting_scheduled -> proposal_sent ...)
// and jot a next action.

import { useState, useEffect } from 'react';
import { ensureAuth } from '@/lib/auth';

interface Responder {
  id: number;
  name: string;
  email: string;
  company: string | null;
  pipeline_stage: string;
  next_action: string;
  deal_amount: number | null;
  tag: string;
  tone: 'meet' | 'interested' | 'question' | 'negative' | 'auto' | 'neutral';
  booked: boolean;
  last_reply_day: string;
}

const TONE_CLASS: Record<Responder['tone'], string> = {
  meet: 'bg-emerald-100 text-emerald-700',
  interested: 'bg-teal-100 text-teal-700',
  question: 'bg-amber-100 text-amber-700',
  negative: 'bg-red-100 text-red-700',
  auto: 'bg-gray-100 text-gray-600',
  neutral: 'bg-blue-100 text-blue-700',
};

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export default function ConversationsPage() {
  const [responders, setResponders] = useState<Responder[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      await ensureAuth();
      try {
        const res = await fetch('/api/admin/conversations', { headers: authHeaders() });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load');
        const data = await res.json();
        setResponders(data.responders);
        setStages(data.stages || []);
      } catch (e) { setError((e as Error).message); }
      setLoading(false);
    })();
  }, []);

  async function save(id: number, patch: { pipeline_stage?: string; next_action?: string; deal_amount?: number | null }) {
    setSavingId(id);
    setResponders(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r)); // optimistic
    try {
      const res = await fetch(`/api/admin/conversations/${id}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(patch) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Save failed');
      setNotice('Saved'); setTimeout(() => setNotice(null), 2000);
    } catch (e) { setError((e as Error).message); }
    finally { setSavingId(null); }
  }

  const counts = stages.map(s => ({ s, n: responders.filter(r => r.pipeline_stage === s).length })).filter(x => x.n > 0);
  const wonTotal = responders.filter(r => r.pipeline_stage === 'enrolled').reduce((a, r) => a + (r.deal_amount || 0), 0);

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conversations</h1>
        <p className="mt-1 text-sm text-gray-500">{responders.length} leads have replied. Tag them by what they need and move them through the pipeline.</p>
      </div>

      {counts.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {counts.map(c => (
            <span key={c.s} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">{c.s.replace(/_/g, ' ')}: {c.n}</span>
          ))}
          {wonTotal > 0 && (
            <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white">Won: ${wonTotal.toLocaleString()}</span>
          )}
        </div>
      )}

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

      {loading ? (
        <p className="mt-6 text-sm text-gray-400">Loading…</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                <th className="px-5 py-2 font-medium">Lead</th>
                <th className="px-5 py-2 font-medium">Reply</th>
                <th className="px-5 py-2 font-medium">Stage</th>
                <th className="px-5 py-2 font-medium">Deal $</th>
                <th className="px-5 py-2 font-medium">Next action</th>
                <th className="px-5 py-2 font-medium">Last reply</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {responders.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <div className="text-xs font-semibold text-gray-900">{r.name}</div>
                    <div className="text-xs text-gray-500">{r.company || r.email}</div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASS[r.tone]}`}>{r.tag}</span>
                    {r.booked && <span className="ml-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">✓ Booking</span>}
                  </td>
                  <td className="px-5 py-3">
                    <select value={r.pipeline_stage} disabled={savingId === r.id}
                      onChange={e => save(r.id, { pipeline_stage: e.target.value })}
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-xs">
                      {stages.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                    </select>
                  </td>
                  <td className="px-5 py-3">
                    <input type="number" min="0" defaultValue={r.deal_amount ?? ''} disabled={savingId === r.id}
                      onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== (r.deal_amount ?? null)) save(r.id, { deal_amount: v }); }}
                      placeholder="$"
                      className="w-24 rounded border border-gray-300 px-2 py-1 text-xs focus:border-gray-400 focus:outline-none" />
                  </td>
                  <td className="px-5 py-3">
                    <input type="text" defaultValue={r.next_action} disabled={savingId === r.id}
                      onBlur={e => { if (e.target.value !== r.next_action) save(r.id, { next_action: e.target.value }); }}
                      placeholder="Next step…"
                      className="w-44 rounded border border-gray-300 px-2 py-1 text-xs focus:border-gray-400 focus:outline-none" />
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-400">{r.last_reply_day}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
