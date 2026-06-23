'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  getOutreachToday, advanceOutreachContact, skipOutreachContact, removeOutreachContact, blockOutreachContact,
  assignContactCampaign, getCampaigns,
  getOutreachSettings, updateOutreachSettings,
  getSenders, updateSenders,
  getTestSendCount, resetTestSends,
  swapLead, rewriteDraft,
  OutreachContact, OutreachSettings, SenderProfileDTO,
} from '@/lib/api';
import { ensureAuth } from '@/lib/auth';
import { ExtensionInstallButton } from '@/components/ExtensionInstallButton';
import AdminFilterBar, { AdminFilters } from '@/components/AdminFilterBar';
import { useDefaultFilters } from '@/lib/useDefaultFilters';

interface CampaignOption { id: string; name: string; }

export default function OutreachPage() {
  const [contacts, setContacts] = useState<OutreachContact[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [settings, setSettings] = useState<OutreachSettings>({ emails_per_day: 25, follow_up_delay_days: 4, ai_drafts_enabled: true, sender_name: 'Ryan Landry', sender_role: 'CEO, LandJet', sender_email: 'rlandry@landjet.com', email_signature: '', test_mode: true, test_email: 'rmlandry29@gmail.com', send_days: [1, 2, 3, 4, 5], send_start_hour: 8, send_end_hour: 17, send_timezone: 'America/Chicago' });
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Ryan WhatsApp 2026-06-01: "I was working in a contact and then the page
  // refreshed and that contact is gone." Always tell the user where the
  // contact went after an action so it never feels like it vanished.
  const [notice, setNotice] = useState<{ msg: string; until: number } | null>(null);
  function showNotice(msg: string, durationMs: number = 6000) {
    setNotice({ msg, until: Date.now() + durationMs });
    setTimeout(() => setNotice(curr => (curr && curr.until <= Date.now() ? null : curr)), durationMs + 100);
  }
  const [filter, setFilter] = useState<string>('all');
  const [showSettings, setShowSettings] = useState(false);
  const [testSendCount, setTestSendCount] = useState(0);
  const [resetting, setResetting] = useState(false);
  const [signatureView, setSignatureView] = useState<'code' | 'preview'>('code');
  // Per-sender identity (name, title, area, signature). Each outreach mailbox
  // has one owner; the title drives what shows in their signature.
  const [senders, setSenders] = useState<SenderProfileDTO[]>([]);
  const [titleOptions, setTitleOptions] = useState<string[]>([]);
  const [savingSenders, setSavingSenders] = useState(false);
  const [draftEdits, setDraftEdits] = useState<Record<string, { subject: string; body: string }>>({});
  const [rewriting, setRewriting] = useState<string | null>(null); // "leadId-tone"
  const [originalDrafts, setOriginalDrafts] = useState<Record<string, { subject: string; body: string }>>({}); // stores pre-rewrite originals
  // When the user picks a different campaign from the dropdown, we don't
  // act immediately -- we show an inline choice panel asking whether they
  // want to MOVE this person or SWAP to the next person from that campaign.
  const [pendingCampaignChoice, setPendingCampaignChoice] = useState<Record<string, { campaignId: string; campaignName: string }>>({});
  const [rewriteButtons, setRewriteButtons] = useState<{ tone: string; label: string }[]>([
    { tone: 'shorter', label: 'Shorter' },
    { tone: 'personal', label: 'More Personal' },
    { tone: 'direct', label: 'More Direct' },
  ]);

  // Admin filter state. Initial value seeds from user.default_filters.states
  // via useDefaultFilters once the profile fetch resolves (2026-06-14 refactor:
  // replaced the territory enum with an N-state array). Until then we render
  // with no filter and refetch when defaults arrive.
  const [filters, setFilters] = useState<AdminFilters>({});
  const defaultFilters = useDefaultFilters();
  useEffect(() => {
    if (defaultFilters) setFilters(defaultFilters);
  }, [defaultFilters]);

  async function fetchData(opts: { preserveInProgress?: boolean } = {}) {
    await ensureAuth();
    try {
      const [contactRes, campaignRes, settingsRes] = await Promise.allSettled([
        getOutreachToday({
          states: filters.states,
          city: filters.city,
          campaign_id: filters.campaign_id,
        }),
        getCampaigns() as Promise<{ campaigns: CampaignOption[]; total: number }>,
        getOutreachSettings(),
      ]);

      if (contactRes.status === 'fulfilled') {
        // Ryan WhatsApp 2026-06-01: "I was literally working in a contact
        // and then the page refreshed and that contact is gone."
        // Root cause was the auto-refresh wholesale-replacing setContacts
        // with the server response. If the contact Ryan was editing fell
        // out of the queue between refreshes (daily cap shifted, extension
        // advanced it, etc.), it vanished from his screen mid-edit.
        // Fix: on auto-refresh, pin any contact the user has an open
        // draft edit, a pending campaign-choice, or an in-flight action
        // for. Initial loads still replace.
        if (opts.preserveInProgress) {
          setContacts(prev => {
            const fresh = contactRes.value;
            const freshIds = new Set(fresh.map(c => c.contact_id));
            const inProgressIds = new Set<string>([
              ...Object.keys(draftEdits),
              ...Object.keys(pendingCampaignChoice),
              ...(acting ? [acting] : []),
            ]);
            const pinned = prev.filter(c => inProgressIds.has(c.contact_id) && !freshIds.has(c.contact_id));
            if (pinned.length > 0) {
              showNotice(`Queue refreshed -- kept ${pinned.length} contact${pinned.length !== 1 ? 's' : ''} you're working on at the top.`);
            }
            return [...pinned, ...fresh];
          });
        } else {
          setContacts(contactRes.value);
        }
      }
      if (campaignRes.status === 'fulfilled') setCampaigns(campaignRes.value.campaigns.filter((c: CampaignOption) => !c.name.startsWith('MB Capital')));
      if (settingsRes.status === 'fulfilled') setSettings(prev => ({ ...prev, ...settingsRes.value }));
      setError(null);
      // Fetch test send count
      try { const tc = await getTestSendCount(); setTestSendCount(tc.count); } catch {};
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSettingsChange(key: keyof OutreachSettings, value: number | boolean | string | number[]) {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    try {
      const saved = await updateOutreachSettings({ [key]: value });
      setSettings(prev => ({ ...prev, ...saved }));
    } catch {}
  }

  // Load sender profiles when the settings panel opens (once).
  useEffect(() => {
    if (!showSettings || senders.length) return;
    (async () => {
      try {
        const data = await getSenders();
        setSenders(data.profiles);
        setTitleOptions(data.title_options || []);
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSettings]);

  async function handleSaveSenders() {
    setSavingSenders(true);
    try {
      const saved = await updateSenders({ profiles: senders });
      setSenders(saved.profiles);
      showNotice('Sender profiles saved.');
    } catch {
      showNotice('Could not save sender profiles.');
    } finally {
      setSavingSenders(false);
    }
  }

  function updateSenderField(email: string, field: keyof SenderProfileDTO, value: string | string[]) {
    setSenders(prev => prev.map(p => (p.email === email ? { ...p, [field]: value } : p)));
  }

  useEffect(() => {
    const timer = setTimeout(() => fetchData(), 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch when filters change. Skip the very first render -- the useEffect
  // above already handles the initial load with whatever filters are seeded.
  const firstFilterRender = useRef(true);
  useEffect(() => {
    if (firstFilterRender.current) { firstFilterRender.current = false; return; }
    fetchData({ preserveInProgress: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.states?.join(','), filters.city, filters.campaign_id]);

  // Auto-refresh on tab focus -- catches advances made by the Chrome
  // extension (or any other out-of-band action) so leads that have been
  // Marked Done elsewhere drop off without a manual refresh. Pinning
  // in-progress contacts so they don't vanish mid-edit (Ryan 6/1 #4).
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') {
        fetchData({ preserveInProgress: true });
      }
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  async function handleAdvance(contactId: string) {
    setActing(contactId);
    try {
      const edit = draftEdits[contactId];
      // Pass edited subject/body if user modified the draft
      const body = edit ? { subject: edit.subject, body: edit.body } : undefined;
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      // Ryan WhatsApp 2026-06-01: "have to mark done twice" -- root cause was
      // not checking response.ok and optimistically removing the contact even
      // when the server returned a 4xx. We now confirm advance succeeded
      // before removing locally; on failure, surface the error and leave the
      // contact visible so a single retry click actually completes the work.
      const resp = await fetch(`/api/admin/outreach/${contactId}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body || {}),
      });
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        throw new Error(errBody.error || `Mark Done failed (HTTP ${resp.status}). Please try again.`);
      }
      const advanceData = await resp.json().catch(() => null) as any;
      const contact = contacts.find(c => c.contact_id === contactId);
      const name = contact ? `${contact.name || 'Contact'}` : 'Contact';
      if (advanceData?.status === 'COMPLETED') {
        showNotice(`${name}: sequence complete -- no more follow-ups scheduled.`);
      } else if (advanceData?.next_action_at) {
        const when = new Date(advanceData.next_action_at);
        const dateStr = when.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        showNotice(`${name}: advanced to step ${advanceData.sequence_stage}. Next follow-up ${dateStr}.`);
      } else {
        showNotice(`${name}: marked done.`);
      }
      setContacts(prev => prev.filter(c => c.contact_id !== contactId));
      setDraftEdits(prev => { const n = { ...prev }; delete n[contactId]; return n; });
    } catch (e) { setError((e as Error).message); }
    finally { setActing(null); }
  }

  async function handleSkip(contactId: string) {
    const contact = contacts.find(c => c.contact_id === contactId);
    const name = contact?.name || 'Contact';
    setActing(contactId);
    try {
      await skipOutreachContact(contactId);
      setContacts(prev => prev.filter(c => c.contact_id !== contactId));
      showNotice(`${name}: skipped. Will reappear in tomorrow's queue.`);
    } catch (e) { setError((e as Error).message); }
    finally { setActing(null); }
  }

  async function handleRemove(contactId: string, contactName: string) {
    if (!window.confirm(`Remove ${contactName} from this campaign? They'll stop showing up in this queue. (You can re-assign them to another campaign later.)`)) return;
    setActing(contactId);
    try {
      await removeOutreachContact(contactId);
      setContacts(prev => prev.filter(c => c.contact_id !== contactId));
      showNotice(`${contactName}: removed from this campaign. Re-assignable from the contact's profile.`);
    } catch (e) { setError((e as Error).message); }
    finally { setActing(null); }
  }

  async function handleBlock(contactId: string, contactName: string) {
    if (!window.confirm(`Block ${contactName} from ALL outreach? This adds them to the do-not-contact list permanently. Use only for spam, wrong people, or unsubscribe requests.`)) return;
    setActing(contactId);
    try {
      await blockOutreachContact(contactId, 'manual_block_from_outreach');
      setContacts(prev => prev.filter(c => c.contact_id !== contactId));
      showNotice(`${contactName}: blocked from all outreach (do-not-contact list).`);
    } catch (e) { setError((e as Error).message); }
    finally { setActing(null); }
  }

  // Dropdown picks a campaign -> open the choice panel. We don't act until
  // the user explicitly picks Move vs Swap. Allows both behaviors instead of
  // forcing one over the other.
  function handleCampaignChange(contactId: string, campaignId: string) {
    if (!campaignId) return;
    const campaign = campaigns.find(c => c.id === campaignId);
    if (!campaign) return;
    setPendingCampaignChoice(prev => ({ ...prev, [contactId]: { campaignId, campaignName: campaign.name } }));
  }

  function cancelCampaignChoice(contactId: string) {
    setPendingCampaignChoice(prev => { const n = { ...prev }; delete n[contactId]; return n; });
  }

  // Move THIS person to the chosen campaign and regenerate the draft for the
  // new campaign's voice.
  async function handleMoveToCampaign(contactId: string, campaignId: string) {
    setActing(contactId);
    try {
      const updatedContact = await assignContactCampaign(String(contactId), campaignId) as OutreachContact;
      setContacts(prev => prev.map(c => c.contact_id === contactId ? updatedContact : c));
      setDraftEdits(prev => { const n = { ...prev }; delete n[contactId]; return n; });
      setPendingCampaignChoice(prev => { const n = { ...prev }; delete n[contactId]; return n; });
      const u = updatedContact as any;
      const name = `${u.name || (u.first_name ? `${u.first_name} ${u.last_name || ''}`.trim() : 'Contact')}`;
      const campaignName = campaigns.find(c => c.id === campaignId)?.name || 'new campaign';
      // Ryan WhatsApp 2026-06-01: confirm whether stage was preserved or reset
      // so re-categorization doesn't feel like "the contact disappeared and
      // started over." Backend sets stage_preserved=true when we kept their
      // prior progress (per default preserve_stage=true behavior).
      if (u.stage_preserved && u.previous_stage && u.previous_stage > 1) {
        showNotice(`Moved to ${campaignName}. Kept at stage ${u.sequence_stage} (preserved from ${u.previous_stage}).`);
      } else if (u.previous_stage && u.previous_stage > 1) {
        showNotice(`Moved to ${campaignName}. Restarted at stage 1 (previously ${u.previous_stage}).`);
      } else {
        showNotice(`Moved ${name} to ${campaignName}.`);
      }
    } catch (e) {
      setError((e as Error).message);
    }
    finally { setActing(null); }
  }

  // Swap to a different person from the chosen campaign. Leaves the current
  // person untouched in their original campaign.
  async function handleSwapToNextInCampaign(contactId: string, campaignId: string) {
    setActing(contactId);
    try {
      const newContact = await swapLead(String(contactId), campaignId);
      setContacts(prev => prev.map(c => c.contact_id === contactId ? newContact : c));
      setDraftEdits(prev => { const n = { ...prev }; delete n[contactId]; return n; });
      setPendingCampaignChoice(prev => { const n = { ...prev }; delete n[contactId]; return n; });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('No more leads')) {
        setError('No more leads available in this campaign');
        setTimeout(() => setError(null), 3000);
      } else {
        setError(msg);
      }
    }
    finally { setActing(null); }
  }

  function getDraft(contact: OutreachContact) {
    const edit = draftEdits[contact.contact_id];
    return {
      subject: edit?.subject ?? contact.draft.subject,
      body: edit?.body ?? contact.draft.body,
    };
  }

  function updateDraft(contactId: string, field: 'subject' | 'body', value: string) {
    setDraftEdits(prev => {
      const current = prev[contactId] || { subject: '', body: '' };
      // Initialize from contact if first edit
      const contact = contacts.find(c => c.contact_id === contactId);
      if (!prev[contactId] && contact) {
        current.subject = contact.draft.subject;
        current.body = contact.draft.body;
      }
      return { ...prev, [contactId]: { ...current, [field]: value } };
    });
  }

  async function handleRewrite(contactId: string, tone: 'shorter' | 'personal' | 'direct') {
    const key = `${contactId}-${tone}`;
    setRewriting(key);
    try {
      const contact = contacts.find(c => c.contact_id === contactId)!;
      const draft = getDraft(contact);
      // Save the original AI-generated draft before the first rewrite
      if (!originalDrafts[contactId]) {
        setOriginalDrafts(prev => ({ ...prev, [contactId]: { subject: contact.draft.subject, body: contact.draft.body } }));
      }
      const channel = (contact as any).channel || 'email';
      const result = await rewriteDraft(String(contactId), tone, draft.subject, draft.body, channel);
      setDraftEdits(prev => ({ ...prev, [contactId]: { subject: result.subject, body: result.body } }));
    } catch (e) { setError((e as Error).message); }
    finally { setRewriting(null); }
  }

  function handleResetToOriginal(contactId: string) {
    const original = originalDrafts[contactId];
    if (original) {
      setDraftEdits(prev => { const n = { ...prev }; delete n[contactId]; return n; });
      setOriginalDrafts(prev => { const n = { ...prev }; delete n[contactId]; return n; });
    }
  }

  const filteredContacts = useMemo(() =>
    filter === 'all'
      ? contacts
      : filter === 'unassigned'
        ? contacts.filter(c => !c.vertical)
        : contacts.filter(c => c.vertical === filter),
    [contacts, filter]
  );

  const verticals = useMemo(() =>
    [...new Set(contacts.map(c => c.vertical).filter(Boolean))] as string[],
    [contacts]
  );

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
      {/* Test Mode Banner */}
      {settings.test_mode && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5">
          <span className="text-amber-600 text-lg">&#9888;</span>
          <span className="text-sm font-medium text-amber-800">Test Mode Active</span>
          <span className="text-sm text-amber-700">-- all emails will be sent to <strong>{settings.test_email}</strong> instead of real leads</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Outreach</h1>
          <p className="mt-1 text-sm text-gray-500">
            {filteredContacts.length} contact{filteredContacts.length !== 1 ? 's' : ''} ready today
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExtensionInstallButton />
          <button onClick={() => setShowSettings(!showSettings)}
            className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50">
            Settings
          </button>
          <button onClick={() => { setLoading(true); fetchData(); }}
            className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50">
            Refresh
          </button>
        </div>
      </div>

      {/* Admin filter bar -- Territory + State + City + Campaign. Channel
         is hidden because each step has its own channel; filtering on it
         for the today queue does not have a clean meaning. */}
      <div className="mt-3">
        <AdminFilterBar value={filters} onChange={setFilters} hiddenChips={['channel']} />
      </div>

      {/* Global Settings Panel */}
      {showSettings && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Global Controls</p>
          <div className="mt-4 space-y-4">
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Max emails per day (global cap)</span>
                <span className="font-medium text-gray-900">{settings.emails_per_day}</span>
              </div>
              <input type="range" min={5} max={100} value={settings.emails_per_day}
                onChange={e => handleSettingsChange('emails_per_day', parseInt(e.target.value))}
                className="mt-1 w-full h-2 rounded-full appearance-none bg-gray-200 accent-gray-900" />
              <div className="flex justify-between text-xs text-gray-400 mt-1"><span>5</span><span>25</span><span>50</span><span>100</span></div>
            </div>
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Default follow-up delay</span>
                <span className="font-medium text-gray-900">{settings.follow_up_delay_days} days</span>
              </div>
              <input type="range" min={1} max={14} value={settings.follow_up_delay_days}
                onChange={e => handleSettingsChange('follow_up_delay_days', parseInt(e.target.value))}
                className="mt-1 w-full h-2 rounded-full appearance-none bg-gray-200 accent-gray-900" />
              <div className="flex justify-between text-xs text-gray-400 mt-1"><span>1 day</span><span>7 days</span><span>14 days</span></div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">AI Draft Generation (global)</span>
              <div className="flex items-center gap-2">
                <button onClick={() => handleSettingsChange('ai_drafts_enabled', !settings.ai_drafts_enabled)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.ai_drafts_enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${settings.ai_drafts_enabled ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                </button>
                <span className="text-xs text-gray-400">{settings.ai_drafts_enabled ? 'ON' : 'OFF'}</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 border-t border-gray-100 pt-3">
              <div>
                <label className="text-xs text-gray-400">Sender Name</label>
                <input type="text" value={settings.sender_name} onChange={e => handleSettingsChange('sender_name', e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1 text-sm focus:border-gray-400 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-400">Sender Role</label>
                <input type="text" value={settings.sender_role} onChange={e => handleSettingsChange('sender_role', e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1 text-sm focus:border-gray-400 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-400">Sender Email</label>
                <input type="text" value={settings.sender_email} onChange={e => handleSettingsChange('sender_email', e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1 text-sm focus:border-gray-400 focus:outline-none" />
              </div>
            </div>
            <div className="border-t border-gray-100 pt-3">
              <div className="flex items-center justify-between">
                <label className="text-xs text-gray-400">Email Signature</label>
                <div className="flex rounded-md border border-gray-200 overflow-hidden">
                  <button type="button" onClick={() => setSignatureView('code')}
                    className={`px-2 py-0.5 text-xs ${signatureView === 'code' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    HTML
                  </button>
                  <button type="button" onClick={() => setSignatureView('preview')}
                    className={`px-2 py-0.5 text-xs border-l border-gray-200 ${signatureView === 'preview' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    Preview
                  </button>
                </div>
              </div>
              {signatureView === 'code' ? (
                <textarea value={settings.email_signature} onChange={e => handleSettingsChange('email_signature', e.target.value)}
                  rows={4} placeholder="Add your HTML email signature..."
                  className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1 text-sm font-mono focus:border-gray-400 focus:outline-none resize-y" />
              ) : (
                <div className="mt-1 min-h-[100px] rounded-md border border-gray-200 bg-white p-3 text-sm">
                  {settings.email_signature ? (
                    <div dangerouslySetInnerHTML={{ __html: settings.email_signature }} />
                  ) : (
                    <p className="text-gray-400 italic">No signature set. Switch to HTML to add one.</p>
                  )}
                </div>
              )}
            </div>
            {/* Sender Profiles -- per-person identity (name, title, area, signature) */}
            <div className="border-t border-gray-100 pt-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-gray-700">Sender Profiles</p>
                <button type="button" onClick={handleSaveSenders} disabled={savingSenders}
                  className="rounded-md bg-gray-900 px-3 py-1 text-xs text-white hover:bg-gray-800 disabled:opacity-50">
                  {savingSenders ? 'Saving...' : 'Save profiles'}
                </button>
              </div>
              <p className="text-xs text-gray-400 mb-3">Each mailbox sends as its owner with their own title and signature. Title drives what shows in the signature.</p>
              <div className="space-y-3">
                {senders.length === 0 && <p className="text-xs text-gray-400 italic">Loading profiles...</p>}
                {senders.map(p => (
                  <div key={p.email} className="rounded-md border border-gray-200 p-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs text-gray-400">Name</label>
                        <input type="text" value={p.name} onChange={e => updateSenderField(p.email, 'name', e.target.value)}
                          className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1 text-sm focus:border-gray-400 focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400">Title</label>
                        <select value={titleOptions.includes(p.title) ? p.title : '__custom'}
                          onChange={e => { if (e.target.value !== '__custom') updateSenderField(p.email, 'title', e.target.value); }}
                          className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1 text-sm focus:border-gray-400 focus:outline-none">
                          {titleOptions.map(t => <option key={t} value={t}>{t}</option>)}
                          <option value="__custom">Custom...</option>
                        </select>
                        {!titleOptions.includes(p.title) && (
                          <input type="text" value={p.title} placeholder="Custom title"
                            onChange={e => updateSenderField(p.email, 'title', e.target.value)}
                            className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1 text-sm focus:border-gray-400 focus:outline-none" />
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-gray-400">Area (states)</label>
                        <input type="text" value={(p.area || []).join(', ')}
                          onChange={e => updateSenderField(p.email, 'area', e.target.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean))}
                          placeholder="e.g. TX (blank = all)"
                          className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1 text-sm focus:border-gray-400 focus:outline-none" />
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-gray-400">{p.email}</span>
                    </div>
                    {p.signature_preview && (
                      <div className="mt-2 rounded-md border border-gray-100 bg-gray-50 p-2 text-sm" dangerouslySetInnerHTML={{ __html: p.signature_preview }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
            {/* Send Schedule */}
            <div className="border-t border-gray-100 pt-3">
              <p className="text-sm font-medium text-gray-700 mb-3">Send Schedule</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-400">Send Days</label>
                  <div className="mt-1 flex items-center gap-1">
                    {[
                      { day: 1, label: 'Mon' }, { day: 2, label: 'Tue' }, { day: 3, label: 'Wed' },
                      { day: 4, label: 'Thu' }, { day: 5, label: 'Fri' }, { day: 6, label: 'Sat' }, { day: 0, label: 'Sun' },
                    ].map(({ day, label }) => {
                      const active = (settings.send_days || []).includes(day);
                      return (
                        <button key={day} onClick={() => {
                          const current = settings.send_days || [];
                          const updated = active ? current.filter(d => d !== day) : [...current, day];
                          handleSettingsChange('send_days' as keyof OutreachSettings, updated as any);
                        }}
                          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-gray-400">Start Time</label>
                    <select value={settings.send_start_hour} onChange={e => handleSettingsChange('send_start_hour', parseInt(e.target.value))}
                      className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1 text-sm focus:border-gray-400 focus:outline-none">
                      {Array.from({ length: 16 }, (_, i) => i + 6).map(h => (
                        <option key={h} value={h}>{h === 12 ? '12:00 PM' : h > 12 ? `${h - 12}:00 PM` : `${h}:00 AM`}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">End Time</label>
                    <select value={settings.send_end_hour} onChange={e => handleSettingsChange('send_end_hour', parseInt(e.target.value))}
                      className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1 text-sm focus:border-gray-400 focus:outline-none">
                      {Array.from({ length: 16 }, (_, i) => i + 6).map(h => (
                        <option key={h} value={h}>{h === 12 ? '12:00 PM' : h > 12 ? `${h - 12}:00 PM` : `${h}:00 AM`}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Timezone</label>
                    <select value={settings.send_timezone} onChange={e => handleSettingsChange('send_timezone', e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1 text-sm focus:border-gray-400 focus:outline-none">
                      <option value="America/New_York">Eastern (ET)</option>
                      <option value="America/Chicago">Central (CT)</option>
                      <option value="America/Denver">Mountain (MT)</option>
                      <option value="America/Los_Angeles">Pacific (PT)</option>
                      <option value="America/Anchorage">Alaska (AKT)</option>
                      <option value="Pacific/Honolulu">Hawaii (HT)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
            {/* Rewrite Button Labels */}
            <div className="border-t border-gray-100 pt-3">
              <p className="text-sm font-medium text-gray-700 mb-2">Rewrite Buttons</p>
              <p className="text-xs text-gray-400 mb-2">Customize the labels shown on rewrite buttons for emails and LinkedIn messages</p>
              <div className="space-y-2">
                {rewriteButtons.map((btn, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={btn.label} onChange={e => {
                      const updated = [...rewriteButtons];
                      updated[i] = { ...updated[i], label: e.target.value };
                      setRewriteButtons(updated);
                    }} className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-sm focus:border-gray-400 focus:outline-none" />
                    <span className="text-[10px] text-gray-400 w-16">{btn.tone}</span>
                    {rewriteButtons.length > 1 && (
                      <button onClick={() => setRewriteButtons(prev => prev.filter((_, idx) => idx !== i))}
                        className="text-xs text-gray-400 hover:text-red-500">Remove</button>
                    )}
                  </div>
                ))}
                <button onClick={() => {
                  const tones = ['casual', 'formal', 'urgent', 'friendly', 'concise', 'detailed', 'empathetic'];
                  const used = new Set(rewriteButtons.map(b => b.tone));
                  const next = tones.find(t => !used.has(t)) || `custom_${rewriteButtons.length + 1}`;
                  setRewriteButtons(prev => [...prev, { tone: next, label: next.charAt(0).toUpperCase() + next.slice(1).replace('_', ' ') }]);
                }} className="text-xs text-blue-600 hover:text-blue-800">+ Add rewrite style</button>
              </div>
            </div>

            {/* Test Mode */}
            <div className={`border-t pt-3 ${settings.test_mode ? 'border-amber-200' : 'border-gray-100'}`}>
              <div className={`rounded-lg p-3 ${settings.test_mode ? 'bg-amber-50 border border-amber-200' : ''}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-900">Test Mode</span>
                    <p className="text-xs text-gray-500 mt-0.5">All emails redirect to the test address below instead of the real lead</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleSettingsChange('test_mode', !settings.test_mode)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.test_mode ? 'bg-amber-500' : 'bg-gray-300'}`}>
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${settings.test_mode ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                    </button>
                    <span className={`text-xs font-medium ${settings.test_mode ? 'text-amber-600' : 'text-gray-400'}`}>{settings.test_mode ? 'ON' : 'OFF'}</span>
                  </div>
                </div>
                {settings.test_mode && (
                  <div className="mt-2 space-y-2">
                    <div>
                      <label className="text-xs text-amber-700">Test Email (all outreach goes here)</label>
                      <input type="email" value={settings.test_email} onChange={e => handleSettingsChange('test_email', e.target.value)}
                        className="mt-1 w-full rounded-md border border-amber-300 bg-white px-2 py-1 text-sm focus:border-amber-500 focus:outline-none" />
                    </div>
                    {testSendCount > 0 && (
                      <div className="flex items-center justify-between rounded-md bg-amber-100 px-3 py-2">
                        <span className="text-xs text-amber-800">
                          <strong>{testSendCount}</strong> lead{testSendCount !== 1 ? 's' : ''} advanced during testing
                        </span>
                        <button
                          onClick={async () => {
                            setResetting(true);
                            try {
                              const result = await resetTestSends();
                              setTestSendCount(0);
                              await fetchData();
                              alert(`Reset ${result.reset} leads back to their original state.`);
                            } catch {}
                            setResetting(false);
                          }}
                          disabled={resetting}
                          className="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                        >
                          {resetting ? 'Resetting...' : 'Undo Test Sends'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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

      {notice && (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-md bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
          <div className="flex-1">{notice.msg}</div>
          <button onClick={() => setNotice(null)} className="text-emerald-600 hover:text-emerald-800 text-xs font-medium">Dismiss</button>
        </div>
      )}

      {filteredContacts.length === 0 && !error && (
        <div className="mt-8 text-center">
          <p className="text-lg font-semibold text-gray-700">All caught up!</p>
          <p className="mt-1 text-sm text-gray-400">No more contacts in the queue right now.</p>
          <button onClick={() => { setLoading(true); fetchData(); }}
            className="mt-4 rounded-md bg-gray-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-gray-800">
            Load More
          </button>
          <p className="mt-2 text-xs text-gray-400">Pulls the next batch from each campaign based on daily limits</p>
        </div>
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
                  {contact.state ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">📍 {contact.city ? `${contact.city}, ` : ''}{contact.state}</span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-400" title="No location resolved yet">📍 No location</span>
                  )}
                  {contact.vertical && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">{contact.vertical}</span>
                  )}
                  {contact.tier && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">Tier {contact.tier}</span>
                  )}
                  <span className="text-xs text-gray-400">Priority: {contact.priority_score}</span>
                  {(() => {
                    const ch = (contact as any).channel || 'email';
                    const tags: Record<string, { bg: string; text: string; label: string }> = {
                      email: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Email' },
                      linkedin_connect: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'LinkedIn Connect' },
                      linkedin_message: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'LinkedIn Message' },
                      sms: { bg: 'bg-green-100', text: 'text-green-700', label: 'SMS' },
                      voice: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Voice' },
                    };
                    const t = tags[ch] || tags.email;
                    return <span className={`rounded-full ${t.bg} px-2 py-0.5 text-xs font-medium ${t.text}`}>{t.label}</span>;
                  })()}
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
                  title="Skip for 24 hours -- they'll show up again tomorrow"
                  className="rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                  Skip
                </button>
                <button onClick={() => handleRemove(contact.contact_id, contact.name)} disabled={acting === contact.contact_id}
                  title="Remove from this campaign permanently (lead stays in DB, can be re-assigned)"
                  className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50">
                  Remove
                </button>
                <button onClick={() => handleBlock(contact.contact_id, contact.name)} disabled={acting === contact.contact_id}
                  title="Block from ALL outreach -- archives the lead and adds to DNC list"
                  className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50">
                  Block
                </button>
                {(() => {
                  const isLinkedIn = (contact as any).channel?.startsWith('linkedin');
                  const aiErr = (contact as any).ai_error as string | null | undefined;
                  const draftBody = draftEdits[contact.contact_id]?.body ?? (contact as any).linkedin_message ?? contact.draft.body;
                  const blocked = isLinkedIn && !!aiErr && !draftBody.trim();
                  return (
                    <button onClick={() => handleAdvance(contact.contact_id)} disabled={acting === contact.contact_id || blocked}
                      title={blocked ? 'AI is unavailable -- cannot send an empty message. Reload or type a message manually.' : undefined}
                      className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed">
                      {acting === contact.contact_id ? '...' : isLinkedIn ? 'Mark Done' : 'Approve & Send'}
                    </button>
                  );
                })()}
              </div>
            </div>

            {/* Campaign change choice panel -- shown when user picks a different
                campaign from the dropdown. Lets them choose between moving
                THIS person or swapping to the next person in that campaign. */}
            {pendingCampaignChoice[contact.contact_id] && (() => {
              const choice = pendingCampaignChoice[contact.contact_id];
              const isSameCampaign = choice.campaignId === contact.campaign_id;
              return (
                <div className="mt-3 rounded-md border-2 border-indigo-300 bg-indigo-50 p-4">
                  <p className="text-sm font-semibold text-indigo-900 mb-2">
                    You picked <span className="font-bold">{choice.campaignName}</span>. What do you want to do?
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button
                      onClick={() => handleMoveToCampaign(contact.contact_id, choice.campaignId)}
                      disabled={acting === contact.contact_id || isSameCampaign}
                      title={isSameCampaign ? 'Already in this campaign' : `Move ${contact.name} to ${choice.campaignName} and rewrite the message in that campaign's voice`}
                      className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">
                      Move {contact.name} to this campaign
                    </button>
                    <button
                      onClick={() => handleSwapToNextInCampaign(contact.contact_id, choice.campaignId)}
                      disabled={acting === contact.contact_id}
                      title={`Skip ${contact.name} and show the next person waiting in ${choice.campaignName}. ${contact.name} stays in their current campaign.`}
                      className="rounded-md border border-indigo-300 bg-white px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50">
                      Show me the next person in {choice.campaignName}
                    </button>
                    <button
                      onClick={() => cancelCampaignChoice(contact.contact_id)}
                      disabled={acting === contact.contact_id}
                      className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                      Cancel
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-indigo-700">
                    <strong>Move</strong> = re-bucket this person. <strong>Show next</strong> = leave this person where they are and jump to a different lead from that campaign.
                  </p>
                </div>
              );
            })()}

            {/* LinkedIn Step */}
            {(contact as any).channel?.startsWith('linkedin') ? (
              <div className="mt-3 rounded-md bg-blue-50 border border-blue-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">in</span>
                    <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                      {(contact as any).channel === 'linkedin_connect' ? 'LinkedIn Connection Request' : 'LinkedIn Message'}
                    </p>
                  </div>
                  {(contact as any).linkedin_url && (
                    <a href={(contact as any).linkedin_url} target="_blank" rel="noopener noreferrer"
                      className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
                      Open LinkedIn Profile
                    </a>
                  )}
                </div>

                {(contact as any).ai_error && (
                  <div className="mt-3 rounded-md border-2 border-red-300 bg-red-50 p-3">
                    <div className="flex items-start gap-2">
                      <span className="text-red-600 font-bold text-base leading-none mt-0.5">&#9888;</span>
                      <div className="flex-1">
                        <p className="text-xs font-bold uppercase tracking-wider text-red-700">AI Message Generation Failed</p>
                        <p className="mt-1 text-sm text-red-900">{(contact as any).ai_error}</p>
                        <p className="mt-1 text-xs text-red-700">The message field is empty on purpose. Refresh to retry, or type a message manually below before sending.</p>
                      </div>
                    </div>
                  </div>
                )}

                {(contact as any).channel === 'linkedin_connect' && (
                  <div className="mt-3">
                    <p className="text-xs text-blue-500 font-medium">Steps:</p>
                    <ol className="mt-1 text-xs text-blue-700 space-y-1 list-decimal list-inside">
                      <li>Click "Open LinkedIn Profile" above</li>
                      <li>Click "Connect" on their profile</li>
                      <li>Select "Add a note"</li>
                      <li>Paste the message below</li>
                      <li>Click "Send"</li>
                      <li>Come back here and click "Mark Done"</li>
                    </ol>
                  </div>
                )}

                {(contact as any).channel === 'linkedin_message' && (
                  <div className="mt-3">
                    <p className="text-xs text-blue-500 font-medium">Steps:</p>
                    <ol className="mt-1 text-xs text-blue-700 space-y-1 list-decimal list-inside">
                      <li>Click "Open LinkedIn Profile" above</li>
                      <li>Click "Message" (only works if connected)</li>
                      <li>Paste the message below</li>
                      <li>Click "Send"</li>
                      <li>Come back here and click "Mark Done"</li>
                    </ol>
                    <p className="mt-2 text-xs text-blue-400 italic">If not yet connected, click Skip to try again later.</p>
                  </div>
                )}

                {!(contact as any).linkedin_url && (
                  <p className="mt-2 text-xs text-amber-600">No LinkedIn URL found for this contact. Search for "{contact.name}" at {(contact as any).company || 'their company'} on LinkedIn.</p>
                )}

                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-blue-500 font-medium">Message to send:</p>
                    <div className="flex items-center gap-2">
                      {rewriteButtons.map(btn => {
                        const isRewriting = rewriting === `${contact.contact_id}-${btn.tone}`;
                        return (
                          <button key={btn.tone} onClick={() => handleRewrite(contact.contact_id, btn.tone as any)}
                            disabled={!!rewriting}
                            className="rounded-md border border-blue-200 bg-white px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50">
                            {isRewriting ? '...' : btn.label}
                          </button>
                        );
                      })}
                      {originalDrafts[contact.contact_id] && (
                        <button onClick={() => handleResetToOriginal(contact.contact_id)}
                          disabled={!!rewriting}
                          className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50">
                          Reset to Original
                        </button>
                      )}
                    </div>
                  </div>
                  <textarea
                    className="w-full whitespace-pre-wrap text-sm text-gray-700 bg-white rounded-md p-3 border border-blue-100 font-sans resize-y min-h-[80px]"
                    rows={4}
                    value={draftEdits[contact.contact_id]?.body ?? (contact as any).linkedin_message ?? contact.draft.body}
                    onChange={e => setDraftEdits(prev => ({ ...prev, [contact.contact_id]: { subject: prev[contact.contact_id]?.subject || contact.draft.subject, body: e.target.value } }))}
                  />
                  <button
                    onClick={() => { navigator.clipboard.writeText(draftEdits[contact.contact_id]?.body ?? (contact as any).linkedin_message ?? contact.draft.body); }}
                    className="mt-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100">
                    Copy to Clipboard
                  </button>
                </div>
              </div>
            ) : (
              /* Email Step - Editable */
              <div className="mt-3 rounded-md bg-gray-50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Draft Email</p>
                  <div className="flex items-center gap-2">
                    {rewriteButtons.map(btn => {
                      const isRewriting = rewriting === `${contact.contact_id}-${btn.tone}`;
                      return (
                        <button key={btn.tone} onClick={() => handleRewrite(contact.contact_id, btn.tone as any)}
                          disabled={!!rewriting}
                          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50">
                          {isRewriting ? '...' : btn.label}
                        </button>
                      );
                    })}
                    {originalDrafts[contact.contact_id] && (
                      <button onClick={() => handleResetToOriginal(contact.contact_id)}
                        disabled={!!rewriting}
                        className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50">
                        Reset to Original
                      </button>
                    )}
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-400">
                      {draftEdits[contact.contact_id] ? 'edited' : contact.draft.source}
                    </span>
                  </div>
                </div>
                <div className="mt-2">
                  <label className="text-xs text-gray-400">Subject</label>
                  <input
                    type="text"
                    value={getDraft(contact).subject}
                    onChange={e => updateDraft(contact.contact_id, 'subject', e.target.value)}
                    className="mt-0.5 w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 focus:border-gray-400 focus:outline-none"
                  />
                </div>
                <div className="mt-2">
                  <label className="text-xs text-gray-400">Body</label>
                  <textarea
                    value={getDraft(contact).body}
                    onChange={e => updateDraft(contact.contact_id, 'body', e.target.value)}
                    rows={6}
                    className="mt-0.5 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 font-sans focus:border-gray-400 focus:outline-none resize-y"
                  />
                </div>
              </div>
            )}

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
