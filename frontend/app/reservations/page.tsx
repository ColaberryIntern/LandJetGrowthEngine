'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  getReservations, ingestReservations, sendReservationQuote,
  generateReservationDraft, saveReservationDraft, setReservationLifecycle,
  getReservationConversation,
  type ReservationQuoteRow, type ReservationConversationMessage,
} from '@/lib/api';
import { ensureAuth } from '@/lib/auth';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  auto_ready:   { label: 'Auto ready',   cls: 'bg-emerald-100 text-emerald-700' },
  needs_review: { label: 'Needs review', cls: 'bg-amber-100 text-amber-700' },
  forward:      { label: 'Forward',      cls: 'bg-blue-100 text-blue-700' },
  manual:       { label: 'Manual',       cls: 'bg-gray-100 text-gray-600' },
};

// Operational lifecycle drives the row color so what needs a human is obvious
// the instant the screen opens.
const LIFECYCLE_META: Record<string, { label: string; chip: string; bar: string; card: string }> = {
  needs_reply:       { label: 'Needs reply',  chip: 'bg-rose-100 text-rose-700',     bar: 'bg-rose-500',    card: 'border-rose-200 bg-rose-50/40' },
  awaiting_customer: { label: 'Awaiting customer', chip: 'bg-amber-100 text-amber-800', bar: 'bg-amber-400', card: 'border-amber-200 bg-white' },
  booked:            { label: 'Booked',       chip: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500', card: 'border-emerald-200 bg-emerald-50/40' },
  closed:            { label: 'Closed',       chip: 'bg-gray-200 text-gray-600',     bar: 'bg-gray-300',    card: 'border-gray-200 bg-gray-50 opacity-75' },
};

const LIFECYCLE_FILTERS = [
  { key: 'needs_reply', label: 'Needs reply' },
  { key: 'awaiting_customer', label: 'Awaiting' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
] as const;

const POLL_MS = 20000;

function lifecycleOf(r: ReservationQuoteRow): string { return r.lifecycle || 'needs_reply'; }

function timeAgo(s?: string | null): string {
  if (!s) return '';
  const diff = Date.now() - new Date(s).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function money(v: string | number | null | undefined): string {
  if (v == null) return '--';
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : '--';
}

function mapSrc(pickup?: string, dropoff?: string): string | null {
  if (!pickup || !dropoff) return null;
  return `https://maps.google.com/maps?saddr=${encodeURIComponent(pickup)}&daddr=${encodeURIComponent(dropoff)}&output=embed`;
}

function apptRelative(dateStr?: string, startTime?: string): { text: string; cls: string } | null {
  if (!dateStr) return null;
  const m = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]), 12, 0, 0);
  if (startTime) {
    const t = startTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (t) { let h = Number(t[1]) % 12; if (/pm/i.test(t[3] || '')) h += 12; d.setHours(h, Number(t[2]), 0, 0); }
  }
  const diff = d.getTime() - Date.now();
  const hrs = diff / 3600000;
  const days = Math.round(hrs / 24);
  if (diff < 0) return { text: 'Trip passed', cls: 'bg-rose-100 text-rose-700' };
  if (hrs < 24) { const h = Math.max(1, Math.round(hrs)); return { text: `Trip in ${h} hr${h === 1 ? '' : 's'}`, cls: 'bg-rose-100 text-rose-700' }; }
  if (hrs < 48) return { text: 'Trip tomorrow', cls: 'bg-amber-100 text-amber-800' };
  if (days <= 7) return { text: `Trip in ${days} days`, cls: 'bg-amber-50 text-amber-700' };
  return { text: `Trip in ${days} days`, cls: 'bg-gray-100 text-gray-600' };
}

