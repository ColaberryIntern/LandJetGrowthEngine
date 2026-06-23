'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  getReservations, ingestReservations, sendReservationQuote,
  generateReservationDraft, saveReservationDraft, setReservationLifecycle,
  getReservationConversation, mergeReservations, unmergeReservation,
  deleteReservation, restoreReservation, reclassifyReservation, submitReservationFeedback,
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
  completed:         { label: 'Completed',    chip: 'bg-teal-100 text-teal-700',     bar: 'bg-teal-400',    card: 'border-teal-200 bg-teal-50/40' },
  booked:            { label: 'Booked',       chip: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500', card: 'border-emerald-200 bg-emerald-50/40' },
  closed:            { label: 'Closed',       chip: 'bg-gray-200 text-gray-600',     bar: 'bg-gray-300',    card: 'border-gray-200 bg-gray-50 opacity-75' },
  not_quote:         { label: 'Not a quote',  chip: 'bg-gray-200 text-gray-500',     bar: 'bg-gray-300',    card: 'border-gray-200 bg-gray-50 opacity-75' },
};

const RESOLVED_STATES = ['completed', 'booked', 'closed'];

// Fields a request needs before it can be properly quoted.
function missingFields(r: ReservationQuoteRow): string[] {
  const t = r.result?.trip || {};
  const out: string[] = [];
  if (!t.pickup_address) out.push('Pickup address');
  if (!t.dropoff_address) out.push('Dropoff address');
  if (!t.date_of_service) out.push('Date');
  if (t.passengers == null) out.push('Passengers');
  return out;
}

const LIFECYCLE_FILTERS = [
  { key: 'needs_reply', label: 'Needs reply' },
  { key: 'awaiting_customer', label: 'Awaiting' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'past_trips', label: 'Past trips' },
  { key: 'not_quote', label: 'Not a quote' },
  { key: 'all', label: 'All' },
  { key: 'deleted', label: 'Deleted' },
] as const;

// A resolved reservation stays in Resolved until its trip date passes, then it
// moves to Past trips (hidden by default, still viewable).
function tripPassed(r: ReservationQuoteRow): boolean {
  const ds = r.result?.trip?.date_of_service;
  const m = ds?.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return false;
  const end = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]), 23, 59, 59);
  return end.getTime() < Date.now();
}

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
  return Number.isFinite(n) ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '--';
}

// Tidy an address so the embed geocodes it cleanly: drop "(ORD)"-style
// parentheticals, a redundant trailing USA, and collapse stray commas/spaces.
// A malformed pickup (e.g. "ORD airport (ORD), West O'Hare Avenue...") is what
// makes the directions embed give up and show an ocean.
function cleanAddr(a?: string): string {
  return (a || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s*,\s*USA\s*$/i, '')
    .replace(/\s*,(?:\s*,)+/g, ',')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim();
}

