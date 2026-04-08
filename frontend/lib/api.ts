const BASE_URL = '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

// Auth
export function login(email: string, password: string) {
  return request<{ token: string; user: object }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

// CEO Intro Engine
export function getDrafts(campaignId?: string) {
  const params = campaignId ? `?campaign_id=${campaignId}` : '';
  return request<{ drafts: object[]; total: number }>(`/admin/ceo-intro/drafts${params}`);
}

export function approveDraft(draftId: string) {
  return request(`/admin/ceo-intro/drafts/${draftId}/approve`, { method: 'POST' });
}

export function rejectDraft(draftId: string, reason: string) {
  return request(`/admin/ceo-intro/drafts/${draftId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function runCycle(campaignId: string) {
  return request(`/admin/ceo-intro/campaigns/${campaignId}/run-cycle`, { method: 'POST' });
}

export function getCampaigns() {
  return request<{ campaigns: object[]; total: number }>('/admin/campaigns');
}

export function getStats(campaignId?: string) {
  const params = campaignId ? `?campaign_id=${campaignId}` : '';
  return request(`/admin/ceo-intro/stats${params}`);
}

export function getHealth() {
  return request<{ status: string; db: string }>('/health');
}

// Sequences
export function createSequence(data: object) {
  return request<{ sequence: { id: string } }>('/admin/campaigns/sequences', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// CEO Intro Campaigns
export function createCeoIntroCampaign(data: object) {
  return request<{ campaign: { id: string; name: string; status: string } }>('/admin/ceo-intro/campaigns', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function approveCampaign(campaignId: string, status: string) {
  return request(`/admin/campaigns/${campaignId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
}

export function linkSequence(campaignId: string, sequenceId: string) {
  return request(`/admin/campaigns/${campaignId}/link-sequence`, {
    method: 'POST',
    body: JSON.stringify({ sequence_id: sequenceId }),
  });
}

// Leads
export function createLead(data: object) {
  return request<{ lead: { id: number }; scoreBreakdown: object }>('/admin/leads', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function getCampaignLeads(campaignId: string) {
  return request<{ leads: object[]; total: number }>(`/admin/campaigns/${campaignId}/leads?limit=50`);
}

export function enrollLeads(campaignId: string, leadIds: number[]) {
  return request<{ enrolled: number; skipped: number }>(`/admin/ceo-intro/campaigns/${campaignId}/enroll`, {
    method: 'POST',
    body: JSON.stringify({ lead_ids: leadIds }),
  });
}

// Campaign Management
export function getCampaignById(campaignId: string) {
  return request<{ campaign: any }>(`/admin/campaigns/${campaignId}`);
}

export function rewriteCampaignPrompts(campaignId: string) {
  return request<{ campaign_prompt: string; steps: any[] }>(`/admin/outreach/campaigns/${campaignId}/rewrite-prompts`, {
    method: 'POST',
  });
}

export function updateCampaignFields(campaignId: string, updates: object) {
  return request<{ campaign: any }>(`/admin/campaigns/${campaignId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export function updateCampaignPrompt(campaignId: string, prompt: string) {
  return request<{ campaign: object }>(`/admin/campaigns/${campaignId}/prompt`, {
    method: 'POST',
    body: JSON.stringify({ ai_system_prompt: prompt }),
  });
}

export function getCampaignContacts(campaignId: string) {
  return request<{ contacts: any[]; total: number }>(`/admin/outreach/campaigns/${campaignId}/contacts`);
}

export function getCampaignAnalytics(campaignId: string) {
  return request<{
    total_contacts: number;
    active: number;
    completed: number;
    contacted: number;
    never_contacted: number;
    by_stage: Record<string, number>;
    by_vertical: Record<string, number>;
  }>(`/admin/outreach/campaigns/${campaignId}/analytics`);
}

export function uploadCampaignCSV(campaignId: string, csv: string) {
  return request<{ created: number; skipped: number; total: number }>(
    `/admin/outreach/campaigns/${campaignId}/upload`,
    { method: 'POST', body: JSON.stringify({ csv }) },
  );
}

export function getTotalContactCount() {
  return request<{ total: number }>(`/admin/outreach/campaigns/all/analytics`);
}

export function getUnclassifiedContactCount() {
  return request<{ total: number }>(`/admin/outreach/campaigns/unclassified/analytics`);
}

// Outreach
export interface OutreachContact {
  contact_id: string;
  name: string;
  email: string;
  relationship_type: string;
  sequence_stage: number;
  suggested_action: string;
  priority_score: number;
  vertical: string | null;
  tier: number | null;
  campaign_id: string | null;
  message_context: string;
  draft: { subject: string; body: string; prompt: string; source: string };
  status: string;
}

export interface OutreachSettings {
  emails_per_day: number;
  follow_up_delay_days: number;
  ai_drafts_enabled: boolean;
  sender_name: string;
  sender_role: string;
  sender_email: string;
}

export function getOutreachSettings() {
  return request<OutreachSettings>('/admin/outreach/settings');
}

export function updateOutreachSettings(settings: Partial<OutreachSettings>) {
  return request<OutreachSettings>('/admin/outreach/settings', {
    method: 'POST',
    body: JSON.stringify(settings),
  });
}

export function getOutreachToday() {
  return request<OutreachContact[]>('/admin/outreach/today');
}

export function assignContactCampaign(contactId: string, campaignId: string | null) {
  return request<{ contact_id: string; campaign_id: string | null }>(
    `/admin/outreach/${contactId}/campaign`,
    { method: 'POST', body: JSON.stringify({ campaign_id: campaignId }) },
  );
}

export function advanceOutreachContact(contactId: string) {
  return request<{ contact_id: string; sequence_stage: number; status: string; next_action_at: string | null }>(
    `/admin/outreach/${contactId}/advance`,
    { method: 'POST' },
  );
}

export function skipOutreachContact(contactId: string) {
  return request<{ contact_id: string; next_action_at: string }>(
    `/admin/outreach/${contactId}/skip`,
    { method: 'POST' },
  );
}

export function createStrategy(name: string, prompt: string) {
  return request<{ strategy: { id: string; name: string; prompt: string } }>('/admin/outreach/strategies', {
    method: 'POST',
    body: JSON.stringify({ name, prompt }),
  });
}
