'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getCampaignById, updateCampaignFields, getCampaignContacts, getCampaignAnalytics, uploadCampaignCSV } from '@/lib/api';

type Tab = 'overview' | 'leads' | 'strategy' | 'settings';

const VIRTUAL_NAMES: Record<string, string> = { all: 'All Contacts', unclassified: 'Unclassified' };

export default function CampaignDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const isVirtual = id === 'all' || id === 'unclassified';

  const [campaign, setCampaign] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [saving, setSaving] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // Strategy state
  const [prompt, setPrompt] = useState('');
  const [steps, setSteps] = useState<any[]>([]);

  // Settings state
  const [senderName, setSenderName] = useState('Ryan Landry');
  const [senderRole, setSenderRole] = useState('CEO, LandJet');
  const [senderEmail, setSenderEmail] = useState('rmlandry29@gmail.com');
  const [emailsPerDay, setEmailsPerDay] = useState(20);
  const [followUpDelay, setFollowUpDelay] = useState(4);
  const [aiDrafts, setAiDrafts] = useState(true);

  // Leads state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [uploadText, setUploadText] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const fetches: Promise<any>[] = [
          getCampaignContacts(id),
          getCampaignAnalytics(id),
        ];
        if (!isVirtual) fetches.push(getCampaignById(id));

        const results = await Promise.allSettled(fetches);

        if (results[0].status === 'fulfilled') setContacts(results[0].value.contacts);
        if (results[1].status === 'fulfilled') setAnalytics(results[1].value);

        if (!isVirtual && results[2]?.status === 'fulfilled') {
          const c = results[2].value.campaign;
          setCampaign(c);
          setPrompt(c.ai_system_prompt || '');
          setSteps(c.sequence_steps || []);
          setSenderName(c.settings?.sender_name || 'Ryan Landry');
          setSenderRole(c.settings?.sender_role || 'CEO, LandJet');
          setSenderEmail(c.settings?.sender_email || 'rmlandry29@gmail.com');
          setEmailsPerDay(c.channel_config?.email?.daily_limit || 20);
          setFollowUpDelay(c.settings?.follow_up_delay_days || 4);
          setAiDrafts(c.settings?.ai_drafts_enabled ?? true);
        }
      } catch {}
      setLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [id, isVirtual]);

  async function saveField(section: string, updates: object) {
    if (isVirtual) return;
    setSaving(section);
    try {
      const res = await updateCampaignFields(id, updates);
      setCampaign(res.campaign);
      setFlash(section);
      setTimeout(() => setFlash(null), 2000);
    } catch {}
    setSaving(null);
  }

  async function handleUpload() {
    if (!uploadText.trim()) return;
    setUploading(true);
    try {
      const res = await uploadCampaignCSV(id, uploadText);
      alert(`Created: ${res.created}, Skipped: ${res.skipped}`);
      setShowUpload(false);
      setUploadText('');
      const refreshed = await getCampaignContacts(id);
      setContacts(refreshed.contacts);
      const refreshedAnalytics = await getCampaignAnalytics(id);
      setAnalytics(refreshedAnalytics);
    } catch {}
    setUploading(false);
  }

  function updateStep(index: number, field: string, value: any) {
    const updated = [...steps];
    updated[index] = { ...updated[index], [field]: value };
    setSteps(updated);
  }

  const filteredContacts = contacts.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (c.name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q) || (c.company || '').toLowerCase().includes(q);
    }
    return true;
  });

  const title = isVirtual ? VIRTUAL_NAMES[id] : campaign?.name || 'Campaign';
  const tabs: { key: Tab; label: string }[] = isVirtual
    ? [{ key: 'overview', label: 'Overview' }, { key: 'leads', label: 'Leads' }]
    : [{ key: 'overview', label: 'Overview' }, { key: 'leads', label: 'Leads' }, { key: 'strategy', label: 'Strategy' }, { key: 'settings', label: 'Settings' }];

  if (loading) {
    return <div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1><p className="mt-4 text-sm text-gray-500">Loading...</p></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {!isVirtual && campaign && (
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${campaign.approval_status === 'live' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
              {campaign.approval_status === 'live' ? 'Active' : campaign.status}
            </span>
          )}
        </div>
        <a href="/campaigns" className="text-sm text-gray-500 hover:text-gray-900">Back</a>
      </div>

      {/* Tabs */}
      <div className="mt-4 flex gap-1 border-b border-gray-200">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {/* OVERVIEW TAB */}
        {tab === 'overview' && analytics && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[
                { label: 'Total', value: analytics.total_contacts },
                { label: 'Active', value: analytics.active },
                { label: 'Completed', value: analytics.completed },
                { label: 'Never Contacted', value: analytics.never_contacted },
              ].map(m => (
                <div key={m.label} className="rounded-lg border border-gray-200 bg-white p-4">
                  <p className="text-xs text-gray-400">{m.label}</p>
                  <p className="mt-1 text-2xl font-semibold text-gray-900">{m.value}</p>
                </div>
              ))}
            </div>

            {Object.keys(analytics.by_stage).length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">By Stage</p>
                <div className="mt-2 flex gap-4">
                  {Object.entries(analytics.by_stage).sort().map(([stage, count]) => (
                    <div key={stage} className="text-sm"><span className="font-medium text-gray-900">Stage {stage}:</span> <span className="text-gray-500">{count as number}</span></div>
                  ))}
                </div>
              </div>
            )}

            {Object.keys(analytics.by_vertical).length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">By Vertical</p>
                <div className="mt-2 flex gap-4 flex-wrap">
                  {Object.entries(analytics.by_vertical).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([v, count]) => (
                    <div key={v} className="text-sm"><span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">{v}</span> <span className="text-gray-500">{count as number}</span></div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* LEADS TAB */}
        {tab === 'leads' && (
          <div>
            <div className="flex items-center justify-between gap-4">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, company..."
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none" />
              <div className="flex gap-1">
                {['all', 'ACTIVE', 'COMPLETED'].map(s => (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${statusFilter === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {s === 'all' ? 'All' : s}
                  </button>
                ))}
              </div>
              {!isVirtual && (
                <button onClick={() => setShowUpload(!showUpload)}
                  className="rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
                  Upload CSV
                </button>
              )}
            </div>

            {showUpload && (
              <div className="mt-3 rounded-lg border border-gray-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">CSV Upload</p>
                <p className="mt-1 text-xs text-gray-400">Format: name,email,company (header required, company optional)</p>
                <textarea value={uploadText} onChange={e => setUploadText(e.target.value)} rows={5} placeholder="name,email,company&#10;John Doe,john@example.com,Acme Corp"
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-gray-500 focus:outline-none" />
                <div className="mt-2 flex gap-2">
                  <button onClick={handleUpload} disabled={uploading || !uploadText.trim()}
                    className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
                    {uploading ? 'Uploading...' : 'Upload'}
                  </button>
                  <button onClick={() => { setShowUpload(false); setUploadText(''); }}
                    className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
                </div>
              </div>
            )}

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Email</th>
                    <th className="pb-2 font-medium">Company</th>
                    <th className="pb-2 font-medium">Vertical</th>
                    <th className="pb-2 font-medium">Stage</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.slice(0, 100).map((c: any) => (
                    <>
                      <tr key={c.id} onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                        className="border-b border-gray-50 cursor-pointer hover:bg-gray-50">
                        <td className="py-2 text-gray-900">{c.name}</td>
                        <td className="py-2 text-gray-500">{c.email}</td>
                        <td className="py-2 text-gray-500">{c.company || '-'}</td>
                        <td className="py-2">{c.vertical ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">{c.vertical}</span> : '-'}</td>
                        <td className="py-2 text-gray-500">{c.sequence_stage}/3</td>
                        <td className="py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{c.status}</span></td>
                      </tr>
                      {expandedId === c.id && (
                        <tr key={`${c.id}-detail`}>
                          <td colSpan={6} className="bg-gray-50 px-4 py-3">
                            <div className="text-xs text-gray-500 space-y-1">
                              <p><strong>Created:</strong> {new Date(c.created_at).toLocaleDateString()}</p>
                              {c.last_contacted_at && <p><strong>Last Contacted:</strong> {new Date(c.last_contacted_at).toLocaleDateString()}</p>}
                              {c.next_action_at && <p><strong>Next Action:</strong> {new Date(c.next_action_at).toLocaleDateString()}</p>}
                              <p><strong>Tier:</strong> {c.tier || 'None'} | <strong>Priority:</strong> {c.priority_score}</p>
                              <div className="mt-2">
                                <p className="font-semibold text-gray-600">Timeline</p>
                                <div className="mt-1 space-y-1">
                                  <p>Stage 1: {c.sequence_stage >= 1 ? (c.last_contacted_at && c.sequence_stage > 1 ? 'Sent' : 'Pending') : 'Pending'}</p>
                                  <p>Stage 2: {c.sequence_stage >= 2 ? (c.sequence_stage > 2 ? 'Sent' : 'Pending') : 'Waiting'}</p>
                                  <p>Stage 3: {c.sequence_stage >= 3 ? (c.status === 'COMPLETED' ? 'Completed' : 'Pending') : 'Waiting'}</p>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
              {filteredContacts.length > 100 && <p className="mt-2 text-xs text-gray-400">Showing 100 of {filteredContacts.length}</p>}
              {filteredContacts.length === 0 && <p className="mt-4 text-center text-sm text-gray-400">No contacts match</p>}
            </div>
          </div>
        )}

        {/* STRATEGY TAB */}
        {tab === 'strategy' && !isVirtual && (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Campaign Prompt</p>
                {flash === 'prompt' && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Saved</span>}
              </div>
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4}
                className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500" />
              <button onClick={() => saveField('prompt', { ai_system_prompt: prompt.trim() })} disabled={saving === 'prompt'}
                className="mt-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
                {saving === 'prompt' ? 'Saving...' : 'Save Prompt'}
              </button>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Sequence Steps</p>
                {flash === 'steps' && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Saved</span>}
              </div>
              <div className="mt-3 space-y-4">
                {(steps.length > 0 ? steps : [
                  { step: 1, delay_days: 0, prompt: '' },
                  { step: 2, delay_days: 4, prompt: '' },
                  { step: 3, delay_days: 7, prompt: '' },
                ]).map((s: any, i: number) => (
                  <div key={i} className="rounded-md bg-gray-50 p-4">
                    <div className="flex items-center gap-4">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">{s.step}</span>
                      <label className="flex items-center gap-1 text-sm text-gray-600">
                        Delay:
                        <input type="number" min={0} value={s.delay_days} onChange={e => updateStep(i, 'delay_days', parseInt(e.target.value) || 0)}
                          className="w-14 rounded-md border border-gray-300 px-2 py-1 text-sm text-center focus:border-gray-500 focus:outline-none" />
                        days
                      </label>
                    </div>
                    <textarea value={s.prompt} onChange={e => updateStep(i, 'prompt', e.target.value)} rows={2} placeholder="Step-specific prompt (overrides campaign prompt for this stage)"
                      className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-gray-500 focus:outline-none" />
                  </div>
                ))}
              </div>
              <button onClick={() => saveField('steps', { sequence_steps: steps.length > 0 ? steps : [
                { step: 1, delay_days: 0, prompt: '' },
                { step: 2, delay_days: 4, prompt: '' },
                { step: 3, delay_days: 7, prompt: '' },
              ] })} disabled={saving === 'steps'}
                className="mt-3 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
                {saving === 'steps' ? 'Saving...' : 'Save Steps'}
              </button>
            </div>
          </div>
        )}

        {/* SETTINGS TAB */}
        {tab === 'settings' && !isVirtual && (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Sender Identity</p>
                {flash === 'sender' && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Saved</span>}
              </div>
              <div className="mt-3 flex items-center gap-4 flex-wrap">
                <label className="flex items-center gap-2 text-sm text-gray-600">Name <input type="text" value={senderName} onChange={e => setSenderName(e.target.value)} className="w-40 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-gray-500 focus:outline-none" /></label>
                <label className="flex items-center gap-2 text-sm text-gray-600">Role <input type="text" value={senderRole} onChange={e => setSenderRole(e.target.value)} className="w-40 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-gray-500 focus:outline-none" /></label>
                <label className="flex items-center gap-2 text-sm text-gray-600">Email <input type="text" value={senderEmail} onChange={e => setSenderEmail(e.target.value)} className="w-56 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-gray-500 focus:outline-none" /></label>
              </div>
              <button onClick={() => saveField('sender', { settings: { ...(campaign?.settings || {}), sender_name: senderName, sender_role: senderRole, sender_email: senderEmail } })} disabled={saving === 'sender'}
                className="mt-3 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
                {saving === 'sender' ? 'Saving...' : 'Save'}
              </button>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Campaign Settings</p>
                {flash === 'config' && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Saved</span>}
              </div>
              <div className="mt-3 flex items-center gap-6 flex-wrap">
                <label className="flex items-center gap-2 text-sm text-gray-600">Emails/day <input type="number" min={1} max={100} value={emailsPerDay} onChange={e => setEmailsPerDay(parseInt(e.target.value) || 20)} className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm text-center focus:border-gray-500 focus:outline-none" /></label>
                <label className="flex items-center gap-2 text-sm text-gray-600">Follow-up <input type="number" min={1} max={30} value={followUpDelay} onChange={e => setFollowUpDelay(parseInt(e.target.value) || 4)} className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm text-center focus:border-gray-500 focus:outline-none" /> days</label>
                <label className="flex items-center gap-2 text-sm text-gray-600">AI Drafts
                  <button onClick={() => setAiDrafts(!aiDrafts)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${aiDrafts ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                    <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${aiDrafts ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                  </button>
                  <span className="text-xs text-gray-400">{aiDrafts ? 'ON' : 'OFF'}</span>
                </label>
              </div>
              <button onClick={() => saveField('config', {
                settings: { ...(campaign?.settings || {}), follow_up_delay_days: followUpDelay, ai_drafts_enabled: aiDrafts },
                channel_config: { ...(campaign?.channel_config || {}), email: { ...(campaign?.channel_config?.email || {}), enabled: true, daily_limit: emailsPerDay } },
              })} disabled={saving === 'config'}
                className="mt-3 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
                {saving === 'config' ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
