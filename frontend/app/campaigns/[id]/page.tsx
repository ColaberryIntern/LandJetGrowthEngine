'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getStats, runCycle, getDrafts, getCampaignLeads } from '@/lib/api';
import Link from 'next/link';

interface Stats {
  pending_drafts: number;
  approved_today: number;
  rejected_today: number;
  sent_today: number;
  active_leads: number;
  completed_leads: number;
}

interface LeadRow {
  lead_id: number;
  name: string;
  company: string;
  step: number;
  status: 'active' | 'completed' | 'paused' | 'removed';
  outreach_step: string;
  last_action: string;
  next_action: string;
  draft_id: string | null;
}

const STEP_LABELS = ['Intro', 'Follow-up', 'Last Email'];

const SEQUENCE_STEPS = [
  { name: 'Intro', delay: 'Day 0', goal: 'Re-establish connection', tone: 'Warm' },
  { name: 'Follow-up', delay: 'Day 4', goal: 'Add value and build interest', tone: 'Professional' },
  { name: 'Last Email', delay: 'Day 8', goal: 'Graceful close', tone: 'Warm' },
];

export default function CampaignDetailPage() {
  const params = useParams();
  const campaignId = params.id as string;

  const [stats, setStats] = useState<Stats | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [approvalMode, setApprovalMode] = useState<'manual' | 'autonomous'>('manual');
  const [selectedLead, setSelectedLead] = useState<number | null>(null);

  async function fetchData() {
    try {
      const [statsRes, leadsRes, draftsRes] = await Promise.all([
        getStats(campaignId),
        getCampaignLeads(campaignId).catch(() => ({ leads: [], total: 0 })),
        getDrafts(campaignId).catch(() => ({ drafts: [], total: 0 })),
      ]);
      setStats(statsRes as Stats);

      // Build name map from drafts (drafts have enriched lead data)
      const nameMap = new Map<number, { name: string; company: string }>();
      for (const d of (draftsRes as any).drafts) {
        if (d.lead) {
          nameMap.set(d.lead_id, {
            name: `${d.lead.first_name} ${d.lead.last_name}`,
            company: d.lead.company || '—',
          });
        }
      }

      // Draft ID map (most recent per lead)
      const draftMap = new Map<number, string>();
      for (const d of (draftsRes as any).drafts) {
        draftMap.set(d.lead_id, d.id);
      }

      // Build lead rows from campaign leads
      const rows: LeadRow[] = ((leadsRes as any).leads || []).map((cl: any) => {
        const meta = cl.metadata || {};
        const info = nameMap.get(cl.lead_id) || { name: `Lead #${cl.lead_id}`, company: '—' };
        return {
          lead_id: cl.lead_id,
          name: info.name,
          company: info.company,
          step: cl.current_step_index + 1,
          status: cl.status,
          outreach_step: meta.outreach_step || '1st_outreach',
          last_action: cl.last_activity_at ? new Date(cl.last_activity_at).toLocaleDateString() : 'Draft created',
          next_action: cl.status === 'completed' ? 'Sequence done' :
            cl.next_action_at ? new Date(cl.next_action_at).toLocaleDateString() : 'Pending approval',
          draft_id: draftMap.get(cl.lead_id) || null,
        };
      });
      setLeads(rows);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, [campaignId]);

  async function handleRunCycle() {
    setRunning(true);
    setRunMsg(null);
    try {
      const res = (await runCycle(campaignId)) as { draftsCreated: number };
      setRunMsg({
        type: 'success',
        text: res.draftsCreated > 0
          ? `${res.draftsCreated} new draft${res.draftsCreated > 1 ? 's' : ''} generated`
          : 'No leads due for drafts right now',
      });
      // Refresh all data
      await fetchData();
      setTimeout(() => setRunMsg(null), 4000);
    } catch {
      setRunMsg({ type: 'error', text: 'Failed to generate drafts' });
      setTimeout(() => setRunMsg(null), 4000);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/campaigns" className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">CEO Intro Campaign</h1>
            <p className="mt-0.5 text-sm text-gray-500">3-step executive outreach sequence</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Active</span>
          <button
            onClick={handleRunCycle}
            disabled={running}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {running ? 'Running...' : 'Run Cycle'}
          </button>
        </div>
      </div>

      {runMsg && (
        <div className={`mt-3 rounded-md px-4 py-2.5 text-sm font-medium ${
          runMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
        }`}>
          {runMsg.text}
        </div>
      )}

      {/* SEQUENCE STEPS */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Sequence</h2>
        <div className="mt-3 rounded-lg border border-gray-200 bg-white p-5">
          <div className="space-y-0">
            {SEQUENCE_STEPS.map((step, i) => (
              <div key={i} className="flex gap-4">
                {/* Timeline */}
                <div className="flex flex-col items-center">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">
                    {i + 1}
                  </div>
                  {i < SEQUENCE_STEPS.length - 1 && (
                    <div className="w-px flex-1 bg-gray-200" style={{ minHeight: 40 }} />
                  )}
                </div>
                {/* Content */}
                <div className="pb-6">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">{step.name}</p>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{step.delay}</span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{step.tone}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-gray-500">{step.goal}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* LEAD PROGRESS */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Lead Progress</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">Active Leads</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">
              {loading ? '—' : stats?.active_leads ?? 0}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">Completed</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">
              {loading ? '—' : stats?.completed_leads ?? 0}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">Drafts Pending</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">
              {loading ? '—' : stats?.pending_drafts ?? 0}
            </p>
            {(stats?.pending_drafts ?? 0) > 0 && (
              <Link href="/drafts" className="mt-1 inline-block text-xs text-gray-500 underline underline-offset-2 hover:text-gray-700">
                Review drafts →
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* LEADS TABLE */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Leads</h2>
        <div className="mt-3 rounded-lg border border-gray-200 bg-white overflow-hidden">
          {leads.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">
              {loading ? 'Loading leads...' : 'No leads enrolled yet'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Company</th>
                  <th className="px-5 py-3">Step</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Last Action</th>
                  <th className="px-5 py-3">Next</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr
                    key={lead.lead_id}
                    onClick={() => setSelectedLead(selectedLead === lead.lead_id ? null : lead.lead_id)}
                    className={`cursor-pointer border-b border-gray-50 transition-colors ${
                      selectedLead === lead.lead_id ? 'bg-gray-50' : 'hover:bg-gray-50/50'
                    }`}
                  >
                    <td className="px-5 py-3 font-medium text-gray-900">{lead.name}</td>
                    <td className="px-5 py-3 text-gray-500">{lead.company}</td>
                    <td className="px-5 py-3">
                      <span className="text-gray-900">{lead.step}</span>
                      <span className="text-gray-400">/{SEQUENCE_STEPS.length}</span>
                      <span className="ml-1 text-xs text-gray-400">
                        {STEP_LABELS[lead.step - 1] || ''}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        lead.status === 'active' ? 'bg-blue-100 text-blue-700' :
                        lead.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                        lead.status === 'paused' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500">{lead.last_action}</td>
                    <td className="px-5 py-3 text-gray-500">{lead.next_action}</td>
                    <td className="px-5 py-3">
                      {lead.draft_id && (
                        <Link
                          href="/drafts"
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-gray-500 underline underline-offset-2 hover:text-gray-700"
                        >
                          View Draft
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* CONTROL PANEL */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Controls</h2>
        <div className="mt-3 rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm font-medium text-gray-900">Approval Mode</p>
          <div className="mt-3 space-y-2">
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="radio"
                name="approval"
                checked={approvalMode === 'manual'}
                onChange={() => setApprovalMode('manual')}
                className="h-4 w-4 accent-gray-900"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">Manual</p>
                <p className="text-xs text-gray-500">Every draft requires human approval before sending</p>
              </div>
            </label>
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="radio"
                name="approval"
                checked={approvalMode === 'autonomous'}
                onChange={() => setApprovalMode('autonomous')}
                className="h-4 w-4 accent-gray-900"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">Autonomous</p>
                <p className="text-xs text-gray-500">High-quality drafts auto-approved (coming soon)</p>
              </div>
            </label>
          </div>
          {approvalMode === 'manual' && (
            <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Manual mode active — all drafts require approval before send
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
