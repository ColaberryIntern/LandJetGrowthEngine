'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  getOutreachToday, advanceOutreachContact, skipOutreachContact,
  assignContactCampaign, getCampaigns,
  getOutreachSettings, updateOutreachSettings,
  getTestSendCount, resetTestSends,
  swapLead, rewriteDraft,
  OutreachContact, OutreachSettings,
} from '@/lib/api';

interface CampaignOption { id: string; name: string; }

export default function OutreachPage() {
  const [contacts, setContacts] = useState<OutreachContact[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [settings, setSettings] = useState<OutreachSettings>({ emails_per_day: 25, follow_up_delay_days: 4, ai_drafts_enabled: true, sender_name: 'Ryan Landry', sender_role: 'CEO, LandJet', sender_email: 'rlandry@landjet.com', test_mode: true, test_email: 'rmlandry29@gmail.com' });
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [showSettings, setShowSettings] = useState(false);
  const [testSendCount, setTestSendCount] = useState(0);
  const [resetting, setResetting] = useState(false);
  const [draftEdits, setDraftEdits] = useState<Record<string, { subject: string; body: string }>>({});
  const [rewriting, setRewriting] = useState<string | null>(null); // "leadId-tone"

  async function fetchData() {
    try {
      const [contactRes, campaignRes, settingsRes] = await Promise.allSettled([
        getOutreachToday(),
        getCampaigns() as Promise<{ campaigns: CampaignOption[]; total: number }>,
        getOutreachSettings(),
      ]);

      if (contactRes.status === 'fulfilled') setContacts(contactRes.value);
      if (campaignRes.status === 'fulfilled') setCampaigns(campaignRes.value.campaigns);
      if (settingsRes.status === 'fulfilled') setSettings(settingsRes.value);
      setError(null);
      // Fetch test send count
      try { const tc = await getTestSendCount(); setTestSendCount(tc.count); } catch {};
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSettingsChange(key: keyof OutreachSettings, value: number | boolean | string) {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    try { await updateOutreachSettings({ [key]: value }); } catch {}
  }

  useEffect(() => {
    const timer = setTimeout(() => fetchData(), 500);
    return () => clearTimeout(timer);
  }, []);

  async function handleAdvance(contactId: string) {
    setActing(contactId);
    try {
      const edit = draftEdits[contactId];
      // Pass edited subject/body if user modified the draft
      const body = edit ? { subject: edit.subject, body: edit.body } : undefined;
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      await fetch(`/api/admin/outreach/${contactId}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body || {}),
      });
      setContacts(prev => prev.filter(c => c.contact_id !== contactId));
      setDraftEdits(prev => { const n = { ...prev }; delete n[contactId]; return n; });
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
    if (!campaignId) return;
    setActing(contactId);
    try {
      const newContact = await swapLead(String(contactId), campaignId);
      // Replace the current contact with the new one from the selected campaign
      setContacts(prev => prev.map(c =>
        c.contact_id === contactId ? newContact : c
      ));
      // Clear any draft edits for the old contact
      setDraftEdits(prev => { const n = { ...prev }; delete n[contactId]; return n; });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('No more leads')) {
        setError(`No more leads available in this campaign`);
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
      const draft = getDraft(contacts.find(c => c.contact_id === contactId)!);
      const result = await rewriteDraft(String(contactId), tone, draft.subject, draft.body);
      setDraftEdits(prev => ({ ...prev, [contactId]: { subject: result.subject, body: result.body } }));
    } catch (e) { setError((e as Error).message); }
    finally { setRewriting(null); }
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
                  className="rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                  Skip
                </button>
                <button onClick={() => handleAdvance(contact.contact_id)} disabled={acting === contact.contact_id}
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
                  {acting === contact.contact_id ? '...' : (contact as any).channel?.startsWith('linkedin') ? 'Mark Done' : 'Approve & Send'}
                </button>
              </div>
            </div>

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
                  <p className="text-xs text-blue-500 font-medium mb-1">Message to send:</p>
                  <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-white rounded-md p-3 border border-blue-100 font-sans">{(contact as any).linkedin_message || contact.draft.body}</pre>
                </div>
              </div>
            ) : (
              /* Email Step - Editable */
              <div className="mt-3 rounded-md bg-gray-50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Draft Email</p>
                  <div className="flex items-center gap-2">
                    {(['shorter', 'personal', 'direct'] as const).map(tone => {
                      const labels = { shorter: 'Shorter', personal: 'More Personal', direct: 'More Direct' };
                      const isRewriting = rewriting === `${contact.contact_id}-${tone}`;
                      return (
                        <button key={tone} onClick={() => handleRewrite(contact.contact_id, tone)}
                          disabled={!!rewriting}
                          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50">
                          {isRewriting ? '...' : labels[tone]}
                        </button>
                      );
                    })}
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
