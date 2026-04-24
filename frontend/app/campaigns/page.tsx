'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { getCampaigns, getBatchCampaignAnalytics, createStrategy, login } from '@/lib/api';

async function ensureAuth() {
  if (typeof window === 'undefined') return;
  const existing = localStorage.getItem('token');
  if (existing) {
    try { const p = JSON.parse(atob(existing.split('.')[1])); if (p.exp * 1000 > Date.now()) return; } catch {}
    localStorage.removeItem('token');
  }
  try { const r = await login('admin@landjet.com', 'Admin123!'); localStorage.setItem('token', r.token); } catch {}
}

interface CampaignRow {
  id: string;
  name: string;
  type: string;
  status: string;
  approval_status: string;
  ai_system_prompt: string | null;
  settings: any;
  channel_config: any;
  analytics?: {
    total_contacts: number;
    active: number;
    completed: number;
    contacted: number;
    never_contacted: number;
  };
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function load() {
      await ensureAuth();
      try {
        const campRes = await getCampaigns() as { campaigns: CampaignRow[]; total: number };
        const camps = campRes.campaigns.filter((c: CampaignRow) => !c.name.startsWith('MB Capital'));

        // Single batch request instead of N individual analytics calls
        const ids = camps.map(c => c.id).filter(Boolean);
        if (ids.length > 0) {
          try {
            const batchRes = await getBatchCampaignAnalytics(ids);
            for (const c of camps) {
              if (batchRes.analytics[c.id]) {
                c.analytics = batchRes.analytics[c.id];
              }
            }
          } catch {}
        }

        // Sort by contact count descending
        camps.sort((a, b) => (b.analytics?.total_contacts || 0) - (a.analytics?.total_contacts || 0));
        setCampaigns(camps);
      } catch {}
      setLoading(false);
    }
    load();
  }, []);

  async function handleCreate() {
    if (!newName.trim() || !newPrompt.trim()) return;
    setCreating(true);
    try {
      await createStrategy(newName.trim(), newPrompt.trim());
      window.location.reload();
    } catch {}
    setCreating(false);
  }

  const { totalLeads, totalActive, totalCompleted } = useMemo(() => ({
    totalLeads: campaigns.reduce((sum, c) => sum + (c.analytics?.total_contacts || 0), 0),
    totalActive: campaigns.reduce((sum, c) => sum + (c.analytics?.active || 0), 0),
    totalCompleted: campaigns.reduce((sum, c) => sum + (c.analytics?.completed || 0), 0),
  }), [campaigns]);

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
        <p className="mt-4 text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="mt-1 text-sm text-gray-500">{campaigns.length} campaigns, {totalLeads.toLocaleString()} total leads</p>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="mt-4 grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-400">Total Leads</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{totalLeads.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-400">Active</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">{totalActive.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-400">Completed</p>
          <p className="mt-1 text-2xl font-semibold text-gray-500">{totalCompleted.toLocaleString()}</p>
        </div>
      </div>

      {/* Campaign Cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {campaigns.map(c => {
          const a = c.analytics;
          const total = a?.total_contacts || 0;
          const active = a?.active || 0;
          const completed = a?.completed || 0;
          const contacted = a?.contacted || 0;
          const neverContacted = a?.never_contacted || 0;
          const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;

          return (
            <Link key={c.id} href={`/campaigns/${c.id}`}
              className="block rounded-lg border border-gray-200 bg-white p-5 hover:border-gray-300 hover:shadow-sm transition-all">

              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{c.name}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      c.approval_status === 'live' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {c.approval_status === 'live' ? 'Active' : c.status}
                    </span>
                    {c.settings?.sender_name && (
                      <span className="text-xs text-gray-400">{c.settings.sender_name}</span>
                    )}
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                      {(c as any).channel_config?.email?.daily_limit || 5}/day
                    </span>
                    <span className="text-xs text-gray-400">
                      P{c.settings?.priority || 50}
                    </span>
                  </div>
                </div>
                <span className="text-lg font-semibold text-gray-900">{total.toLocaleString()}</span>
              </div>

              {/* Stats Row */}
              <div className="mt-4 grid grid-cols-4 gap-2">
                <div>
                  <p className="text-xs text-gray-400">Active</p>
                  <p className="text-sm font-medium text-gray-900">{active}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Completed</p>
                  <p className="text-sm font-medium text-gray-900">{completed}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Contacted</p>
                  <p className="text-sm font-medium text-gray-900">{contacted}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">New</p>
                  <p className="text-sm font-medium text-gray-900">{neverContacted}</p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>Progress</span>
                  <span>{progressPct}%</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-gray-100">
                  <div className="h-1.5 rounded-full bg-emerald-500 transition-all" style={{ width: `${progressPct}%` }} />
                </div>
              </div>

              {/* Prompt Preview */}
              {c.ai_system_prompt && (
                <p className="mt-3 text-xs text-gray-400 line-clamp-2">{c.ai_system_prompt}</p>
              )}
            </Link>
          );
        })}
      </div>

      {/* New Campaign */}
      {showNew ? (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
          <p className="font-medium text-gray-900">New Campaign</p>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Campaign name"
            className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500" />
          <textarea value={newPrompt} onChange={e => setNewPrompt(e.target.value)} placeholder="AI prompt for email generation..." rows={4}
            className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500" />
          <div className="mt-2 flex gap-2">
            <button onClick={handleCreate} disabled={creating || !newName.trim() || !newPrompt.trim()}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button onClick={() => { setShowNew(false); setNewName(''); setNewPrompt(''); }}
              className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowNew(true)}
          className="mt-6 w-full rounded-lg border border-dashed border-gray-300 py-3 text-sm font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700">
          + New Campaign
        </button>
      )}
    </div>
  );
}
