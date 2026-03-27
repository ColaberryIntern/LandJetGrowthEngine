'use client';

import { useState, useEffect, useCallback } from 'react';
import { getDrafts, approveDraft, rejectDraft, runCycle } from '@/lib/api';

interface DraftLead {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  company: string | null;
  title: string | null;
}

interface Draft {
  id: string;
  lead_id: number;
  campaign_id: string;
  step_index: number;
  subject: string | null;
  body: string | null;
  to_email: string | null;
  status: string;
  created_at: string;
  metadata: {
    step_goal?: string;
    step_number?: number;
    polisher_quality_score?: number;
    draft_version?: number;
    ai_model?: string;
  } | null;
  lead: DraftLead | null;
}

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [selected, setSelected] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateMsg, setGenerateMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchDrafts = useCallback(async () => {
    try {
      setError(null);
      const res = await getDrafts() as { drafts: Draft[]; total: number };
      setDrafts(res.drafts);
      // If selected draft is no longer in the list, deselect
      if (selected && !res.drafts.find((d) => d.id === selected.id)) {
        setSelected(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    fetchDrafts();
  }, []);

  async function handleApprove() {
    if (!selected) return;
    setActing(true);
    setActionError(null);
    try {
      await approveDraft(selected.id);
      // Flash success briefly before refreshing
      setFlash('approved');
      setTimeout(async () => {
        setFlash(null);
        setSelected(null);
        setShowRejectInput(false);
        await fetchDrafts();
      }, 1200);
    } catch (e) {
      setActionError('Something went wrong. Try again.');
    } finally {
      setActing(false);
    }
  }

  async function handleReject() {
    if (!selected || !rejectReason.trim()) return;
    setActing(true);
    setActionError(null);
    try {
      await rejectDraft(selected.id, rejectReason.trim());
      setFlash('rejected');
      setTimeout(async () => {
        setFlash(null);
        setSelected(null);
        setRejectReason('');
        setShowRejectInput(false);
        await fetchDrafts();
      }, 1200);
    } catch (e) {
      setActionError('Something went wrong. Try again.');
    } finally {
      setActing(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenerateMsg(null);
    try {
      // run-cycle processes all active CEO intro campaigns regardless of ID
      const res = await runCycle('_all') as { draftsCreated: number; leadsProcessed: number; errors: string[] };
      if (res.draftsCreated > 0) {
        setGenerateMsg({ type: 'success', text: `${res.draftsCreated} new draft${res.draftsCreated > 1 ? 's' : ''} generated` });
      } else {
        setGenerateMsg({ type: 'success', text: 'No leads due for drafts right now' });
      }
      await fetchDrafts();
      setTimeout(() => setGenerateMsg(null), 4000);
    } catch (e) {
      setGenerateMsg({ type: 'error', text: 'Failed to generate drafts' });
      setTimeout(() => setGenerateMsg(null), 4000);
    } finally {
      setGenerating(false);
    }
  }

  function leadName(d: Draft) {
    if (d.lead) return `${d.lead.first_name} ${d.lead.last_name}`;
    return `Lead #${d.lead_id}`;
  }

  function stripHtml(html: string) {
    return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Draft Inbox</h1>
          <p className="mt-1 text-sm text-gray-500">
            Review and approve AI-generated outreach
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
            {drafts.length} pending
          </span>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {generating ? 'Generating...' : 'Generate Drafts'}
          </button>
        </div>
      </div>

      {generateMsg && (
        <div className={`mt-3 rounded-md px-4 py-2.5 text-sm font-medium ${
          generateMsg.type === 'success'
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-red-50 text-red-700'
        }`}>
          {generateMsg.text}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-8 text-center text-sm text-gray-400">Loading drafts...</div>
      ) : drafts.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-gray-300 p-12 text-center">
          <p className="text-sm text-gray-500">No drafts pending review</p>
          <p className="mt-1 text-xs text-gray-400">
            Run a draft cycle from the Campaigns page to generate new drafts.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          {/* LEFT — Draft List */}
          <div className="lg:col-span-2 space-y-2">
            {drafts.map((d) => (
              <button
                key={d.id}
                onClick={() => { setSelected(d); setShowRejectInput(false); setRejectReason(''); setActionError(null); setFlash(null); }}
                className={`w-full rounded-lg border p-4 text-left transition-all ${
                  selected?.id === d.id
                    ? 'border-gray-900 bg-gray-50 ring-1 ring-gray-900'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900">{leadName(d)}</p>
                    <p className="truncate text-sm text-gray-500">
                      {d.lead?.company || 'Unknown company'}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    draft
                  </span>
                </div>
                <p className="mt-2 truncate text-xs text-gray-400">
                  {d.subject || 'No subject'} — Step {(d.metadata?.step_number) || d.step_index + 1}
                </p>
              </button>
            ))}
          </div>

          {/* RIGHT — Draft Detail */}
          <div className="lg:col-span-3">
            {selected ? (
              <div className="rounded-lg border border-gray-200 bg-white">
                {/* Header */}
                <div className="border-b border-gray-100 p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{leadName(selected)}</p>
                      <p className="text-sm text-gray-500">
                        {selected.lead?.title}{selected.lead?.company ? `, ${selected.lead.company}` : ''}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-400">{selected.to_email}</p>
                    </div>
                    <div className="text-right text-xs text-gray-400">
                      {selected.metadata?.step_goal && (
                        <p>Goal: {selected.metadata.step_goal}</p>
                      )}
                      {selected.metadata?.polisher_quality_score !== undefined && (
                        <p>Quality: {selected.metadata.polisher_quality_score}/100</p>
                      )}
                      {selected.metadata?.draft_version && selected.metadata.draft_version > 1 && (
                        <p className="text-amber-600">v{selected.metadata.draft_version} (regenerated)</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 rounded bg-gray-50 px-3 py-2">
                    <p className="text-xs font-medium text-gray-500">Subject</p>
                    <p className="text-sm text-gray-900">{selected.subject || '(no subject)'}</p>
                  </div>
                </div>

                {/* Body */}
                <div className="p-5">
                  <p className="mb-2 text-xs font-medium text-gray-500">Email Body</p>
                  <div className="max-h-80 overflow-y-auto rounded border border-gray-100 bg-gray-50 p-4 text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
                    {selected.body ? stripHtml(selected.body) : '(empty body)'}
                  </div>
                </div>

                {/* Actions */}
                <div className="border-t border-gray-100 p-5">
                  {/* Success flash */}
                  {flash === 'approved' && (
                    <div className="mb-3 flex items-center gap-2 rounded-md bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">
                      <span>Sent ✓</span>
                      <span className="text-emerald-500 font-normal">— Scheduler will deliver on next cycle</span>
                    </div>
                  )}
                  {flash === 'rejected' && (
                    <div className="mb-3 flex items-center gap-2 rounded-md bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-600">
                      <span>Rejected ✓</span>
                      <span className="font-normal">— Draft removed from queue</span>
                    </div>
                  )}

                  {/* Action error */}
                  {actionError && !flash && (
                    <div className="mb-3 rounded-md bg-red-50 px-4 py-2.5 text-sm text-red-700">
                      {actionError}
                    </div>
                  )}

                  {/* Buttons (hidden during flash) */}
                  {!flash && showRejectInput ? (
                    <div className="space-y-3">
                      <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        disabled={acting}
                        placeholder="Why are you rejecting this draft? This helps the AI improve..."
                        rows={3}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 disabled:bg-gray-50 disabled:text-gray-400"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleReject}
                          disabled={acting || !rejectReason.trim()}
                          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {acting ? 'Rejecting...' : 'Confirm Reject'}
                        </button>
                        <button
                          onClick={() => { setShowRejectInput(false); setRejectReason(''); setActionError(null); }}
                          disabled={acting}
                          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : !flash ? (
                    <div className="flex gap-3">
                      <button
                        onClick={handleApprove}
                        disabled={acting}
                        className="rounded-md bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                      >
                        {acting ? 'Approving...' : 'Approve & Send'}
                      </button>
                      <button
                        onClick={() => { setShowRejectInput(true); setActionError(null); }}
                        disabled={acting}
                        className="rounded-md border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-gray-300">
                <p className="text-sm text-gray-400">Select a draft to review</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
