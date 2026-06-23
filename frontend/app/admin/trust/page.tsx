'use client';

import { useState, useEffect } from 'react';
import { getTrustOverview } from '@/lib/api';
import { ensureAuth } from '@/lib/auth';

function Kpi({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone || 'text-gray-900'}`}>{value}</div>
      {hint && <div className="text-xs text-gray-400 mt-0.5">{hint}</div>}
    </div>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">{title}</h2>
      {children}
    </div>
  );
}
function Bar({ label, n, max, cls }: { label: string; n: number; max: number; cls: string }) {
  const pct = max > 0 ? Math.round((n / max) * 100) : 0;
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs text-gray-600 mb-0.5"><span className="capitalize">{label}</span><span className="font-medium">{n}</span></div>
      <div className="h-2 w-full rounded bg-gray-100 overflow-hidden"><div className={`h-full ${cls}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
function Flag({ label, on }: { label: string; on: boolean | null }) {
  const cls = on === null ? 'bg-gray-100 text-gray-500' : on ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700';
  const txt = on === null ? 'unknown' : on ? 'ON' : 'OFF';
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{label}: {txt}</span>;
}
function RemRow({ item }: { item: any }) {
  const map: Record<string, { dot: string; chip: string; txt: string }> = {
    met: { dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700', txt: 'Met' },
    partial: { dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700', txt: 'Partial' },
    open: { dot: 'bg-rose-500', chip: 'bg-rose-50 text-rose-700', txt: 'Open' },
  };
  const s = map[item.status] || map.open;
  return (
    <div className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-800">{item.label}</span>
          <span className="text-[10px] font-medium text-gray-400">{item.id} · {item.pri}</span>
          {item.live
            ? <span className="rounded bg-blue-50 px-1 py-0.5 text-[10px] font-medium text-blue-600">LIVE</span>
            : <span className="rounded bg-gray-100 px-1 py-0.5 text-[10px] font-medium text-gray-500">CODE</span>}
        </div>
        <div className="text-xs text-gray-400 mt-0.5">{item.signal}</div>
      </div>
      <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${s.chip}`}>{s.txt}</span>
    </div>
  );
}

export default function TrustCenter() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { (async () => { await ensureAuth(); try { setD(await getTrustOverview()); } catch (e) { setErr((e as Error).message); } })(); }, []);

  if (err) return <div className="mx-auto max-w-6xl px-6 py-8"><div className="rounded bg-rose-50 px-4 py-2 text-sm text-rose-700">{err}</div></div>;
  if (!d) return <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-gray-400">Loading…</div>;

  const a = d.assessment; const ops = d.operations; const gov = d.governance; const obs = d.observability; const biz = d.business_impact;
  const rem = d.remediation || { items: [], met: 0, partial: 0, open: 0 };
  const scoreTone = a.composite >= 70 ? 'text-emerald-600' : a.composite >= 50 ? 'text-amber-600' : 'text-rose-600';
  const confMax = Math.max(1, (obs.reservation_confidence?.high || 0) + (obs.reservation_confidence?.mid || 0) + (obs.reservation_confidence?.low || 0));

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-2xl font-semibold text-gray-900">Trust Command Center</h1>
      <p className="text-sm text-gray-500 mt-1">One pane over every AI capability. Live operational data; headline trust score from the latest TBI audit.</p>

      {/* Executive */}
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Composite Trust" value={`${a.composite}/100`} hint={`as of ${a.date}`} tone={scoreTone} />
        <Kpi label="TBI Maturity" value={a.maturity} />
        <Kpi label="Recommendation" value={a.recommendation} tone="text-amber-600" hint={`${a.open_conditions} open conditions`} />
        <Kpi label="AI runs (24h)" value={(d.executive.ai_runs_24h?.total) || 0} hint={`${d.executive.ai_runs_24h?.failed || 0} failed`} />
      </div>

      {/* Remediation — live trust conditions */}
      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-gray-700">Trust remediation — live conditions</h2>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-emerald-600 font-medium">{rem.met} met</span>
            <span className="text-amber-600 font-medium">{rem.partial} partial</span>
            <span className="text-rose-600 font-medium">{rem.open} open</span>
          </div>
        </div>
        <p className="text-xs text-gray-400 mb-2">
          <span className="rounded bg-blue-50 px-1 py-0.5 text-[10px] font-medium text-blue-600">LIVE</span> items derive their status from real runtime signals (audit rows, trace coverage, env config); <span className="rounded bg-gray-100 px-1 py-0.5 text-[10px] font-medium text-gray-500">CODE</span> items are guaranteed by shipped middleware.
        </p>
        <div className="mt-1">
          {(rem.items || []).map((it: any) => <RemRow key={it.id} item={it} />)}
          {(!rem.items || rem.items.length === 0) && <div className="text-xs text-gray-400">No remediation data.</div>}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Trust scorecard (latest audit)">
          {Object.entries(a.scores).map(([k, v]: any) => (
            <Bar key={k} label={k} n={v} max={100} cls={v >= 70 ? 'bg-emerald-500' : v >= 50 ? 'bg-amber-500' : 'bg-rose-500'} />
          ))}
          <a href="https://github.com" onClick={(e) => e.preventDefault()} className="text-xs text-gray-400">Source: docs/trust-audit/TRUST_COMPLIANCE_REPORT.md</a>
        </Card>

        <Card title="Operations">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Agents: <b>{ops.agents?.active || 0}</b>/{ops.agents?.total || 0} active</div>
            <div>Open errors: <b className={ops.errors?.open ? 'text-rose-600' : 'text-emerald-600'}>{ops.errors?.open || 0}</b></div>
            <div>Sent (24h): <b>{ops.comms_24h?.sent || 0}</b></div>
            <div>Inbound (24h): <b>{ops.comms_24h?.inbound || 0}</b></div>
          </div>
          <div className="mt-3 text-xs font-medium text-gray-500">Recent jobs</div>
          <div className="mt-1 space-y-1">
            {(ops.jobs || []).slice(0, 6).map((j: any, i: number) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-gray-600">{j.job_name}</span>
                <span className={j.status === 'completed' ? 'text-emerald-600' : j.status === 'failed' ? 'text-rose-600' : 'text-gray-500'}>{j.status}{j.duration_ms ? ` · ${Math.round(j.duration_ms)}ms` : ''}</span>
              </div>
            ))}
            {(!ops.jobs || ops.jobs.length === 0) && <div className="text-xs text-gray-400">No job runs recorded.</div>}
          </div>
        </Card>

        <Card title="Governance">
          <div className="text-sm mb-2">Approval queue: <b className={gov.approval_queue?.reservations_needs_review ? 'text-amber-600' : ''}>{gov.approval_queue?.reservations_needs_review || 0}</b> quotes · {gov.approval_queue?.decisions_proposed || 0} decisions</div>
          <div className="text-xs text-gray-500 mb-1">Policy / automation flags</div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            <Flag label="AUTORUN" on={gov.flags?.PIPELINE_AUTORUN} />
            <Flag label="QUOTE SEND" on={gov.flags?.RESERVATION_SEND_ENABLED} />
            <Flag label="STEPPER LIVE" on={gov.flags?.PIPELINE_ENABLE_STEPPER} />
            <Flag label="TEST MODE" on={gov.flags?.outreach_test_mode} />
          </div>
          <div className="text-xs text-gray-500">Manual category overrides: {gov.overrides?.manual_category || 0} · Audit events (24h): {d.executive.audit_events?.today || 0}</div>
        </Card>

        <Card title="Observability — decision confidence">
          <p className="text-xs text-gray-400 mb-2">Auto-send only at/above {obs.autosend_threshold?.toFixed?.(2) || '0.90'} (trust before intelligence).</p>
          <Bar label="High (≥0.90) auto-send eligible" n={obs.reservation_confidence?.high || 0} max={confMax} cls="bg-emerald-500" />
          <Bar label="Mid (0.50–0.89)" n={obs.reservation_confidence?.mid || 0} max={confMax} cls="bg-blue-500" />
          <Bar label="Low (<0.50)" n={obs.reservation_confidence?.low || 0} max={confMax} cls="bg-amber-500" />
          <div className="mt-3 space-y-1 text-xs">
            {obs.cost?.instrumented ? (
              <div className="rounded bg-emerald-50 px-2 py-1 text-emerald-800">
                💲 LLM spend (24h): <b>${Number(obs.cost.totals?.usd || 0).toFixed(2)}</b> · {obs.cost.totals?.calls || 0} calls · {Number(obs.cost.totals?.tokens || 0).toLocaleString()} tokens
                {obs.cost.daily_budget_usd ? ` · budget $${obs.cost.daily_budget_usd}${obs.cost.over_budget ? ' ⚠ OVER' : ''}` : ' · no budget set'}
              </div>
            ) : (
              <div className="rounded bg-amber-50 px-2 py-1 text-amber-800">⚠ Cost not yet instrumented</div>
            )}
            <div className="rounded bg-emerald-50 px-2 py-1 text-emerald-800">🧵 Tracing on: {obs.tracing?.note}</div>
          </div>
        </Card>

        <Card title="Business impact">
          <div className="grid grid-cols-2 gap-2 text-sm mb-2">
            <div>Quotes: <b>{biz.reservations?.total || 0}</b></div>
            <div>Quote value: <b>${(biz.reservations?.value || 0).toLocaleString()}</b></div>
            <div>Replied: <b>{biz.reservations?.replied || 0}</b></div>
            <div>Auto-ready: <b>{biz.reservations?.auto_ready || 0}</b></div>
          </div>
          <div className="text-xs font-medium text-gray-500">Outcomes (7d)</div>
          {(biz.outcomes_7d || []).length === 0 ? <div className="text-xs text-gray-400">None recorded.</div> :
            (biz.outcomes_7d || []).map((o: any, i: number) => (
              <Bar key={i} label={o.outcome} n={o.n} max={Math.max(1, ...biz.outcomes_7d.map((x: any) => x.n))} cls="bg-indigo-400" />
            ))}
        </Card>
      </div>

      <p className="mt-5 text-xs text-gray-400">Operational panels and the remediation conditions are live from the database and runtime config. The headline trust score, maturity, and recommendation are from the most recent TBI audit ({a.date}) and are a labelled point-in-time assessment, not a live computation. Where a control is verified by a runtime signal it is marked LIVE; where it is guaranteed by shipped code it is marked CODE.</p>
    </div>
  );
}
