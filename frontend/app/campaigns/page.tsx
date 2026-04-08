'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getCampaigns, getCampaignAnalytics, createStrategy } from '@/lib/api';

interface CampaignRow {
  id: string;
  name: string;
  type: string;
  status: string;
  approval_status: string;
  ai_system_prompt: string | null;
  settings: any;
  contactCount?: number;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [allCount, setAllCount] = useState(0);
  const [unclassifiedCount, setUnclassifiedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const [campRes, allRes, unclRes] = await Promise.allSettled([
          getCampaigns() as Promise<{ campaigns: CampaignRow[]; total: number }>,
          getCampaignAnalytics('all'),
          getCampaignAnalytics('unclassified'),
        ]);

        if (campRes.status === 'fulfilled') {
          const camps = campRes.value.campaigns;
          // Fetch counts for each campaign in parallel
          const countResults = await Promise.allSettled(
            camps.map(c => getCampaignAnalytics(c.id))
          );
          camps.forEach((c, i) => {
            if (countResults[i].status === 'fulfilled') {
              c.contactCount = (countResults[i] as PromiseFulfilledResult<any>).value.total_contacts;
            }
          });
          setCampaigns(camps);
        }

        if (allRes.status === 'fulfilled') setAllCount(allRes.value.total_contacts);
        if (unclRes.status === 'fulfilled') setUnclassifiedCount(unclRes.value.total_contacts);
      } catch {}
      setLoading(false);
    }, 500);
    return () => clearTimeout(timer);
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
          <p className="mt-1 text-sm text-gray-500">Manage outreach campaigns, prompts, and contacts</p>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        {campaigns.map(c => (
          <Link key={c.id} href={`/campaigns/${c.id}`} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-5 py-4 hover:border-gray-300 transition-colors">
            <div>
              <p className="font-medium text-gray-900">{c.name}</p>
              <div className="mt-1 flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  c.approval_status === 'live' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {c.approval_status === 'live' ? 'Active' : c.status}
                </span>
                {c.settings?.sender_name && (
                  <span className="text-xs text-gray-400">Sender: {c.settings.sender_name}</span>
                )}
              </div>
            </div>
            <span className="text-sm text-gray-500">{c.contactCount ?? 0} contacts</span>
          </Link>
        ))}

        {campaigns.length === 0 && (
          <p className="py-4 text-center text-sm text-gray-400">No campaigns yet</p>
        )}
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