function mapSrc(pickup?: string, dropoff?: string): string | null {
  const p = cleanAddr(pickup), d = cleanAddr(dropoff);
  // Two addresses -> a framed driving route (the good-looking one).
  if (p && d) return `https://maps.google.com/maps?saddr=${encodeURIComponent(p)}&daddr=${encodeURIComponent(d)}&output=embed`;
  // One address is enough to show a map -- center on whichever we have.
  const one = p || d;
  return one ? `https://maps.google.com/maps?q=${encodeURIComponent(one)}&z=12&output=embed` : null;
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

// Identify the same logical request arriving as multiple emails. BookRides sends
// more than one notification per request; each lands as its own row. The
// reservation number is the exact identity; otherwise fall back to a strict
// passenger+route+date+time signature so genuinely different trips stay separate.
function dedupKey(r: ReservationQuoteRow): string | null {
  const t = r.result?.trip || {};
  if (t.reservation_number) return `res:${t.reservation_number}`;
  const norm = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
  const parts = [norm(t.passenger_name), norm(t.pickup_address), norm(t.dropoff_address), norm(t.date_of_service), norm(t.start_time)];
  if (parts.filter(Boolean).length < 4) return null; // not enough signal to call it a duplicate
  return `trip:${parts.join('|')}`;
}

interface DupInfo { isDup: boolean; count: number; canonId: number }

// Build duplicate groups and pick a canonical per group (prefer one with a draft,
// then the most recent, then highest id) so the work already done is kept.
function buildDupMap(rows: ReservationQuoteRow[]): Map<number, DupInfo> {
  const groups = new Map<string, ReservationQuoteRow[]>();
  for (const r of rows) {
    const k = dedupKey(r);
    if (!k) continue;
    (groups.get(k) || groups.set(k, []).get(k)!).push(r);
  }
  const out = new Map<number, DupInfo>();
  for (const grp of groups.values()) {
    if (grp.length < 2) continue;
    const canon = [...grp].sort((a, b) =>
      (Number(!!b.ai_draft) - Number(!!a.ai_draft)) ||
      (new Date(b.received_at || 0).getTime() - new Date(a.received_at || 0).getTime()) ||
      (b.id - a.id))[0];
    for (const r of grp) out.set(r.id, { isDup: r.id !== canon.id, count: grp.length, canonId: canon.id });
  }
  return out;
}

// Smart conversation-state tag from the customer's latest message intent. This is
// what tells the team "this is wrapping up" vs "this actually needs an answer".
function intentTag(r: ReservationQuoteRow): { label: string; cls: string } | null {
  const lc = r.lifecycle || 'needs_reply';
  if (lc === 'completed') return { label: '\u{1F64F} Customer signed off', cls: 'bg-teal-100 text-teal-700' };
  if (lc === 'needs_reply' && r.last_inbound_intent === 'question') return { label: '❓ Question · needs answer', cls: 'bg-rose-100 text-rose-700' };
  if (lc === 'needs_reply' && r.last_inbound_intent === 'confirmation') return { label: '✅ Ready to book', cls: 'bg-emerald-100 text-emerald-700' };
  return null;
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
  const [hideDuplicates, setHideDuplicates] = useState(true);
  const [openId, setOpenId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletedRows, setDeletedRows] = useState<ReservationQuoteRow[]>([]);

  // Per-row UI state, kept separate from server rows so live polling never
  // clobbers an in-progress edit.
  const [drafts, setDrafts] = useState<Record<number, { subject: string; text: string }>>({});
  const [busy, setBusy] = useState<Record<number, string>>({}); // id -> action label
  const [sendResult, setSendResult] = useState<Record<number, { sent: boolean; from: string | null; to: string | null }>>({});
  const [convs, setConvs] = useState<Record<number, ReservationConversationMessage[]>>({});
  const editingRef = useRef(false);

  // Per-row feedback form state.
  const [fbOpen, setFbOpen] = useState<number | null>(null);
  const [fbCategory, setFbCategory] = useState('misclassified');
  const [fbComment, setFbComment] = useState('');
  const [fbResult, setFbResult] = useState<Record<number, string>>({});

  // Manual merge mode: operator selects same-booking rows and picks one to keep.
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [primaryPick, setPrimaryPick] = useState<number | null>(null);

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

  const loadDeleted = useCallback(async () => {
    try { const res = await getReservations({ deleted: true }); setDeletedRows(res.reservations || []); }
    catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => { (async () => { await ensureAuth(); await load(); })(); }, [load]);

  // Live auto-refresh. Skips a beat while the operator is editing a draft.
  useEffect(() => {
    const t = setInterval(() => { if (!editingRef.current) load(false); }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => { if (filter === 'deleted') loadDeleted(); }, [filter, loadDeleted]);

  async function refreshFromMailbox() {
    setRefreshing(true);
    try { await ingestReservations(168); await load(false); }
    catch (e) { setError((e as Error).message); }
    finally { setRefreshing(false); }
  }

  function exitMerge() { setMergeMode(false); setSelectedIds([]); setPrimaryPick(null); }
  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      setPrimaryPick(p => (next.length ? (p && next.includes(p) ? p : next[0]) : null));
      return next;
    });
  }
  async function handleMerge() {
    if (!primaryPick || selectedIds.length < 2) return;
    const secondaries = selectedIds.filter(id => id !== primaryPick);
    try { await mergeReservations(primaryPick, secondaries); exitMerge(); await load(false); }
    catch (e) { setError((e as Error).message); }
  }
  async function handleUnmerge(id: number) {
    setBusyFor(id, 'Unmerging...');
    try { await unmergeReservation(id); await load(false); }
    catch (e) { setError((e as Error).message); }
    finally { setBusyFor(id, null); }
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

  async function handleLifecycle(id: number, lifecycle: 'needs_reply' | 'awaiting_customer' | 'completed' | 'booked' | 'closed' | 'not_quote') {
    setBusyFor(id, 'Updating...');
    try { await setReservationLifecycle(id, lifecycle); await load(false); if (filter === 'deleted') await loadDeleted(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusyFor(id, null); }
  }

  async function handleDelete(id: number) {
    setBusyFor(id, 'Removing...');
    try { await deleteReservation(id); await load(false); }
    catch (e) { setError((e as Error).message); }
    finally { setBusyFor(id, null); }
  }
  async function handleReclassify(id: number, decision: 'quote' | 'not_quote') {
    setBusyFor(id, 'Updating + learning...');
    try { await reclassifyReservation(id, decision); await load(false); }
    catch (e) { setError((e as Error).message); }
    finally { setBusyFor(id, null); }
  }
  async function handleFeedback(id: number, category: string, comment: string, action?: string) {
    setBusyFor(id, 'Sending feedback...');
    try {
      const r = await submitReservationFeedback(id, { category, comment, action });
      setFbResult(prev => ({ ...prev, [id]: r.applied ? `Thanks - applied: ${r.applied}.` : 'Thanks - logged. We will use this to improve.' }));
      setFbOpen(null); setFbComment('');
      await load(false);
    } catch (e) { setError((e as Error).message); }
    finally { setBusyFor(id, null); }
  }
  async function handleRestore(id: number) {
    setBusyFor(id, 'Restoring...');
    try { await restoreReservation(id); await loadDeleted(); await load(false); }
    catch (e) { setError((e as Error).message); }
    finally { setBusyFor(id, null); }
  }

  async function handleConversation(id: number) {
    setBusyFor(id, 'Loading thread...');
    try { const { messages } = await getReservationConversation(id); setConvs(prev => ({ ...prev, [id]: messages })); }
    catch (e) { setError((e as Error).message); }
    finally { setBusyFor(id, null); }
  }

  // Duplicate detection + manual merges across the full set. A row is "collapsed"
  // (hidden under the canonical) if it is an auto-duplicate OR was merged into
  // another row by the operator. Unique = everything still standing on its own.
  const dupMap = buildDupMap(rows);
  const mergedChildren = new Map<number, number[]>();
  for (const r of rows) {
    if (r.merged_into) (mergedChildren.get(r.merged_into) || mergedChildren.set(r.merged_into, []).get(r.merged_into)!).push(r.id);
  }
  const isCollapsed = (r: ReservationQuoteRow) => r.merged_into != null || !!dupMap.get(r.id)?.isDup;
  const dupTotal = rows.filter(isCollapsed).length;
  const uniqueRows = rows.filter(r => !isCollapsed(r));

  // Stats and tab counts reflect UNIQUE requests, so duplicates never inflate the
  // workload. The list hides duplicates by default (toggle to reveal, badged).
  const statBase = uniqueRows;
  // In merge mode always show the active (uncollapsed) rows so the operator can
  // select among them; otherwise honor the hide-grouped toggle.
  const listBase = (mergeMode || hideDuplicates) ? uniqueRows : rows;
  // Sort by most recent CUSTOMER activity (their last reply, else when the request
  // came in). In the Resolved bucket, sort by when it was resolved -- newest first.
  const customerActivity = (r: ReservationQuoteRow) => Math.max(
    r.responded_at ? new Date(r.responded_at).getTime() : 0,
    r.received_at ? new Date(r.received_at).getTime() : 0,
  );
  const resolvedAt = (r: ReservationQuoteRow) => (r.resolved_at ? new Date(r.resolved_at).getTime() : 0);
  const visible = filter === 'deleted'
    ? deletedRows
    : listBase
        .filter(r => {
          const lc = lifecycleOf(r);
          if (filter === 'all') return lc !== 'not_quote' && !(RESOLVED_STATES.includes(lc) && tripPassed(r));
          if (filter === 'resolved') return RESOLVED_STATES.includes(lc) && !tripPassed(r);
          if (filter === 'past_trips') return RESOLVED_STATES.includes(lc) && tripPassed(r);
          return lc === filter;
        })
        .sort((a, b) => (filter === 'resolved' || filter === 'past_trips') ? (resolvedAt(b) - resolvedAt(a)) : (customerActivity(b) - customerActivity(a)));
  const isResolvedUpcoming = (r: ReservationQuoteRow) => RESOLVED_STATES.includes(lifecycleOf(r)) && !tripPassed(r);
  const isPastTrip = (r: ReservationQuoteRow) => RESOLVED_STATES.includes(lifecycleOf(r)) && tripPassed(r);
  const stats = {
    needs_reply: statBase.filter(r => lifecycleOf(r) === 'needs_reply').length,
    awaiting_customer: statBase.filter(r => lifecycleOf(r) === 'awaiting_customer').length,
    resolved: statBase.filter(isResolvedUpcoming).length,
    pipelineValue: statBase.filter(r => !RESOLVED_STATES.includes(lifecycleOf(r)) && lifecycleOf(r) !== 'not_quote').reduce((a, r) => a + (parseFloat(r.quote_total || '0') || 0), 0),
  };
  const counts: Record<string, number> = {
    needs_reply: stats.needs_reply,
    awaiting_customer: stats.awaiting_customer,
    resolved: stats.resolved,
    past_trips: statBase.filter(isPastTrip).length,
    not_quote: statBase.filter(r => lifecycleOf(r) === 'not_quote').length,
    all: statBase.filter(r => lifecycleOf(r) !== 'not_quote' && !isPastTrip(r)).length,
    deleted: deletedRows.length,
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
          { label: 'Resolved', value: stats.resolved, cls: 'text-emerald-600', sub: 'booked / done' },
          { label: 'Open pipeline', value: money(stats.pipelineValue), cls: 'text-gray-900', sub: 'unresolved value' },
        ].map((s, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <div className={`text-2xl font-semibold ${s.cls}`}>{s.value}</div>
            <div className="text-xs font-medium text-gray-700">{s.label}</div>
            <div className="text-[11px] text-gray-400">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {LIFECYCLE_FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${filter === f.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {f.label} ({counts[f.key] ?? 0})
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {mergeMode ? (
            <button onClick={exitMerge} className="rounded-full bg-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-300">Cancel merge</button>
          ) : (
            <button onClick={() => setMergeMode(true)} className="rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-700 hover:bg-violet-200"
              title="Combine rows you know are the same booking and pick one to keep.">
              &#128279; Merge
            </button>
          )}
          {dupTotal > 0 && (
            <button onClick={() => setHideDuplicates(v => !v)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${hideDuplicates ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              title="Duplicate BookRides emails and manually merged rows are grouped under one row.">
              {hideDuplicates ? `${dupTotal} hidden` : 'Hide grouped'}
            </button>
          )}
        </div>
      </div>

      {mergeMode && (
        <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm">
          <div className="font-medium text-violet-900">Merge mode</div>
          <div className="text-xs text-violet-700 mt-0.5">Click rows that are the same booking, then choose which one to keep. The others are absorbed into it and leave the queue (you can unmerge later).</div>
          {selectedIds.length > 0 && (
            <div className="mt-2 space-y-1">
              {selectedIds.map(id => {
                const row = rows.find(r => r.id === id);
                return (
                  <label key={id} className="flex items-center gap-2 text-xs text-gray-700">
                    <input type="radio" name="primary" checked={primaryPick === id} onChange={() => setPrimaryPick(id)} />
                    <span className="font-medium">Keep #{id}</span>
                    <span className="truncate text-gray-500">{row?.subject || ''} · {money(row?.quote_total)}</span>
                  </label>
                );
              })}
              <div className="mt-2 flex items-center gap-2">
                <button onClick={handleMerge} disabled={selectedIds.length < 2 || !primaryPick}
                  className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50">
                  Merge {selectedIds.length} into #{primaryPick}
                </button>
                <span className="text-xs text-violet-600">{selectedIds.length < 2 ? 'Select at least 2 rows' : `Keeping #${primaryPick}, absorbing ${selectedIds.length - 1} other${selectedIds.length - 1 === 1 ? '' : 's'}`}</span>
              </div>
            </div>
          )}
        </div>
      )}

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
            const miss = missingFields(r);
            // Show "missing" only for real-but-incomplete requests (some info present,
            // not priced, not filed as non-quote).
            const showMissing = lc !== 'not_quote' && !r.quote_total && miss.length > 0 && miss.length < 4;
            // The AI reply composer only belongs when it is OUR turn (needs_reply).
            // In Awaiting/Resolved/etc. we already replied, so no "Generate AI reply".
            const canReply = lc === 'needs_reply';
            const canSend = canReply && (r.status === 'auto_ready' || r.status === 'needs_review' || showMissing);
            const route = mapSrc(trip?.pickup_address, trip?.dropoff_address);
            const appt = apptRelative(trip?.date_of_service, (trip as { start_time?: string })?.start_time);
            const tg = tagsFor(r);
            const replyFrom = r.reply_from || r.mailbox || null;
            const draft = drafts[r.id] || (r.ai_draft ? { subject: r.ai_draft.subject, text: r.ai_draft.text } : null);
            const rubric = r.ai_draft?.rubric;
            const sr = sendResult[r.id];
            const conv = convs[r.id];
            const actionBusy = busy[r.id];
            const dup = dupMap.get(r.id);
            const mergedKids = mergedChildren.get(r.id)?.length || 0;
            const isMerged = r.merged_into != null;
            const selected = selectedIds.includes(r.id);

            return (
              <div key={r.id} className={`overflow-hidden rounded-lg border ${selected ? 'border-violet-400 ring-2 ring-violet-200' : (dup?.isDup || isMerged) ? 'border-dashed border-amber-300 bg-amber-50/30 opacity-80' : lcMeta.card}`}>
                <div className="flex items-stretch">
                  <div className={`w-1.5 shrink-0 ${(dup?.isDup || isMerged) ? 'bg-amber-300' : lcMeta.bar}`} />
                  {mergeMode && (
                    <button onClick={() => toggleSelect(r.id)} className="flex items-center px-3" title="Select for merge">
                      <span className={`flex h-5 w-5 items-center justify-center rounded border ${selected ? 'border-violet-600 bg-violet-600 text-white' : 'border-gray-300 bg-white'}`}>{selected ? '✓' : ''}</span>
                    </button>
                  )}
                  <div className="flex min-w-0 flex-1 items-stretch gap-3 px-4 py-3">
                    <button onClick={() => mergeMode ? toggleSelect(r.id) : setOpenId(open ? null : r.id)} className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isMerged
                          ? <span className="rounded-full bg-violet-200 px-2 py-0.5 text-xs font-semibold text-violet-900">&#128279; Merged into #{r.merged_into}</span>
                          : dup?.isDup
                          ? <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900">&#128203; Duplicate of #{dup.canonId}</span>
                          : <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${lcMeta.chip}`}>{lcMeta.label}</span>}
                        {dup && !dup.isDup && dup.count > 1 && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800" title="The same request arrived more than once; copies are grouped here.">{dup.count - 1} duplicate{dup.count - 1 === 1 ? '' : 's'}</span>
                        )}
                        {mergedKids > 0 && (
                          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800" title="Other rows were merged into this one.">{mergedKids} merged</span>
                        )}
                        {!isMerged && !dup?.isDup && (() => { const it = intentTag(r); return it ? <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${it.cls}`}>{it.label}</span> : null; })()}
                        {showMissing && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700" title="More info needed before we can quote.">Missing: {miss.join(', ')}</span>}
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
                    {route && <iframe src={route} title={`route-${r.id}`} loading="lazy" className="hidden sm:block w-52 h-28 shrink-0 rounded-md border border-gray-200" />}
                    <button onClick={() => mergeMode ? toggleSelect(r.id) : setOpenId(open ? null : r.id)} className="text-right shrink-0 self-center">
                      <div className="text-lg font-semibold text-gray-900">{money(r.quote_total)}</div>
                      <div className="text-xs text-gray-400">{mergeMode ? (selected ? 'Selected' : 'Select') : (open ? 'Hide' : 'Open')}</div>
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

                    {/* What's missing before we can quote */}
                    {lc !== 'not_quote' && !r.quote_total && miss.length > 0 && (
                      <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm">
                        <div className="font-medium text-orange-800">To send a proper quote, we still need:</div>
                        <ul className="mt-1 list-disc pl-5 text-orange-700">{miss.map((m, i) => <li key={i}>{m}</li>)}</ul>
                        {canReply
                          ? <div className="mt-1 text-xs text-orange-600">Use &quot;Generate AI reply&quot; below to draft a note asking the customer for exactly these.</div>
                          : <div className="mt-1 text-xs text-orange-600">We already asked the customer for these and are awaiting their reply.</div>}
                      </div>
                    )}

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
                              {conv.slice().reverse().map((m, idx) => {
                                const isBookRides = /bookridesonline/i.test(m.from || '');
                                const who = m.direction === 'outbound'
                                  ? 'LandJet · we sent'
                                  : isBookRides ? 'Customer request (via BookRides) · received' : `${m.from || 'Customer'} · received`;
                                return (
                                  <div key={m.id} className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${m.direction === 'outbound' ? 'ml-auto bg-blue-50 text-blue-900' : 'bg-gray-100 text-gray-700'} ${idx === 0 ? 'ring-1 ring-blue-300' : ''}`}>
                                    <div className="mb-0.5 flex items-center justify-between gap-3 text-[10px]">
                                      <span className={`font-medium ${m.direction === 'outbound' ? 'text-blue-600' : 'text-gray-500'}`}>{who}{idx === 0 ? ' · latest' : ''}</span>
                                      <span className="text-gray-400">{timeAgo(m.at)}</span>
                                    </div>
                                    <div className="whitespace-pre-wrap">{m.preview}</div>
                                  </div>
                                );
                              })}
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Lifecycle controls */}
                    <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
                      {filter === 'deleted' ? (
                        <>
                          <span className="text-xs text-gray-500">Deleted {timeAgo(r.deleted_at)}.</span>
                          <button onClick={() => handleRestore(r.id)} disabled={!!actionBusy}
                            className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100">Restore</button>
                        </>
                      ) : isMerged ? (
                        <>
                          <span className="text-xs text-violet-700">This request was merged into #{r.merged_into}.</span>
                          <button onClick={() => handleUnmerge(r.id)} disabled={!!actionBusy}
                            className="rounded-md bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100">Unmerge</button>
                        </>
                      ) : lc === 'not_quote' ? (
                        <>
                          <span className="text-xs text-gray-500">Not a quote request.</span>
                          <button onClick={() => handleReclassify(r.id, 'quote')} disabled={!!actionBusy}
                            className="rounded-md bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100" title="Restore it AND teach the system this sender is a quote.">Actually a quote</button>
                          <button onClick={() => handleDelete(r.id)} disabled={!!actionBusy}
                            className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200">&#128465;&#65039; Delete</button>
                        </>
                      ) : (
                        <>
                          <span className="text-xs text-gray-400">Mark:</span>
                          <button onClick={() => handleLifecycle(r.id, 'booked')} disabled={!!actionBusy}
                            className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">&#9989; Booked</button>
                          <button onClick={() => handleLifecycle(r.id, 'closed')} disabled={!!actionBusy}
                            className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200">Closed (no deal)</button>
                          {RESOLVED_STATES.includes(lc) && (
                            <button onClick={() => handleLifecycle(r.id, 'needs_reply')} disabled={!!actionBusy}
                              className="rounded-md bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100">Reopen</button>
                          )}
                          <button onClick={() => handleReclassify(r.id, 'not_quote')} disabled={!!actionBusy}
                            className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-200" title="Not a quote request -- move it out AND teach the system.">Not a quote</button>
                          {lc === 'completed' && <span className="text-xs text-teal-600">Auto-resolved (customer signed off)</span>}
                          {mergedKids > 0 && <span className="text-xs text-violet-600">{mergedKids} other request{mergedKids === 1 ? '' : 's'} merged in</span>}
                        </>
                      )}
                      <button onClick={() => { setFbOpen(fbOpen === r.id ? null : r.id); setFbCategory('misclassified'); setFbComment(''); }}
                        className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50" title="Tell us what's wrong; we fix it and learn.">
                        &#9888;&#65039; Report an issue
                      </button>
                      {actionBusy && <span className="text-xs text-gray-400">{actionBusy}</span>}
                    </div>

                    {fbResult[r.id] && <div className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{fbResult[r.id]}</div>}

                    {fbOpen === r.id && (
                      <div className="rounded-md border border-gray-200 bg-gray-50/70 p-3 space-y-2">
                        <div className="text-sm font-medium text-gray-700">What&apos;s wrong with this reservation?</div>
                        <div className="flex flex-wrap items-center gap-2">
                          <select value={fbCategory} onChange={e => setFbCategory(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-xs">
                            <option value="misclassified">Wrong classification (quote vs not)</option>
                            <option value="wrong_route">Wrong pickup / dropoff</option>
                            <option value="wrong_trip">Wrong date / passengers</option>
                            <option value="wrong_price">Wrong price</option>
                            <option value="wrong_reply">AI reply was wrong</option>
                            <option value="wrong_status">Wrong status (needs reply / awaiting / resolved)</option>
                            <option value="other">Something else</option>
                          </select>
                          {/* category-specific one-click fixes */}
                          {fbCategory === 'misclassified' && lc !== 'not_quote' && (
                            <button onClick={() => handleFeedback(r.id, 'misclassified', fbComment, 'reclassify_not_quote')} disabled={!!actionBusy}
                              className="rounded bg-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-300">This is NOT a quote (file + learn)</button>
                          )}
                          {fbCategory === 'misclassified' && lc === 'not_quote' && (
                            <button onClick={() => handleFeedback(r.id, 'misclassified', fbComment, 'reclassify_quote')} disabled={!!actionBusy}
                              className="rounded bg-rose-100 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-200">This IS a quote (restore + learn)</button>
                          )}
                          {(fbCategory === 'wrong_route' || fbCategory === 'wrong_trip' || fbCategory === 'wrong_price') && (
                            <button onClick={() => handleFeedback(r.id, fbCategory, fbComment, 're_extract')} disabled={!!actionBusy}
                              className="rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-200">Re-read conversation &amp; fix</button>
                          )}
                          {fbCategory === 'wrong_status' && (['needs_reply', 'awaiting_customer', 'booked', 'closed'] as const).map(s => (
                            <button key={s} onClick={() => handleFeedback(r.id, 'wrong_status', fbComment, `set_lifecycle:${s}`)} disabled={!!actionBusy}
                              className="rounded bg-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-300">{LIFECYCLE_META[s]?.label || s}</button>
                          ))}
                        </div>
                        <textarea value={fbComment} onChange={e => setFbComment(e.target.value)} rows={2}
                          placeholder="Describe exactly what's wrong (optional but helps us learn)..."
                          className="w-full rounded border border-gray-300 px-2 py-1 text-xs" />
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleFeedback(r.id, fbCategory, fbComment)} disabled={!!actionBusy || (!fbComment.trim())}
                            className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50">Submit feedback</button>
                          <button onClick={() => setFbOpen(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                        </div>
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