function tagsFor(r: ReservationQuoteRow): { label: string; cls: string }[] {
  const out: { label: string; cls: string }[] = [];
  const q = r.result?.quote || {};
  const trip = r.result?.trip || {};
  const svc = q.service_type || trip.service_type;
  if (svc) {
    const map: Record<string, [string, string]> = {
      one_way: ['One way', 'bg-sky-100 text-sky-700'],
      round_trip: ['Round trip', 'bg-indigo-100 text-indigo-700'],
      hourly: ['Hourly', 'bg-teal-100 text-teal-700'],
      hourly_local: ['Hourly', 'bg-teal-100 text-teal-700'],
    };
    const [label, cls] = map[svc] || [String(svc).replace(/_/g, ' '), 'bg-gray-100 text-gray-600'];
    out.push({ label, cls });
  }
  const mkt = q.market || r.market;
  if (mkt) out.push({ label: `\u{1F4CD} ${mkt.replace(/_/g, ' ')}`, cls: 'bg-slate-100 text-slate-600' });
  const cat = q.customer_category;
  if (cat && cat !== 'standard') {
    const nice: Record<string, string> = { jd_employee: 'JD Employee', jd_shuttle: 'JD Shuttle', lockton_employee: 'Lockton', investor: 'Investor', lj_member: 'LJ Member' };
    out.push({ label: `★ ${nice[cat] || cat}`, cls: 'bg-emerald-100 text-emerald-700' });
  }
  const warns = (q.warnings || []).join(' ').toLowerCase();
  if (/overnight/.test(warns)) out.push({ label: 'Overnight', cls: 'bg-amber-100 text-amber-800' });
  if (/dead\s?leg/.test(warns)) out.push({ label: 'Dead leg', cls: 'bg-amber-100 text-amber-800' });
  if (/second driver|2nd driver|over\s?10|per diem/.test(warns)) out.push({ label: 'Long / 2-driver', cls: 'bg-amber-100 text-amber-800' });
  if ((q.approvals_needed || []).length > 0 || /approval/.test(warns)) out.push({ label: 'Needs approval', cls: 'bg-rose-100 text-rose-700' });
  if (r.status === 'forward') out.push({ label: 'Forward to local team', cls: 'bg-rose-100 text-rose-700' });
  if (r.result?.source === 'nl') out.push({ label: '\u{1F916} AI-extracted · verify', cls: 'bg-purple-100 text-purple-700' });
  return out;
}

function mailboxLabel(m?: string | null): string {
  if (!m) return '';
  if (m.startsWith('ljreservations')) return 'Reservations desk';
  if (m.startsWith('rlandry')) return "Ryan's inbox";
  if (m.startsWith('percy') || m.startsWith('pkapadia')) return "Percy's inbox";
  if (m.startsWith('gnecker')) return "Grant's inbox";
  return m.split('@')[0];
}

function scoreCls(s: number): string {
  if (s >= 0.85) return 'text-emerald-600';
  if (s >= 0.6) return 'text-amber-600';
  return 'text-rose-600';
}

const RUBRIC_LABELS: Record<string, string> = {
  has_greeting: 'Greeting', has_signoff: 'Sign-off', length_ok: 'Length',
  no_emdash: 'No em dash', tone_matched: 'Account voice', includes_price: 'Price stated',
  addresses_route: 'Route named',
};

