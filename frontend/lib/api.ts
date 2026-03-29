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

export function enrollLeads(campaignId: string, leadIds: number[]) {
  return request<{ enrolled: number; skipped: number }>(`/admin/ceo-intro/campaigns/${campaignId}/enroll`, {
    method: 'POST',
    body: JSON.stringify({ lead_ids: leadIds }),
  });
}
