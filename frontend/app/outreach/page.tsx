'use client';

import { useState, useEffect } from 'react';
import {
  getOutreachToday, advanceOutreachContact, skipOutreachContact,
  assignContactCampaign, getCampaigns,
  OutreachContact,
} from '@/lib/api';

interface CampaignOption { id: string; name: string; }

export default function OutreachPage() {
  const [contacts, setContacts] = useState<OutreachContact[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  async function fetchData() {
    try {
      const [contactRes, campaignRes] = await Promise.allSettled([
        getOutreachToday(),
        getCampaigns() as Promise<{ campaigns: CampaignOption[]; total: number }>,
      ]);

      if (contactRes.status === 'fulfilled') setContacts(contactRes.value);
      if (campaignRes.status === 'fulfilled') setCampaigns(campaignRes.value.campaigns);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => fetchData(), 500);
    return () => clearTimeout(timer);
  }, []);

  async function handleAdvance(contactId: string) {
    setActing(contactId);
    try {
      await advanceOutreachContact(contactId);
      setContacts(prev => prev.filter(c => c.contact_id !== contactId));
    } catch (e) { setError((e as Error).message); }
    finally { setActing(null); }
  }

  async function handleSkip(contactId: string) {
    setActing(contactId);
    try {
      await skipOutreachContact(contactId);
      setContacts(prev => prev.filter(c => c.contact_id !== contactId));
    } catch (e) { setError((e as Error).message); }
    finally { setActing(null); }
  }

  async function handleCampaignChange(contactId: string, campaignId: string) {
    setActing(contactId);
    try {
      await assignContactCampaign(contactId, campaignId || null);
      setContacts(prev => prev.map(c =>
        c.contact_id === contactId ? { ...c, campaign_id: campaignId || null } : c
      ));
    } catch (e) { setError((e as Error).message); }
    finally { setActing(null); }
  }

  const filteredContacts = filter === 'all'
    ? contacts
    : filter === 'unassigned'
      ? contacts.filter(c => !c.vertical)
      : contacts.filter(c => c.vertical === filter);

  const verticals = [...new Set(contacts.map(c => c.vertical).filter(Boolean))] as string[];

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Outreach</h1>
        <p className="mt-4 text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Outreach</h1>
          <p className="mt-1 text-sm text-gray-500">
            {filteredContacts.length} contact{filteredContacts.length !== 1 ? 's' : ''} ready today
          </p>
        </div>
        <button onClick={() => { setLoading(true); fetchData(); }}
          className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50">
          Refresh
        </button>
      </div>

      {/* Filter Bar */}
      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <button onClick={() => setFilter('all')}
          className={`rounded-full px-3 py-1 text-xs font-medium ${filter === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          All ({contacts.length})
        </button>
        {verticals.map(v => (
          <button key={v} onClick={() => setFilter(v)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${filter === v ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {v} ({contacts.filter(c => c.vertical === v).length})
          </button>
        ))}
        {contacts.some(c => !c.vertical) && (
          <button onClick={() => setFilter('unassigned')}
            className={`rounded-full px-3 py-1 text-xs font-medium ${filter === 'unassigned' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            Unassigned ({contacts.filter(c => !c.vertical).length})
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {filteredContacts.length === 0 && !error && (
        <div className="mt-8 text-center text-sm text-gray-400">No contacts match this filter.</div>
      )}

      {/* Contact Cards */}
      <div className="mt-4 space-y-4">
        {filteredContacts.map(contact => (
          <div key={contact.contact_id} className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{contact.name}</h2>
                <p className="text-sm text-gray-500">{contact.email}</p>
                <div className="mt-2 flex items-center gap-2">
                  {contact.vertical && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">{contact.vertical}</span>
                  )}
                  {contact.tier && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">Tier {contact.tier}</span>
                  )}
                  <span className="text-xs text-gray-400">Priority: {contact.priority_score}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select value={contact.campaign_id || ''} onChange={e => handleCampaignChange(contact.contact_id, e.target.value)}
                  disabled={acting === contact.contact_id}
                  className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-600 focus:border-gray-400 focus:outline-none disabled:opacity-50">
                  <option value="">No Campaign</option>
                  {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button onClick={() => handleSkip(contact.contact_id)} disabled={acting === contact.contact_id}
                  className="rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                  Skip
                </button>
                <button onClick={() => handleAdvance(contact.contact_id)} disabled={acting === contact.contact_id}
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
                  {acting === contact.contact_id ? '...' : 'Approve & Send'}
                </button>
              </div>
            </div>

            <div className="mt-3 rounded-md bg-gray-50 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Draft</p>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-400">{contact.draft.source}</span>
              </div>
              <p className="mt-1 text-sm font-medium text-gray-700">Subject: {contact.draft.subject}</p>
              <pre className="mt-2 whitespace-pre-wrap text-sm text-gray-600 font-sans">{contact.draft.body}</pre>
            </div>

            <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
              <span>Stage {contact.sequence_stage}</span>
              <span>{contact.suggested_action}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
