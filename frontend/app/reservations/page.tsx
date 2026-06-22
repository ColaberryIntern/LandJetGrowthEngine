'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getReservations, ingestReservations, sendReservationQuote, type ReservationQuoteRow } from '@/lib/api';
import { ensureAuth } from '@/lib/auth';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  auto_ready:   { label: 'Auto ready',   cls: 'bg-emerald-100 text-emerald-700' },
  needs_review: { label: 'Needs review', cls: 'bg-amber-100 text-amber-700' },
  forward:      { label: 'Forward',      cls: 'bg-blue-100 text-blue-700' },
  manual:       { label: 'Manual',       cls: 'bg-gray-100 text-gray-600' },
};

const FILTERS = ['all', 'auto_ready', 'needs_review', 'forward', 'manual'] as const;

function timeAgo(s: string | null): string {
  if (!s) return '';
  const diff = Date.now() - new Date(s).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'Just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function money(v: string | number | null | undefined): string {
  if (v == null) return '--';
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : '--';
}

// No-key Google Maps embed showing the from -> to route. No fixed zoom so the
// embed auto-fits each route's bounds -- otherwise every Midwest trip looked
// identical at a fixed regional zoom even though the routes differ.
function mapSrc(pickup?: string, dropoff?: string): string | null {
  if (!pickup || !dropoff) return null;
  return `https://maps.google.com/maps?saddr=${encodeURIComponent(pickup)}&daddr=${encodeURIComponent(dropoff)}&output=embed`;
}

// Relative time to the APPOINTMENT (the trip), color-coded by urgency.
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

// At-a-glance tags so the team instantly knows what kind of ride it is and which
// groups it falls into. Conditional colors by category.
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
    out.push({ label: `★ ${nice[cat] || cat}`, cls: 'bg-emerald-100 text-emerald-700' }); // special incentive / rate
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

function confCls(c: number): string {
  if (c >= 0.7) return 'text-emerald-600';
  if (c >= 0.5) return 'text-blue-600';
  return 'text-amber-600';
}

