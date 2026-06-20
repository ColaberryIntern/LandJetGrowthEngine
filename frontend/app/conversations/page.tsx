'use client';

// Conversations / responder tracker (deal-tracking Phase 2). Lists leads who
// replied to outreach with their category tag + booking flag, and lets you move
// each through the pipeline (replied -> meeting_scheduled -> proposal_sent ...)
// and jot a next action.

import { useState, useEffect, Fragment } from 'react';
import { ensureAuth } from '@/lib/auth';

interface ReplyAnalysis {
  theirReply: { subject: string | null; body: string; date: string } | null;
  actualReply: { body: string; date: string } | null;
  proposedReply: string;
  proposedError: string | null;
  similarityPct: number | null;
  learnedFrom: number;
}

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
  const [openId, setOpenId] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<Record<number, ReplyAnalysis>>({});
  const [analyzing, setAnalyzing] = useState<number | null>(null);

  async function toggleAnalysis(id: number) {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (analysis[id]) return;
    setAnalyzing(id);
    try {
      const res = await fetch(`/api/admin/conversations/${id}/reply-analysis`, { headers: authHeaders() });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Analysis failed');
      const data = await res.json();
      setAnalysis(prev => ({ ...prev, [id]: data }));
    } catch (e) { setError((e as Error).message); }
    finally { setAnalyzing(null); }
  }

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
                <Fragment key={r.id}>
                <tr className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <button onClick={() => toggleAnalysis(r.id)} className="text-left">
                      <div className="text-xs font-semibold text-gray-900 underline decoration-dotted decoration-gray-300">{r.name} {openId === r.id ? '▾' : '▸'}</div>
                      <div className="text-xs text-gray-500">{r.company || r.email}</div>
                    </button>
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
                {openId === r.id && (
                  <tr className="bg-gray-50">
                    <td colSpan={6} className="px-5 py-4">
                      {analyzing === r.id ? (
                        <div className="text-xs text-gray-400">Analyzing reply & drafting what we'd send…</div>
                      ) : analysis[r.id] ? (
                        <div>
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <div className="rounded border border-gray-200 bg-white p-3">
                              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">They replied</div>
                              <div className="mt-1 whitespace-pre-wrap text-xs text-gray-800">{analysis[r.id].theirReply?.body || '(none)'}</div>
                            </div>
                            <div className="rounded border border-blue-200 bg-blue-50 p-3">
                              <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">What we'd reply (AI)</div>
                              <div className="mt-1 whitespace-pre-wrap text-xs text-gray-800">{analysis[r.id].proposedReply || `(${analysis[r.id].proposedError || 'no draft'})`}</div>
                            </div>
                            <div className="rounded border border-emerald-200 bg-emerald-50 p-3">
                              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">What Ryan actually sent</div>
                              <div className="mt-1 whitespace-pre-wrap text-xs text-gray-800">{analysis[r.id].actualReply?.body || '(no reply sent yet)'}</div>
                            </div>
                          </div>
                          <div className="mt-2 text-xs text-gray-500">
                            {analysis[r.id].similarityPct != null
                              ? <>AI proposal vs Ryan&apos;s actual: <span className="font-semibold text-gray-800">{analysis[r.id].similarityPct}% similar</span>. </>
                              : <>No actual reply to compare against yet. </>}
                            Learned from {analysis[r.id].learnedFrom} past reply example{analysis[r.id].learnedFrom === 1 ? '' : 's'} (improves as more replies are sent).
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400">No analysis.</div>
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
