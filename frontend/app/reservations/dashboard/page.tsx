'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getReservationMetrics, type ReservationMetrics } from '@/lib/api';
import { ensureAuth } from '@/lib/auth';

const STATUS_CLS: Record<string, string> = {
  auto_ready: 'bg-emerald-500', needs_review: 'bg-amber-500', forward: 'bg-blue-500', manual: 'bg-gray-400',
};
const STATUS_LABEL: Record<string, string> = {
  auto_ready: 'Auto ready', needs_review: 'Needs review', forward: 'Forward', manual: 'Manual',
};

function Bar({ label, n, max, cls, sub }: { label: string; n: number; max: number; cls: string; sub?: string }) {
  const pct = max > 0 ? Math.round((n / max) * 100) : 0;
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs text-gray-600 mb-0.5">
        <span className="capitalize">{label}{sub ? <span className="text-gray-400"> · {sub}</span> : null}</span>
        <span className="font-medium text-gray-800">{n}</span>
      </div>
      <div className="h-2 w-full rounded bg-gray-100 overflow-hidden">
        <div className={`h-full ${cls}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-gray-900">{value}</div>
      {hint && <div className="text-xs text-gray-400 mt-0.5">{hint}</div>}
    </div>
  );
}

export default function ReservationDashboard() {
  const [m, setM] = useState<ReservationMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { (async () => {
    await ensureAuth();
    try { setM(await getReservationMetrics()); } catch (e) { setError((e as Error).message); }
  })(); }, []);

  if (error) return <div className="mx-auto max-w-5xl px-6 py-8"><div className="rounded bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div></div>;
  if (!m) return <div className="mx-auto max-w-5xl px-6 py-8 text-sm text-gray-400">Loading…</div>;

  const total = m.funnel.total || 0;
  const statusMax = Math.max(1, ...m.by_status.map(s => s.n));
  const marketMax = Math.max(1, ...m.by_market.map(s => s.n));
  const autoReady = m.by_status.find(s => s.status === 'auto_ready')?.n || 0;
  const confTotal = m.confidence.high + m.confidence.mid + m.confidence.low + m.confidence.none;
  const highPct = confTotal > 0 ? Math.round((m.confidence.high / confTotal) * 100) : 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold text-gray-900">Quote Engine Dashboard</h1>
        <Link href="/reservations" className="text-sm text-blue-600 hover:underline">&larr; Back to queue</Link>
      </div>
      <p className="text-sm text-gray-500 mb-5">Observability for the reservation auto-quote process.</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Kpi label="Reservations" value={total} />
        <Kpi label="Quote value" value={`$${(m.funnel.total_value || 0).toLocaleString()}`} hint="sum of priced quotes" />
        <Kpi label="Quoted" value={m.funnel.quoted} hint={`${m.funnel.sent} sent · ${m.funnel.replied} replied`} />
        <Kpi label="Auto-ready" value={`${total > 0 ? Math.round((autoReady / total) * 100) : 0}%`} hint={`${autoReady} of ${total}`} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">By status</h2>
          {m.by_status.map(s => (
            <Bar key={s.status} label={STATUS_LABEL[s.status] || s.status} n={s.n} max={statusMax}
              cls={STATUS_CLS[s.status] || 'bg-gray-400'} sub={`avg conf ${s.avg_conf ?? 0}`} />
          ))}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Confidence distribution</h2>
          <p className="text-xs text-gray-400 mb-3">Trust-before-intelligence: auto-send only at/above {m.autosend_threshold.toFixed(2)}.</p>
          <Bar label={`High (≥ ${m.autosend_threshold.toFixed(2)}) — auto-send eligible`} n={m.confidence.high} max={Math.max(1, confTotal)} cls="bg-emerald-500" />
          <Bar label="Mid (0.50–0.89)" n={m.confidence.mid} max={Math.max(1, confTotal)} cls="bg-blue-500" />
          <Bar label="Low (< 0.50)" n={m.confidence.low} max={Math.max(1, confTotal)} cls="bg-amber-500" />
          <Bar label="None (manual)" n={m.confidence.none} max={Math.max(1, confTotal)} cls="bg-gray-400" />
          <div className="mt-2 rounded bg-gray-50 px-3 py-2 text-xs text-gray-600">
            {highPct}% of quotes clear the {m.autosend_threshold.toFixed(2)} bar. Auto-send stays OFF until validated — every quote is human-reviewed today.
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Source</h2>
          {m.by_source.map(s => (
            <Bar key={s.source} label={s.source === 'nl' ? '🤖 AI-extracted (free-form)' : s.source === 'bookrides' ? 'Parsed (BookRides)' : 'Unparsed / non-quote'} n={s.n} max={Math.max(1, ...m.by_source.map(x => x.n))} cls={s.source === 'nl' ? 'bg-purple-500' : s.source === 'bookrides' ? 'bg-emerald-500' : 'bg-gray-400'} />
          ))}
          <h2 className="text-sm font-semibold text-gray-700 mt-4 mb-2">By service type</h2>
          {m.by_service.map(s => (
            <Bar key={s.service_type} label={s.service_type.replace(/_/g, ' ')} n={s.n} max={Math.max(1, ...m.by_service.map(x => x.n))} cls="bg-indigo-400" />
          ))}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">By market</h2>
          {m.by_market.length === 0 ? <div className="text-xs text-gray-400">No data yet.</div> :
            m.by_market.map(s => (
              <Bar key={s.market} label={s.market.replace(/_/g, ' ')} n={s.n} max={marketMax} cls="bg-slate-500" />
            ))}
        </div>
      </div>
    </div>
  );
}