export default function ReservationsPage() {
  const [rows, setRows] = useState<ReservationQuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [openId, setOpenId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [sendResult, setSendResult] = useState<Record<number, { sent: boolean; dry: boolean; to: string | null; text: string }>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getReservations(filter);
      setRows(res.reservations || []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { (async () => { await ensureAuth(); await load(); })(); }, [load]);

  async function refreshFromMailbox() {
    setRefreshing(true);
    try { await ingestReservations(168); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setRefreshing(false); }
  }

  async function handleSend(id: number) {
    setSendingId(id);
    try {
      const r = await sendReservationQuote(id);
      setSendResult(prev => ({ ...prev, [id]: { sent: r.sent, dry: r.dry, to: r.to, text: r.draft.text } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSendingId(null);
    }
  }

  const counts = FILTERS.reduce((acc, f) => {
    acc[f] = f === 'all' ? rows.length : rows.filter(r => r.status === f).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Reservation Quotes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Emails from ljreservations@landjet.com, priced automatically. Review the quote and send it back in one click.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            &#128737;&#65039; The AI prepares and explains every quote with a confidence score; a person reviews and sends.
            Nothing is sent to a customer automatically. (Trust before intelligence.)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/reservations/dashboard" className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            &#128202; Dashboard
          </Link>
          <Link href="/reservations/test" className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            &#129514; Test a quote
          </Link>
          <button onClick={refreshFromMailbox} disabled={refreshing}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50">
            {refreshing ? 'Checking mailbox...' : 'Refresh from mailbox'}
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${filter === f ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {f === 'all' ? 'All' : STATUS_META[f].label} ({counts[f] ?? 0})
          </button>
        ))}
      </div>

      {error && <div className="mt-4 rounded-md bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>}

      {loading ? (
        <div className="mt-8 text-sm text-gray-400">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
          No reservation quotes yet. Click &quot;Refresh from mailbox&quot; to pull and price recent emails.
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {rows.map(r => {
            const meta = STATUS_META[r.status] || STATUS_META.manual;
            const trip = r.result?.trip;
            const quote = r.result?.quote;
            const open = openId === r.id;
            const sent = sendResult[r.id] || (r.result?.sent ? { sent: true, dry: false, to: r.result.sent.to, text: '' } : null);
            const canSend = r.status === 'auto_ready' || r.status === 'needs_review';
            const quotedAt = r.result?.sent?.at || r.result?.prepared?.at || null;
            const quotedKind = r.result?.sent?.at ? 'sent' : 'prepared';
            const route = mapSrc(trip?.pickup_address, trip?.dropoff_address);
            const appt = apptRelative(trip?.date_of_service, (trip as { start_time?: string })?.start_time);
            const tg = tagsFor(r);
            return (
              <div key={r.id} className="rounded-lg border border-gray-200 bg-white">
                <div className="flex items-stretch gap-3 px-4 py-3">
                  <button onClick={() => setOpenId(open ? null : r.id)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                      {appt && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${appt.cls}`}>{appt.text}</span>}
                      <span className={`text-xs font-medium ${confCls(Number(r.confidence))}`}>conf {Number(r.confidence).toFixed(2)}</span>
                      <span className="text-xs text-gray-400">&middot; received {timeAgo(r.received_at)}</span>
                    </div>
                    <div className="mt-1 truncate font-medium text-gray-900">{r.subject || '(no subject)'}</div>
                    <div className="truncate text-sm text-gray-500">{r.from_email}</div>
                    {tg.length > 0 && (
                      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                        {tg.map((t, i) => (
                          <span key={i} className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${t.cls}`}>{t.label}</span>
                        ))}
                      </div>
                    )}
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap text-xs">
                      {r.responded_at ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">&#9989; Replied {timeAgo(r.responded_at)}</span>
                      ) : quotedAt ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">Awaiting reply</span>
                      ) : null}
                      {quotedAt ? (
                        <span className="text-gray-500">Quote {quotedKind} {timeAgo(quotedAt)}</span>
                      ) : (
                        <span className="text-gray-400">Not quoted yet</span>
                      )}
                    </div>
                  </button>
                  {route && (
                    <iframe
                      src={route}
                      title={`route-${r.id}`}
                      loading="lazy"
                      className="hidden sm:block w-44 h-24 shrink-0 rounded border border-gray-200"
                    />
                  )}
                  <button onClick={() => setOpenId(open ? null : r.id)} className="text-right shrink-0 self-center">
                    <div className="text-lg font-semibold text-gray-900">{money(r.quote_total)}</div>
                    <div className="text-xs text-gray-400">{open ? 'Hide' : 'View'}</div>
                  </button>
                </div>

                {open && (
                  <div className="border-t border-gray-100 px-4 py-3 space-y-3">
                    {trip && (
                      <div className="text-sm">
                        <div className="font-medium text-gray-700">
                          {r.result?.source === 'nl' ? 'Extracted from a free-form email (AI)' : 'Trip'}
                        </div>
                        {(trip.pickup_address || trip.dropoff_address) ? (
                          <div className="text-gray-600">{trip.pickup_address || '(no pickup)'} &rarr; {trip.dropoff_address || '(no dropoff)'}</div>
                        ) : (
                          <div className="text-xs text-amber-700">No pickup/dropoff in the email &mdash; add a route to produce a quote.</div>
                        )}
                        <div className="text-gray-400 text-xs mt-0.5">
                          {[trip.passenger_name, trip.service_type, trip.date_of_service, trip.passengers != null ? `${trip.passengers} pax` : null].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                    )}

                    {quote ? (
                      <div className="text-sm">
                        <div className="font-medium text-gray-700">Quote that would go out</div>
                        {Array.isArray(quote.lines) && quote.lines.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {quote.lines.map((l, i) => (
                              <div key={i} className="flex justify-between text-gray-600">
                                <span>{l.label}</span><span>{money(l.amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="mt-1 flex justify-between border-t border-gray-100 pt-1 font-semibold text-gray-900">
                          <span>Total</span><span>{money(quote.grand_total)}</span>
                        </div>
                        {Array.isArray(quote.warnings) && quote.warnings.length > 0 && (
                          <ul className="mt-2 list-disc pl-5 text-xs text-amber-700">
                            {quote.warnings.map((w, i) => <li key={i}>{w}</li>)}
                          </ul>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500">
                        Not a structured quote ({r.result?.manual_reason || r.mode}). Handle manually.
                      </div>
                    )}

                    {canSend && (
                      <div>
                        <button onClick={() => handleSend(r.id)} disabled={sendingId === r.id}
                          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                          {sendingId === r.id ? 'Preparing...' : sent ? 'Re-prepare quote reply' : 'Send quote reply'}
                        </button>
                        {sent && (
                          <div className={`mt-2 rounded-md px-3 py-2 text-sm ${sent.sent ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
                            {sent.sent
                              ? `Sent to ${sent.to}.`
                              : `Draft prepared for ${sent.to} (sending is OFF until quotes are validated). Preview:`}
                            {!sent.sent && sent.text && (
                              <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-gray-700">{sent.text}</pre>
                            )}
                          </div>
                        )}
                      </div>
                    )}

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
