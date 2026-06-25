'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getCampaignById, updateCampaignFields, getCampaignContacts, getCampaignAnalytics, uploadCampaignCSV, rewriteCampaignPrompts, approveCampaign, pullApolloLeads } from '@/lib/api';
import { ensureAuth } from '@/lib/auth';

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

  // Available attachments for the per-step attachment_path picker. Sourced from
  // GET /api/admin/attachments (same list shown on /admin/attachments). Falls
  // back to [] on failure so the editor still renders.
  const [attachmentFiles, setAttachmentFiles] = useState<{ filename: string }[]>([]);

  // The single document this campaign attaches. Ryan picks it once here, then
  // checks it on whichever email steps he wants via a per-step checkbox.
  // Persisted in campaign.settings.attachment_document; falls back to whatever
  // file an existing step already points at so prior wiring shows up.
  const [campaignDoc, setCampaignDoc] = useState<string>('');

  // Settings state
  const [senderName, setSenderName] = useState('Ryan Landry');
  const [senderRole, setSenderRole] = useState('CEO, LandJet');
  const [senderEmail, setSenderEmail] = useState('rmlandry29@gmail.com');
  const [emailsPerDay, setEmailsPerDay] = useState(5);
  const [followUpDelay, setFollowUpDelay] = useState(4);
  const [campaignPriority, setCampaignPriority] = useState(50);
  const [aiDrafts, setAiDrafts] = useState(true);
  const [emailSignature, setEmailSignature] = useState('');
  // Step-count cap (Ali 2026-06-09). 0 = inherit global default (OUTREACH_MAX_STEPS env, defaults to 8).
  // Override here to either raise or lower the ceiling per campaign.
  const [maxSteps, setMaxSteps] = useState<number>(0);
  const GLOBAL_MAX_STEPS_DEFAULT = 8;

  // Leads state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [uploadText, setUploadText] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      await ensureAuth();
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
          setCampaignDoc(
            c.settings?.attachment_document ||
            (c.sequence_steps || []).find((s: any) => s.attachment_path)?.attachment_path ||
            '',
          );
          setSenderName(c.settings?.sender_name || 'Ryan Landry');
          setSenderRole(c.settings?.sender_role || 'CEO, LandJet');
          setSenderEmail(c.settings?.sender_email || 'rmlandry29@gmail.com');
          setEmailsPerDay(c.channel_config?.email?.daily_limit || 5);
          setFollowUpDelay(c.settings?.follow_up_delay_days || 4);
          setAiDrafts(c.settings?.ai_drafts_enabled ?? true);
          setCampaignPriority(c.settings?.priority || 50);
          setEmailSignature(c.settings?.email_signature || '');
          setMaxSteps(typeof c.settings?.max_steps === 'number' ? c.settings.max_steps : 0);
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
      const c = res.campaign;
      setCampaign(c);
      // Re-sync all local state from the saved campaign to prevent drift
      if (c.ai_system_prompt !== undefined) setPrompt(c.ai_system_prompt || '');
      if (c.sequence_steps !== undefined) setSteps(c.sequence_steps || []);
      if (c.settings) {
        setSenderName(c.settings.sender_name || senderName);
        setSenderRole(c.settings.sender_role || senderRole);
        setSenderEmail(c.settings.sender_email || senderEmail);
        setFollowUpDelay(c.settings.follow_up_delay_days || followUpDelay);
        setAiDrafts(c.settings.ai_drafts_enabled ?? aiDrafts);
        setCampaignPriority(c.settings.priority || campaignPriority);
        setEmailSignature(c.settings.email_signature || emailSignature);
        setMaxSteps(typeof c.settings.max_steps === 'number' ? c.settings.max_steps : 0);
        if ('attachment_document' in c.settings) setCampaignDoc(c.settings.attachment_document || '');
      }
      if (c.channel_config?.email?.daily_limit !== undefined) setEmailsPerDay(c.channel_config.email.daily_limit);
      setFlash(section);
      setTimeout(() => setFlash(null), 2000);
    } catch (err) {
      alert('Save failed: ' + (err as Error).message);
    }
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

  // Change which document the campaign attaches. Re-points every step that is
  // currently set to attach (so the checked boxes always reflect the chosen
  // document). Picking "None" detaches every step.
  function changeCampaignDoc(filename: string) {
    setCampaignDoc(filename);
    setSteps(prev => prev.map((s: any) => (s.attachment_path ? { ...s, attachment_path: filename || null } : s)));
  }

  // Open an attachment in a new tab. The download endpoint requires the bearer
  // token, so we fetch it as a blob and open an object URL rather than a plain
  // link (which would not carry the auth header).
  async function openAttachment(filename: string) {
    if (!filename) return;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const r = await fetch(`/api/admin/attachments/${encodeURIComponent(filename)}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) { alert('Could not open the document. It may have been moved or deleted.'); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      alert('Could not open the document.');
    }
  }

  // Load the file list for the attachment picker once per page load.
  // Reuses the existing /api/admin/attachments endpoint that powers the
  // /admin/attachments page.
  useEffect(() => {
    (async () => {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        const r = await fetch('/api/admin/attachments', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!r.ok) return;
        const data = await r.json() as { files: { filename: string }[] };
        setAttachmentFiles(data.files || []);
      } catch { /* non-fatal: dropdown just shows "No attachment" */ }
    })();
  }, []);

  const filteredContacts = contacts.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const fullName = (c.name || [c.first_name, c.last_name].filter(Boolean).join(' ') || '').toLowerCase();
      return fullName.includes(q) || (c.email || '').toLowerCase().includes(q) || (c.company || '').toLowerCase().includes(q);
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
              {campaign.approval_status === 'live' ? 'Active' : campaign.approval_status === 'draft' ? 'Draft' : campaign.approval_status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!isVirtual && campaign && campaign.name?.toLowerCase().includes('cold outreach') && (
            <button
              onClick={async () => {
                if (saving === 'apollo') return;
                const count = parseInt(window.prompt('How many leads to pull from Apollo? (max 100)', '25') || '0', 10);
                if (!count || count < 1) return;
                setSaving('apollo');
                try {
                  const res = await pullApolloLeads(id, Math.min(count, 100));
                  alert(`Apollo pull complete!\n\nCreated: ${res.created}\nDuplicates skipped: ${res.duplicates}\nApollo credits used: ${res.credits_used}\nErrors: ${res.errors}`);
                  // Refresh contacts
                  const refreshed = await getCampaignContacts(id);
                  setContacts(refreshed.contacts);
                } catch (err) {
                  alert('Apollo pull failed: ' + (err as Error).message);
                }
                setSaving(null);
              }}
              disabled={saving === 'apollo'}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              title="Pull more leads from Apollo for this campaign"
            >
              {saving === 'apollo' ? 'Pulling...' : '+ Pull from Apollo'}
            </button>
          )}
          {!isVirtual && campaign && campaign.approval_status !== 'live' && (
            <button
              onClick={async () => {
                if (saving === 'activate') return;
                setSaving('activate');
                try {
                  for (const status of ['pending_approval', 'approved', 'live']) {
                    if (campaign.approval_status === status) continue;
                    const res = await approveCampaign(id, status) as any;
                    if (res?.campaign) setCampaign(res.campaign);
                  }
                  setFlash('activate');
                  setTimeout(() => setFlash(null), 2000);
                } catch (err) {
                  alert('Activation failed: ' + (err as Error).message);
                }
                setSaving(null);
              }}
              disabled={saving === 'activate'}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving === 'activate' ? 'Activating...' : flash === 'activate' ? '✓ Activated' : 'Activate Campaign'}
            </button>
          )}
          <a href="/campaigns" className="text-sm text-gray-500 hover:text-gray-900">Back</a>
        </div>
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
        {tab === 'overview' && analytics && (() => {
          const total = analytics.total_contacts || 0;
          const active = analytics.active || 0;
          const completed = analytics.completed || 0;
          const contacted = analytics.contacted || 0;
          const neverContacted = analytics.never_contacted || 0;
          const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;
          const contactedPct = total > 0 ? Math.round((contacted / total) * 100) : 0;
          const stages = Object.entries(analytics.by_stage || {}).sort(([a], [b]) => Number(a) - Number(b));
          const verticals = Object.entries(analytics.by_vertical || {}).sort(([, a], [, b]) => (b as number) - (a as number));
          const stageLabels: Record<string, string> = {};
          (steps.length > 0 ? steps : []).forEach((s: any) => {
            const channelLabel = s.channel === 'email' ? 'Email' : s.channel === 'linkedin_connect' ? 'LinkedIn' : s.channel || 'Email';
            stageLabels[String(s.step)] = `Step ${s.step} (${channelLabel})`;
          });
          if (Object.keys(stageLabels).length === 0) {
            stageLabels['1'] = 'Initial Outreach';
            stageLabels['2'] = 'Follow-up';
            stageLabels['3'] = 'Final Touch';
          }
          stageLabels['4'] = 'Completed';

          return (
            <div className="space-y-6">
              {/* Hero Metrics */}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <div className="rounded-lg border border-gray-200 bg-white p-5">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Total Leads</p>
                  <p className="mt-2 text-3xl font-bold text-gray-900">{total.toLocaleString()}</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
                  <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider">Active</p>
                  <p className="mt-2 text-3xl font-bold text-emerald-700">{active.toLocaleString()}</p>
                  <p className="mt-1 text-xs text-emerald-500">Ready for outreach</p>
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-5">
                  <p className="text-xs font-medium text-blue-600 uppercase tracking-wider">Contacted</p>
                  <p className="mt-2 text-3xl font-bold text-blue-700">{contacted.toLocaleString()}</p>
                  <p className="mt-1 text-xs text-blue-500">{contactedPct}% of total</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-5">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Completed</p>
                  <p className="mt-2 text-3xl font-bold text-gray-600">{completed.toLocaleString()}</p>
                  <p className="mt-1 text-xs text-gray-400">{progressPct}% done</p>
                </div>
              </div>

              {/* Progress Section */}
              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-700">Campaign Progress</p>
                  <span className="text-sm font-medium text-gray-500">{progressPct}% complete</span>
                </div>
                <div className="mt-3 h-3 rounded-full bg-gray-100">
                  <div className="h-3 rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.max(progressPct, 1)}%` }} />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
                  <span>{neverContacted.toLocaleString()} never contacted</span>
                  <span>{contacted.toLocaleString()} contacted</span>
                  <span>{completed.toLocaleString()} completed</span>
                </div>
              </div>

              {/* Pipeline / Stages */}
              {stages.length > 0 && (
                <div className="rounded-lg border border-gray-200 bg-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">Pipeline Stages</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {stages.map(([stage, count]) => {
                      const stagePct = total > 0 ? Math.round(((count as number) / total) * 100) : 0;
                      const colors: Record<string, string> = {
                        '1': 'bg-blue-500', '2': 'bg-amber-500', '3': 'bg-purple-500', '4': 'bg-emerald-500'
                      };
                      return (
                        <div key={stage} className="rounded-lg bg-gray-50 p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs text-gray-400">Stage {stage}</p>
                              <p className="text-sm font-medium text-gray-700">{stageLabels[stage] || `Stage ${stage}`}</p>
                            </div>
                            <span className="text-lg font-bold text-gray-900">{(count as number).toLocaleString()}</span>
                          </div>
                          <div className="mt-2 h-1.5 rounded-full bg-gray-200">
                            <div className={`h-1.5 rounded-full ${colors[stage] || 'bg-gray-400'}`} style={{ width: `${stagePct}%` }} />
                          </div>
                          <p className="mt-1 text-xs text-gray-400">{stagePct}%</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Verticals */}
              {verticals.length > 0 && (
                <div className="rounded-lg border border-gray-200 bg-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">By Vertical</p>
                  <div className="space-y-3">
                    {verticals.map(([v, count]) => {
                      const vPct = total > 0 ? Math.round(((count as number) / total) * 100) : 0;
                      return (
                        <div key={v}>
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-gray-700">{v}</span>
                            <span className="text-gray-500">{(count as number).toLocaleString()} ({vPct}%)</span>
                          </div>
                          <div className="mt-1 h-2 rounded-full bg-gray-100">
                            <div className="h-2 rounded-full bg-blue-400" style={{ width: `${vPct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Campaign Info */}
              {!isVirtual && campaign && (
                <div className="rounded-lg border border-gray-200 bg-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Campaign Details</p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-400">Sender</p>
                      <p className="font-medium text-gray-700">{campaign.settings?.sender_name || 'Not set'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Role</p>
                      <p className="font-medium text-gray-700">{campaign.settings?.sender_role || 'Not set'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Emails/Day</p>
                      <p className="font-medium text-gray-700">{campaign.channel_config?.email?.daily_limit || 20}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">AI Drafts</p>
                      <p className="font-medium text-gray-700">{campaign.settings?.ai_drafts_enabled !== false ? 'Enabled' : 'Disabled'}</p>
                    </div>
                  </div>
                  {campaign.ai_system_prompt && (
                    <div className="mt-4">
                      <p className="text-gray-400 text-xs">AI Prompt</p>
                      <p className="mt-1 text-sm text-gray-600 bg-gray-50 rounded-md p-3">{campaign.ai_system_prompt}</p>
                      {/* Variable Usage */}
                      {campaign.settings?.variables && Object.keys(campaign.settings.variables).length > 0 && (
                        <div className="mt-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Campaign Variables</p>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(campaign.settings.variables).map(([key, val]: [string, any]) => {
                              const isUsed = (campaign.ai_system_prompt || '').includes('{{' + key + '}}');
                              return (
                                <span key={key} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${isUsed ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${isUsed ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                                  {'{{'}{key}{'}}'}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

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
                        <td className="py-2 text-gray-900">{c.name || [c.first_name, c.last_name].filter(Boolean).join(' ') || '-'}</td>
                        <td className="py-2 text-gray-500">{c.email}</td>
                        <td className="py-2 text-gray-500">{c.company || '-'}</td>
                        <td className="py-2">{c.vertical ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">{c.vertical}</span> : '-'}</td>
                        <td className="py-2 text-gray-500">{c.sequence_stage}/{steps.length || 3}</td>
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

              {/* Campaign document: pick once, then check it on any email step below */}
              <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs font-medium text-gray-700">Campaign document:</label>
                  <select
                    value={campaignDoc}
                    onChange={e => changeCampaignDoc(e.target.value)}
                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:border-gray-500 focus:outline-none">
                    <option value="">None</option>
                    {attachmentFiles.map(f => (
                      <option key={f.filename} value={f.filename}>{f.filename}</option>
                    ))}
                    {campaignDoc && !attachmentFiles.some(f => f.filename === campaignDoc) && (
                      <option value={campaignDoc}>{campaignDoc} (missing)</option>
                    )}
                  </select>
                  {campaignDoc && (
                    <button type="button" onClick={() => openAttachment(campaignDoc)}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800">View</button>
                  )}
                  <a href="/admin/attachments" target="_blank" rel="noopener noreferrer"
                    className="text-xs font-medium text-blue-600 hover:text-blue-800">Upload / update document</a>
                </div>
                <p className="mt-1.5 text-xs text-gray-500">
                  Pick the document for this campaign, then check the box on any email step below to attach it. Update the file itself on the attachments page; the link points to the latest version automatically.
                </p>
              </div>

              <div className="mt-3 space-y-4">
                {(steps.length > 0 ? steps : [
                  { step: 1, delay_days: 0, channel: 'email', prompt: '' },
                  { step: 2, delay_days: 4, channel: 'email', prompt: '' },
                  { step: 3, delay_days: 7, channel: 'email', prompt: '' },
                ]).map((s: any, i: number) => {
                  const ch = s.channel || 'email';
                  const channelColors: Record<string, { bg: string; border: string; badge: string; badgeText: string; dot: string }> = {
                    email: { bg: 'bg-gray-50', border: 'border-gray-200', badge: 'bg-gray-100', badgeText: 'text-gray-600', dot: 'bg-gray-900' },
                    linkedin_connect: { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100', badgeText: 'text-blue-700', dot: 'bg-blue-600' },
                    linkedin_message: { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100', badgeText: 'text-blue-700', dot: 'bg-blue-600' },
                    sms: { bg: 'bg-green-50', border: 'border-green-200', badge: 'bg-green-100', badgeText: 'text-green-700', dot: 'bg-green-600' },
                    voice: { bg: 'bg-purple-50', border: 'border-purple-200', badge: 'bg-purple-100', badgeText: 'text-purple-700', dot: 'bg-purple-600' },
                  };
                  const colors = channelColors[ch] || channelColors.email;
                  const channelLabels: Record<string, string> = {
                    email: 'Email', linkedin_connect: 'LinkedIn Connect', linkedin_message: 'LinkedIn Message', sms: 'SMS', voice: 'Voice Call',
                  };

                  return (
                    <div key={i} className={`rounded-md ${colors.bg} border ${colors.border} p-4`}>
                      <div className="flex items-center gap-3">
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full ${colors.dot} text-xs font-bold text-white`}>{s.step}</span>
                        <select value={ch} onChange={e => updateStep(i, 'channel', e.target.value)}
                          className={`rounded-full ${colors.badge} ${colors.badgeText} px-3 py-1 text-xs font-medium border-0 focus:outline-none`}>
                          <option value="email">Email</option>
                          <option value="linkedin_connect">LinkedIn Connect</option>
                          <option value="linkedin_message">LinkedIn Message</option>
                          <option value="sms">SMS</option>
                          <option value="voice">Voice Call</option>
                        </select>
                        <label className="flex items-center gap-1 text-sm text-gray-600">
                          Delay:
                          <input type="number" min={0} value={s.delay_days} onChange={e => updateStep(i, 'delay_days', parseInt(e.target.value) || 0)}
                            className="w-14 rounded-md border border-gray-300 px-2 py-1 text-sm text-center focus:border-gray-500 focus:outline-none bg-white" />
                          days
                        </label>
                        <div className="ml-auto flex items-center gap-1">
                          {i > 0 && (
                            <button onClick={() => {
                              const updated = [...steps];
                              [updated[i - 1], updated[i]] = [updated[i], updated[i - 1]];
                              setSteps(updated.map((s: any, idx: number) => ({ ...s, step: idx + 1 })));
                            }} className="rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-200 hover:text-gray-700" title="Move up">
                              ↑
                            </button>
                          )}
                          {i < steps.length - 1 && (
                            <button onClick={() => {
                              const updated = [...steps];
                              [updated[i], updated[i + 1]] = [updated[i + 1], updated[i]];
                              setSteps(updated.map((s: any, idx: number) => ({ ...s, step: idx + 1 })));
                            }} className="rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-200 hover:text-gray-700" title="Move down">
                              ↓
                            </button>
                          )}
                          {steps.length > 1 && (
                            <button onClick={() => {
                              const updated = steps.filter((_: any, idx: number) => idx !== i).map((s: any, idx: number) => ({ ...s, step: idx + 1 }));
                              setSteps(updated);
                            }} className="rounded px-1.5 py-0.5 text-xs text-gray-400 hover:text-red-500" title="Remove step">
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                      <textarea value={s.prompt} onChange={e => updateStep(i, 'prompt', e.target.value)} rows={2}
                        placeholder={ch.startsWith('linkedin') ? 'Message to send (will be interpolated with variables)' : 'Step-specific prompt (overrides campaign prompt for this stage)'}
                        className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-gray-500 focus:outline-none bg-white" />
                      {ch === 'email' && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <label className={`flex items-center gap-2 text-xs font-medium ${campaignDoc ? 'text-gray-700' : 'text-gray-400'}`}>
                            <input
                              type="checkbox"
                              disabled={!campaignDoc}
                              checked={!!s.attachment_path}
                              onChange={e => updateStep(i, 'attachment_path', e.target.checked ? campaignDoc : null)}
                              className="h-3.5 w-3.5 rounded border-gray-300 text-gray-900 focus:ring-gray-500 disabled:opacity-50" />
                            {campaignDoc
                              ? <span>Attach <span className="font-mono text-gray-600">{campaignDoc}</span> to this email</span>
                              : <span>Attach campaign document (pick one above first)</span>}
                          </label>
                          {s.attachment_path && (
                            <button type="button" onClick={() => openAttachment(s.attachment_path)}
                              className="text-xs font-medium text-blue-600 hover:text-blue-800">View</button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <button onClick={() => {
                const nextStep = steps.length > 0 ? Math.max(...steps.map((s: any) => s.step)) + 1 : 1;
                const newSteps = [...steps, { step: nextStep, delay_days: 4, channel: 'email', prompt: '' }];
                setSteps(newSteps);
              }} className="mt-2 w-full rounded-md border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700">
                + Add Step
              </button>
              <button onClick={() => saveField('steps', { sequence_steps: steps, ai_system_prompt: prompt.trim(), settings: { attachment_document: campaignDoc || null } })} disabled={saving === 'steps'}
                className="mt-3 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                title="Saves both the campaign prompt and all sequence steps">
                {saving === 'steps' ? 'Saving...' : 'Save All'}
              </button>
              <button onClick={async () => {
                setSaving('autogen' as any);
                try {
                  // Save BOTH prompt and steps before regenerating so the AI sees the latest manual edits
                  await updateCampaignFields(id as string, {
                    ai_system_prompt: prompt.trim(),
                    sequence_steps: steps,
                  });
                  await new Promise(r => setTimeout(r, 500));
                  const result = await rewriteCampaignPrompts(id as string);
                  if (result.campaign_prompt) setPrompt(result.campaign_prompt);
                  if (result.steps) setSteps(result.steps);
                  setCampaign((prev: any) => prev ? ({ ...prev, ai_system_prompt: result.campaign_prompt, sequence_steps: result.steps }) : prev);
                  setFlash('steps');
                  setTimeout(() => setFlash(null), 2000);
                } catch {}
                setSaving(null);
              }} disabled={!!saving}
              className="mt-3 ml-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50">
                {saving === 'autogen' ? 'Generating...' : 'Auto-Generate Prompts'}
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
              <div className="mt-4 space-y-4">
                {/* Daily Limit Slider */}
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Emails per day</span>
                    <span className="font-medium text-gray-900">{emailsPerDay}</span>
                  </div>
                  <input type="range" min={0} max={50} value={emailsPerDay} onChange={e => setEmailsPerDay(parseInt(e.target.value))}
                    className="mt-1 w-full h-2 rounded-full appearance-none bg-gray-200 accent-gray-900" />
                  <div className="flex justify-between text-xs text-gray-400 mt-1"><span>0</span><span>10</span><span>25</span><span>50</span></div>
                </div>

                {/* Priority Slider */}
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Campaign Priority</span>
                    <span className="font-medium text-gray-900">{campaignPriority} <span className="text-xs text-gray-400">{campaignPriority >= 80 ? '(High)' : campaignPriority >= 50 ? '(Medium)' : '(Low)'}</span></span>
                  </div>
                  <input type="range" min={1} max={100} value={campaignPriority} onChange={e => setCampaignPriority(parseInt(e.target.value))}
                    className="mt-1 w-full h-2 rounded-full appearance-none bg-gray-200 accent-blue-600" />
                  <div className="flex justify-between text-xs text-gray-400 mt-1"><span>Low</span><span>Medium</span><span>High</span></div>
                </div>

                {/* Follow-up Delay */}
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Follow-up delay</span>
                    <span className="font-medium text-gray-900">{followUpDelay} days</span>
                  </div>
                  <input type="range" min={1} max={14} value={followUpDelay} onChange={e => setFollowUpDelay(parseInt(e.target.value))}
                    className="mt-1 w-full h-2 rounded-full appearance-none bg-gray-200 accent-gray-900" />
                  <div className="flex justify-between text-xs text-gray-400 mt-1"><span>1 day</span><span>7 days</span><span>14 days</span></div>
                </div>

                {/* Max Steps cap */}
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Max steps</span>
                    <span className="font-medium text-gray-900">
                      {maxSteps === 0
                        ? <span className="text-gray-500">default ({GLOBAL_MAX_STEPS_DEFAULT})</span>
                        : maxSteps}
                    </span>
                  </div>
                  <input type="range" min={0} max={15} value={maxSteps} onChange={e => setMaxSteps(parseInt(e.target.value))}
                    className="mt-1 w-full h-2 rounded-full appearance-none bg-gray-200 accent-gray-900" />
                  <div className="flex justify-between text-xs text-gray-400 mt-1"><span>default</span><span>5</span><span>10</span><span>15</span></div>
                  {maxSteps > GLOBAL_MAX_STEPS_DEFAULT && (
                    <p className="mt-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      Longer than the default ({GLOBAL_MAX_STEPS_DEFAULT} steps). Make sure this is intentional -- long sequences can hurt sender reputation.
                    </p>
                  )}
                  <p className="mt-1 text-xs text-gray-400">Hard ceiling. Set to <em>default</em> to inherit the global cap. The lower of this and the defined step count wins.</p>
                </div>

                {/* AI Drafts Toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">AI Draft Generation</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setAiDrafts(!aiDrafts)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${aiDrafts ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${aiDrafts ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                    </button>
                    <span className="text-xs text-gray-400">{aiDrafts ? 'ON' : 'OFF'}</span>
                  </div>
                </div>
                {/* Email Signature */}
                <div className="border-t border-gray-100 pt-3">
                  <label className="text-xs text-gray-400">Email Signature (HTML) - Campaign Override</label>
                  <textarea value={emailSignature} onChange={e => setEmailSignature(e.target.value)}
                    rows={4} placeholder="Leave blank to use the global signature..."
                    className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1 text-sm font-mono focus:border-gray-400 focus:outline-none resize-y" />
                  <p className="mt-1 text-xs text-gray-400">Overrides the global email signature for this campaign only</p>
                </div>
              </div>
              <button onClick={() => saveField('config', {
                settings: {
                  ...(campaign?.settings || {}),
                  follow_up_delay_days: followUpDelay,
                  ai_drafts_enabled: aiDrafts,
                  priority: campaignPriority,
                  email_signature: emailSignature,
                  // 0 means "inherit global default" -- store as null so the backend uses env-level OUTREACH_MAX_STEPS.
                  max_steps: maxSteps > 0 ? maxSteps : null,
                },
                channel_config: { ...(campaign?.channel_config || {}), email: { ...(campaign?.channel_config?.email || {}), enabled: true, daily_limit: emailsPerDay } },
              })} disabled={saving === 'config'}
                className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
                {saving === 'config' ? 'Saving...' : 'Save Settings'}
              </button>
            </div>

            {/* Variables Editor */}
            <VariablesEditor campaign={campaign} campaignId={id} onSave={(vars: Record<string, string>) => saveField('variables', { settings: { ...(campaign?.settings || {}), variables: vars } })} saving={saving === 'variables'} flash={flash === 'variables'} onPromptsRewritten={(newPrompt: string, newSteps: any[]) => { setPrompt(newPrompt); setSteps(newSteps); setCampaign((prev: any) => ({ ...prev, ai_system_prompt: newPrompt, sequence_steps: newSteps })); }} />
          </div>
        )}
      </div>
    </div>
  );
}

function VariablesEditor({ campaign, campaignId, onSave, saving, flash, onPromptsRewritten }: { campaign: any; campaignId: string; onSave: (vars: Record<string, string>) => void; saving: boolean; flash: boolean; onPromptsRewritten: (prompt: string, steps: any[]) => void }) {
  const currentVars = campaign?.settings?.variables || {};
  const [vars, setVars] = useState<Record<string, string>>(currentVars);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [rewriting, setRewriting] = useState(false);
  const [rewriteFlash, setRewriteFlash] = useState(false);

  useEffect(() => {
    setVars(campaign?.settings?.variables || {});
  }, [campaign]);

  function handleUpdate(key: string, value: string) {
    setVars(prev => ({ ...prev, [key]: value }));
  }

  function handleDelete(key: string) {
    setVars(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function handleAdd() {
    if (!newKey.trim()) return;
    setVars(prev => ({ ...prev, [newKey.trim()]: newValue }));
    setNewKey('');
    setNewValue('');
  }

  const entries = Object.entries(vars);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Prompt Variables</p>
          <p className="mt-1 text-xs text-gray-400">Use <code className="bg-gray-100 px-1 rounded">{'{{variable_name}}'}</code> in prompts to insert these values</p>
        </div>
        {flash && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Saved</span>}
      </div>

      <div className="mt-4 space-y-2">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-start gap-2">
            <code className="mt-1.5 shrink-0 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 font-mono">{`{{${key}}}`}</code>
            <input
              type="text"
              value={value}
              onChange={e => handleUpdate(key, e.target.value)}
              className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-700 focus:border-gray-400 focus:outline-none"
            />
            <button onClick={() => handleDelete(key)} className="mt-0.5 text-xs text-gray-400 hover:text-red-500 px-1">x</button>
          </div>
        ))}

        {entries.length === 0 && (
          <p className="text-sm text-gray-400 italic">No variables set</p>
        )}
      </div>

      {/* Add new variable */}
      <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
        <input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="variable_name"
          className="w-40 rounded-md border border-gray-200 px-2 py-1 text-xs font-mono text-gray-600 focus:border-gray-400 focus:outline-none" />
        <input value={newValue} onChange={e => setNewValue(e.target.value)} placeholder="value"
          className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-700 focus:border-gray-400 focus:outline-none" />
        <button onClick={handleAdd} disabled={!newKey.trim()}
          className="rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 disabled:opacity-50">Add</button>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button onClick={() => onSave(vars)} disabled={saving}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Variables'}
        </button>
        <button onClick={async () => {
          setRewriting(true);
          try {
            // Save variables first, then rewrite
            onSave(vars);
            await new Promise(r => setTimeout(r, 1000));
            const result = await rewriteCampaignPrompts(campaignId);
            onPromptsRewritten(result.campaign_prompt, result.steps);
            setRewriteFlash(true);
            setTimeout(() => setRewriteFlash(false), 3000);
          } catch {}
          setRewriting(false);
        }} disabled={rewriting}
          className="rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50">
          {rewriting ? 'Rewriting prompts...' : 'Rewrite Prompts with AI'}
        </button>
        {rewriteFlash && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">Prompts updated! Check Strategy tab.</span>}
      </div>
    </div>
  );
}