export default function ReservationsPage() {
  const [rows, setRows] = useState<ReservationQuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('needs_reply');
  const [openId, setOpenId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Per-row UI state, kept separate from server rows so live polling never
  // clobbers an in-progress edit.
  const [drafts, setDrafts] = useState<Record<number, { subject: string; text: string }>>({});
  const [busy, setBusy] = useState<Record<number, string>>({}); // id -> action label
  const [sendResult, setSendResult] = useState<Record<number, { sent: boolean; from: string | null; to: string | null }>>({});
  const [convs, setConvs] = useState<Record<number, ReservationConversationMessage[]>>({});
  const editingRef = useRef(false);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await getReservations({}); // pull all; filter client-side for instant tab switching + live stats
      setRows(res.reservations || []);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { (async () => { await ensureAuth(); await load(); })(); }, [load]);

  // Live auto-refresh. Skips a beat while the operator is editing a draft.
  useEffect(() => {
    const t = setInterval(() => { if (!editingRef.current) load(false); }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  async function refreshFromMailbox() {
    setRefreshing(true);
    try { await ingestReservations(168); await load(false); }
    catch (e) { setError((e as Error).message); }
    finally { setRefreshing(false); }
  }

  function setBusyFor(id: number, label: string | null) {
    setBusy(prev => { const n = { ...prev }; if (label) n[id] = label; else delete n[id]; return n; });
  }

  async function handleGenerate(id: number) {
    setBusyFor(id, 'Writing reply...');
    try {
      const { draft } = await generateReservationDraft(id);
      setDrafts(prev => ({ ...prev, [id]: { subject: draft.subject, text: draft.text } }));
      await load(false);
    } catch (e) { setError((e as Error).message); }
    finally { setBusyFor(id, null); }
  }

  async function handleSaveDraft(id: number) {
    const d = drafts[id]; if (!d) return;
    setBusyFor(id, 'Saving...');
    try { await saveReservationDraft(id, d.subject, d.text); editingRef.current = false; await load(false); }
    catch (e) { setError((e as Error).message); }
    finally { setBusyFor(id, null); }
  }

  async function handleSend(id: number) {
    setBusyFor(id, 'Sending...');
    try {
      const r = await sendReservationQuote(id);
      setSendResult(prev => ({ ...prev, [id]: { sent: r.sent, from: r.from, to: r.to } }));
      await load(false);
    } catch (e) { setError((e as Error).message); }
    finally { setBusyFor(id, null); }
  }

  async function handleLifecycle(id: number, lifecycle: 'needs_reply' | 'awaiting_customer' | 'booked' | 'closed') {
    setBusyFor(id, 'Updating...');
    try { await setReservationLifecycle(id, lifecycle); await load(false); }
    catch (e) { setError((e as Error).message); }
    finally { setBusyFor(id, null); }
  }

  async function handleConversation(id: number) {
    setBusyFor(id, 'Loading thread...');
    try { const { messages } = await getReservationConversation(id); setConvs(prev => ({ ...prev, [id]: messages })); }
    catch (e) { setError((e as Error).message); }
    finally { setBusyFor(id, null); }
  }

  // Client-side filter + live stats from the full set.
  const visible = rows.filter(r => {
    const lc = lifecycleOf(r);
    if (filter === 'all') return true;
    if (filter === 'resolved') return lc === 'booked' || lc === 'closed';
    return lc === filter;
  });
  const stats = {
    needs_reply: rows.filter(r => lifecycleOf(r) === 'needs_reply').length,
    awaiting_customer: rows.filter(r => lifecycleOf(r) === 'awaiting_customer').length,
    booked: rows.filter(r => lifecycleOf(r) === 'booked').length,
    pipelineValue: rows.filter(r => !['closed'].includes(lifecycleOf(r))).reduce((a, r) => a + (parseFloat(r.quote_total || '0') || 0), 0),
  };
  const counts: Record<string, number> = {
    needs_reply: stats.needs_reply,
    awaiting_customer: stats.awaiting_customer,
    resolved: rows.filter(r => ['booked', 'closed'].includes(lifecycleOf(r))).length,
    all: rows.length,
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-start justify-between mb-1">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-gray-900">Reservations</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </span>
              Live
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Inbound quote requests across every mailbox, priced and drafted automatically. Replies go out from the account each request arrived on.
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {lastUpdated ? `Updated ${timeAgo(lastUpdated.toISOString())} · auto-refreshing` : 'Loading...'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/reservations/dashboard" className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">&#128202; Dashboard</Link>
          <Link href="/reservations/test" className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">&#129514; Test a quote</Link>
          <button onClick={refreshFromMailbox} disabled={refreshing}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50">
            {refreshing ? 'Checking mailboxes...' : 'Refresh now'}
          </button>
        </div>
      </div>

      {/* Live stat strip */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Need a reply', value: stats.needs_reply, cls: 'text-rose-600', sub: 'waiting on us' },
          { label: 'Awaiting customer', value: stats.awaiting_customer, cls: 'text-amber-600', sub: 'we replied' },
          { label: 'Booked', value: stats.booked, cls: 'text-emerald-600', sub: 'resolved' },
          { label: 'Open pipeline', value: money(stats.pipelineValue), cls: 'text-gray-900', sub: 'unresolved value' },
        ].map((s, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <div className={`text-2xl font-semibold ${s.cls}`}>{s.value}</div>
            <div className="text-xs font-medium text-gray-700">{s.label}</div>
            <div className="text-[11px] text-gray-400">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {LIFECYCLE_FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${filter === f.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {f.label} ({counts[f.key] ?? 0})
          </button>
        ))}
      </div>

      {error && <div className="mt-4 rounded-md bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>}

      {loading ? (
        <div className="mt-8 text-sm text-gray-400">Loading...</div>
      ) : visible.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
          Nothing here right now. {filter === 'needs_reply' ? 'No requests are waiting on a reply — nice.' : 'Try another filter or Refresh now.'}
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {visible.map(r => {
            const meta = STATUS_META[r.status] || STATUS_META.manual;
            const lc = lifecycleOf(r);
            const lcMeta = LIFECYCLE_META[lc] || LIFECYCLE_META.needs_reply;
            const trip = r.result?.trip;
            const quote = r.result?.quote;
            const open = openId === r.id;
            const canSend = r.status === 'auto_ready' || r.status === 'needs_review';
            const route = mapSrc(trip?.pickup_address, trip?.dropoff_address);
            const appt = apptRelative(trip?.date_of_service, (trip as { start_time?: string })?.start_time);
            const tg = tagsFor(r);
            const replyFrom = r.reply_from || r.mailbox || null;
            const draft = drafts[r.id] || (r.ai_draft ? { subject: r.ai_draft.subject, text: r.ai_draft.text } : null);
            const rubric = r.ai_draft?.rubric;
            const sr = sendResult[r.id];
            const conv = convs[r.id];
            const actionBusy = busy[r.id];

            return (
              <div key={r.id} className={`overflow-hidden rounded-lg border ${lcMeta.card}`}>
                <div className="flex items-stretch">
                  <div className={`w-1.5 shrink-0 ${lcMeta.bar}`} />
                  <div className="flex min-w-0 flex-1 items-stretch gap-3 px-4 py-3">
                    <button onClick={() => setOpenId(open ? null : r.id)} className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${lcMeta.chip}`}>{lcMeta.label}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                        {appt && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${appt.cls}`}>{appt.text}</span>}
                        <span className="text-xs text-gray-400">received {timeAgo(r.received_at)}</span>
                        {replyFrom && <span className="text-[11px] text-gray-400">· via {mailboxLabel(replyFrom)}</span>}
                      </div>
                      <div className="mt-1 truncate font-medium text-gray-900">{r.subject || '(no subject)'}</div>
                      <div className="truncate text-sm text-gray-500">{r.from_email}</div>
                      {tg.length > 0 && (
                        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                          {tg.map((t, i) => <span key={i} className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${t.cls}`}>{t.label}</span>)}
                        </div>
                      )}
                      <div className="mt-1.5 flex items-center gap-2 flex-wrap text-xs">
                        {r.our_reply_at && <span className="text-gray-500">We replied {timeAgo(r.our_reply_at)}</span>}
                        {r.responded_at && <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">&#9989; Customer replied {timeAgo(r.responded_at)}</span>}
                        {r.ai_draft && !r.our_reply_at && <span className="rounded-full bg-violet-100 px-2 py-0.5 font-medium text-violet-700">&#9999;&#65039; Draft ready</span>}
                      </div>
                    </button>
                    {route && <iframe src={route} title={`route-${r.id}`} loading="lazy" className="hidden sm:block w-44 h-24 shrink-0 rounded border border-gray-200" />}
                    <button onClick={() => setOpenId(open ? null : r.id)} className="text-right shrink-0 self-center">
                      <div className="text-lg font-semibold text-gray-900">{money(r.quote_total)}</div>
                      <div className="text-xs text-gray-400">{open ? 'Hide' : 'Open'}</div>
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="border-t border-gray-100 bg-white px-4 py-3 space-y-4">
                    {/* Trip + quote */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="text-sm">
                        <div className="font-medium text-gray-700">{r.result?.source === 'nl' ? 'Extracted from a free-form email (AI)' : 'Trip'}</div>
                        {(trip?.pickup_address || trip?.dropoff_address) ? (
                          <div className="text-gray-600">{trip?.pickup_address || '(no pickup)'} &rarr; {trip?.dropoff_address || '(no dropoff)'}</div>
                        ) : <div className="text-xs text-amber-700">No pickup/dropoff in the email.</div>}
                        <div className="text-gray-400 text-xs mt-0.5">
                          {[trip?.passenger_name, trip?.service_type, trip?.date_of_service, trip?.passengers != null ? `${trip?.passengers} pax` : null].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      {quote ? (
                        <div className="text-sm">
                          <div className="font-medium text-gray-700">Quote</div>
                          {Array.isArray(quote.lines) && quote.lines.map((l, i) => (
                            <div key={i} className="flex justify-between text-gray-600"><span>{l.label}</span><span>{money(l.amount)}</span></div>
                          ))}
                          <div className="mt-1 flex justify-between border-t border-gray-100 pt-1 font-semibold text-gray-900"><span>Total</span><span>{money(quote.grand_total)}</span></div>
                          {Array.isArray(quote.warnings) && quote.warnings.length > 0 && (
                            <ul className="mt-2 list-disc pl-5 text-xs text-amber-700">{quote.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                          )}
                        </div>
                      ) : <div className="text-sm text-gray-500">Not a structured quote ({r.result?.manual_reason || r.mode}).</div>}
                    </div>

                    {/* AI reply composer */}
                    {canSend && (
                      <div className="rounded-md border border-gray-200 bg-gray-50/60 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium text-gray-700">AI reply {replyFrom && <span className="font-normal text-gray-500">— sends from {replyFrom} ({mailboxLabel(replyFrom)})</span>}</div>
                          {rubric && (
                            <div className="flex items-center gap-1 text-xs">
                              <span className="text-gray-400">match score</span>
                              <span className={`text-base font-bold ${scoreCls(rubric.score)}`}>{Math.round(rubric.score * 100)}</span>
                            </div>
                          )}
                        </div>
                        {rubric && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {Object.entries(rubric.breakdown).map(([k, v]) => (
                              <span key={k} className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${v ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'}`}>
                                {v ? '✓' : '×'} {RUBRIC_LABELS[k] || k}
                              </span>
                            ))}
                          </div>
                        )}
                        {!draft ? (
                          <button onClick={() => handleGenerate(r.id)} disabled={!!actionBusy}
                            className="mt-2 rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">
                            {actionBusy === 'Writing reply...' ? actionBusy : '✨ Generate AI reply'}
                          </button>
                        ) : (
                          <div className="mt-2 space-y-2">
                            <input value={draft.subject}
                              onFocus={() => { editingRef.current = true; }}
                              onChange={e => { editingRef.current = true; setDrafts(p => ({ ...p, [r.id]: { ...draft, subject: e.target.value } })); }}
                              className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
                            <textarea value={draft.text} rows={8}
                              onFocus={() => { editingRef.current = true; }}
                              onChange={e => { editingRef.current = true; setDrafts(p => ({ ...p, [r.id]: { ...draft, text: e.target.value } })); }}
                              className="w-full rounded border border-gray-300 px-2 py-1 text-sm font-sans" />
                            <div className="flex flex-wrap items-center gap-2">
                              <button onClick={() => handleSend(r.id)} disabled={!!actionBusy}
                                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                                {actionBusy === 'Sending...' ? 'Sending...' : `Send from ${mailboxLabel(replyFrom)}`}
                              </button>
                              <button onClick={() => handleSaveDraft(r.id)} disabled={!!actionBusy}
                                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Save edits</button>
                              <button onClick={() => handleGenerate(r.id)} disabled={!!actionBusy}
                                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Regenerate</button>
                            </div>
                            {sr && (
                              <div className={`rounded-md px-3 py-2 text-sm ${sr.sent ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
                                {sr.sent ? `Sent to ${sr.to} from ${sr.from}.` : `Draft prepared for ${sr.to} from ${sr.from} (live sending is OFF until quotes are validated).`}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Conversation thread */}
                    <div>
                      <button onClick={() => handleConversation(r.id)} className="text-sm font-medium text-blue-600 hover:underline">
                        {conv ? 'Refresh conversation' : 'View conversation'}
                      </button>
                      {conv && (
                        <div className="mt-2 space-y-2">
                          {conv.length === 0 ? <div className="text-xs text-gray-400">No thread history available.</div> : (
                            <>
                              <div className="text-[10px] uppercase tracking-wide text-gray-400">Most recent first</div>
                              {conv.slice().reverse().map((m, idx) => (
                                <div key={m.id} className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${m.direction === 'outbound' ? 'ml-auto bg-blue-50 text-blue-900' : 'bg-gray-100 text-gray-700'} ${idx === 0 ? 'ring-1 ring-blue-200' : ''}`}>
                                  <div className="mb-0.5 flex items-center justify-between gap-3 text-[10px] text-gray-400">
                                    <span>{m.direction === 'outbound' ? 'LandJet' : (m.from || 'Customer')}{idx === 0 ? ' · latest' : ''}</span>
                                    <span>{timeAgo(m.at)}</span>
                                  </div>
                                  <div className="whitespace-pre-wrap">{m.preview}</div>
                                </div>
                              ))}
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Lifecycle controls */}
                    <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
                      <span className="text-xs text-gray-400">Mark:</span>
                      <button onClick={() => handleLifecycle(r.id, 'booked')} disabled={!!actionBusy}
                        className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">&#9989; Booked</button>
                      <button onClick={() => handleLifecycle(r.id, 'closed')} disabled={!!actionBusy}
                        className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200">Closed (no deal)</button>
                      {(lc === 'booked' || lc === 'closed') && (
                        <button onClick={() => handleLifecycle(r.id, 'needs_reply')} disabled={!!actionBusy}
                          className="rounded-md bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100">Reopen</button>
                      )}
                      {actionBusy && <span className="text-xs text-gray-400">{actionBusy}</span>}
                    </div>

                    {r.raw_body && (
                      <details className="text-xs text-gray-500">
                        <summary className="cursor-pointer">Original email</summary>
                        <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap font-sans text-gray-600">{r.raw_body}</pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
