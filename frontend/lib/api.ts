const BASE_URL = '/api';

// Extension (Chrome / LinkedIn Assistant) -- public endpoints, no auth.
export interface ExtensionVersion {
  version: string;
  filename: string;
  sizeBytes: number;
  downloadUrl: string;
}
export async function getExtensionVersion(): Promise<ExtensionVersion> {
  const res = await fetch(`${BASE_URL}/extension/version`);
  if (!res.ok) throw new Error(`Failed to fetch extension version: ${res.status}`);
  return res.json();
}

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
  return request<{ status: string; db: string; uptime: number; environment: string }>('/health');
}

// Audit Logs
export function getAuditLogs(filters?: { action?: string; entity_type?: string; limit?: number; offset?: number }) {
  const params = new URLSearchParams();
  if (filters?.action) params.set('action', filters.action);
  if (filters?.entity_type) params.set('entity_type', filters.entity_type);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));
  const qs = params.toString();
  return request<{ logs: any[]; total: number }>(`/admin/audit-logs${qs ? '?' + qs : ''}`);
}

export function getAuditStats() {
  return request<{ total: number; today: number; byEntity: Record<string, number>; topActions: Record<string, number> }>('/admin/audit-logs/stats');
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

export function pullApolloLeads(campaignId: string, count: number = 25) {
  return request<{ success: boolean; created: number; credits_used: number; duplicates: number; errors: number; details: string[] }>(`/admin/campaigns/${campaignId}/pull-apollo`, {
    method: 'POST',
    body: JSON.stringify({ count }),
  });
}

export function getApolloCredits() {
  return request<{ used: number; limit: number }>(`/admin/campaigns/apollo/credits`);
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

export function getBatchCampaignAnalytics(campaignIds: string[]) {
  return request<{ analytics: Record<string, { total_contacts: number; active: number; completed: number; contacted: number; never_contacted: number }> }>(
    `/admin/outreach/campaigns/batch-analytics?ids=${campaignIds.join(',')}`
  );
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
  state?: string | null;
  city?: string | null;
  relationship_type: string;
  sequence_stage: number;
  suggested_action: string;
  priority_score: number;
  vertical: string | null;
  tier: number | null;
  campaign_id: string | null;
  message_context: string;
  channel?: string;
  linkedin_url?: string | null;
  linkedin_message?: string | null;
  ai_error?: string | null; // populated when LinkedIn AI gen fails so the UI can warn
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
  email_signature: string;
  test_mode: boolean;
  test_email: string;
  send_days: number[];
  send_start_hour: number;
  send_end_hour: number;
  send_timezone: string;
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

export function getTestSendCount() {
  return request<{ count: number }>('/admin/outreach/test-sends/count');
}

export function resetTestSends() {
  return request<{ reset: number }>('/admin/outreach/test-sends/reset', { method: 'POST' });
}

export function swapLead(currentLeadId: string, campaignId: string) {
  return request<OutreachContact>('/admin/outreach/swap-lead', {
    method: 'POST',
    body: JSON.stringify({ current_lead_id: currentLeadId, campaign_id: campaignId }),
  });
}

export function rewriteDraft(leadId: string, tone: 'shorter' | 'personal' | 'direct', currentSubject: string, currentBody: string, channel?: string) {
  return request<{ subject: string; body: string; source: string }>('/admin/outreach/rewrite-draft', {
    method: 'POST',
    body: JSON.stringify({ lead_id: leadId, tone, current_subject: currentSubject, current_body: currentBody, channel: channel || 'email' }),
  });
}

// Inbound Lead Response + Quoting
export interface InboundInquiry {
  gmail_id: string;
  from: string;
  from_email: string;
  from_name: string;
  subject: string;
  body: string;
  received_at: string;
  type: string;
  summary: string;
}

export function scanInboundInquiries(hours?: number) {
  return request<{ inquiries: InboundInquiry[]; total: number }>(`/admin/outreach/inbound/scan${hours ? '?hours=' + hours : ''}`);
}

export interface QuoteSummary {
  subtotal: number;
  grand_total: number;
  customer_category: string;
  warnings: string[];
  approvals_needed: string[];
}

export interface FaqMatchSummary {
  question: string;
  answer: string;
  score: number;
}

export interface QuoteResponseBody {
  subject: string;
  body: string;
  lead_id: number | null;
  pricing_mode?: 'priced' | 'forward_only' | 'faq' | 'manual';
  market?: string;
  forward_to?: string[];
  forward_reason?: string;
  quote_summary?: QuoteSummary;
  faq_matches?: FaqMatchSummary[];
}

export function generateQuoteResponse(data: { name: string; email: string; company?: string; message?: string; service_type?: string; pickup_city?: string; dropoff_city?: string; passengers?: number; date?: string }) {
  return request<QuoteResponseBody>('/admin/outreach/inbound/quote', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function sendInboundResponse(to: string, subject: string, body: string) {
  return request<{ success: boolean; from: string; test_mode?: boolean }>('/admin/outreach/inbound/send', {
    method: 'POST',
    body: JSON.stringify({ to, subject, body }),
  });
}

// KPI Report
export function getKPIReport() {
  return request<any>('/admin/outreach/kpi-report');
}

export function sendKPIReport(email?: string) {
  return request<{ success: boolean }>('/admin/outreach/kpi-report/send', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

// Deal-to-Investor Matching
export interface InvestorMatch {
  lead_id: number;
  name: string;
  email: string;
  company: string | null;
  title: string | null;
  vertical: string | null;
  score: number;
  reason: string;
  draft_subject: string;
  draft_body: string;
}

export function matchDealToInvestors(deal: { deal_name: string; deal_type?: string; amount?: string; description: string; sector?: string; geography?: string }) {
  return request<{ matches: InvestorMatch[]; total: number }>('/admin/outreach/deal-match', {
    method: 'POST',
    body: JSON.stringify(deal),
  });
}

// Morning Briefing
export function getMorningBriefing() {
  return request<{ subject: string; body: string; events_count: number }>('/admin/outreach/briefing');
}

export function sendMorningBriefing(email?: string) {
  return request<{ success: boolean; events_count: number }>('/admin/outreach/briefing/send', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

// Email Reply Drafts
export interface DraftReply {
  original_id: string;
  original_subject: string;
  original_from: string;
  draft_subject: string;
  draft_body: string;
  category: string;
  confidence: number;
}

export function getInboxEmails() {
  return request<{ emails: any[]; total: number }>('/admin/outreach/inbox');
}

export function generateDraftReplies(limit?: number) {
  return request<{ drafts: DraftReply[]; total: number }>('/admin/outreach/inbox/draft-replies', {
    method: 'POST',
    body: JSON.stringify({ limit: limit || 10 }),
  });
}

export function sendEmailReply(messageId: string, body: string) {
  return request<{ success: boolean; test_mode?: boolean }>('/admin/outreach/inbox/send-reply', {
    method: 'POST',
    body: JSON.stringify({ message_id: messageId, body }),
  });
}

export interface OutreachTodayFilters {
  // 2026-06-14: replaced territory enum with N-state array for per-location ownership.
  states?: string[];
  state?: string;
  city?: string;
  campaign_id?: string;
}

export function getOutreachToday(filters: OutreachTodayFilters = {}) {
  const qs = new URLSearchParams();
  if (filters.states && filters.states.length > 0) qs.set('states', filters.states.join(','));
  if (filters.state) qs.set('state', filters.state);
  if (filters.city) qs.set('city', filters.city);
  if (filters.campaign_id) qs.set('campaign_id', filters.campaign_id);
  const s = qs.toString();
  return request<OutreachContact[]>(`/admin/outreach/today${s ? '?' + s : ''}`);
}

// Move a contact to a different campaign. Returns either:
//  - { contact_id, campaign_id: null } when unassigning (campaignId === null)
//  - A full OutreachContact (regenerated draft for the new campaign's voice)
//    when moving to a campaign
export function assignContactCampaign(contactId: string, campaignId: string | null) {
  return request<OutreachContact | { contact_id: string; campaign_id: null }>(
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

export function removeOutreachContact(contactId: string) {
  return request<{ contact_id: string; removed_from_campaign_id: string | null }>(
    `/admin/outreach/${contactId}/remove`,
    { method: 'POST' },
  );
}

export function blockOutreachContact(contactId: string, reason?: string) {
  return request<{ contact_id: string; status: string; dnc_created: boolean }>(
    `/admin/outreach/${contactId}/block`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  );
}

export interface DailySend { day: string; sends: number; }
export interface CampaignUsage { campaign_name: string; sends_30d: number; last_send: string | null; }
export interface UsageSummary {
  sends_last_7d: number;
  sends_last_30d: number;
  active_days_last_30d: number;
  avg_sends_per_active_day: number;
  last_active: string | null;
  daily: DailySend[];
  by_campaign: CampaignUsage[];
}

export function getOutreachUsage() {
  return request<UsageSummary>('/admin/outreach/usage');
}

export function createStrategy(name: string, prompt: string) {
  return request<{ strategy: { id: string; name: string; prompt: string } }>('/admin/outreach/strategies', {
    method: 'POST',
    body: JSON.stringify({ name, prompt }),
  });
}

// API Integrations
export interface ApiIntegration {
  id: string;
  name: string;
  provider: string;
  status: 'active' | 'degraded' | 'offline' | 'pending';
  base_url: string | null;
  api_version: string | null;
  auth_type: string | null;
  rate_limit: number | null;
  last_health_check: string | null;
  last_error: string | null;
  total_calls: number;
  error_count: number;
  avg_latency_ms: number | null;
  config: object | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrationStats {
  total: number;
  active: number;
  degraded: number;
  offline: number;
  health_rate: number;
}

export function getIntegrationStats() {
  return request<IntegrationStats>('/admin/integrations/stats');
}

export function getIntegrations(filters?: { provider?: string; status?: string }) {
  const params = new URLSearchParams();
  if (filters?.provider) params.set('provider', filters.provider);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();
  return request<{ integrations: ApiIntegration[]; total: number }>(`/admin/integrations${qs ? '?' + qs : ''}`);
}

export function createIntegration(data: { name: string; provider: string; base_url?: string; api_version?: string; auth_type?: string; rate_limit?: number; config?: object }) {
  return request<{ integration: ApiIntegration }>('/admin/integrations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateIntegration(id: string, updates: Partial<{ status: string; config: object }>) {
  return request<{ integration: ApiIntegration }>(`/admin/integrations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

// QA & Testing
export interface QADashboard {
  qa_status_counts: { passed: number; failed: number; untested: number };
  health_counts: { healthy: number; degraded: number; critical: number; unknown: number };
  error_summary: { total: number; unresolved: number; today: number; bySeverity: Record<string, number> };
  agent_activity: { email_retries: number; voice_fallbacks: number; bounce_cleanups: number; self_healing_retries: number };
}

export interface CampaignQADetail {
  id: string;
  name: string;
  status: string;
  qa_status: string;
  health_score: number | null;
  health_status: string | null;
  last_scan_at: string | null;
  unresolved_errors: number;
  active_leads: number;
}

export interface QAResult {
  campaignId: string;
  score: number;
  status: string;
  issues: string[];
}

export function getQADashboard() {
  return request<QADashboard>('/admin/qa/dashboard');
}

export function getQACampaigns() {
  return request<{ campaigns: CampaignQADetail[] }>('/admin/qa/campaigns');
}

export function runQACycle() {
  return request<{ results: QAResult[] }>('/admin/qa/run-cycle', { method: 'POST' });
}

export function getQAAgentActivity() {
  return request<QADashboard['agent_activity']>('/admin/qa/agents');
}

export function getTestSuiteInfo() {
  return request<{ framework: string; runner: string; categories: Record<string, number>; total: number; test_files: string[] }>('/admin/qa/test-suite');
}

// Job Management
export interface JobExecution {
  id: string;
  job_name: string;
  job_type: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  result: object | null;
  metadata: object | null;
}

export interface JobStats {
  total: number;
  running: number;
  completed_today: number;
  failed_today: number;
  avg_duration_ms: number;
  recent_failures: JobExecution[];
}

export function getJobStats() {
  return request<JobStats>('/admin/jobs/stats');
}

export function getJobs(filters?: { status?: string; limit?: number; offset?: number }) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));
  const qs = params.toString();
  return request<{ jobs: JobExecution[]; total: number }>(`/admin/jobs${qs ? '?' + qs : ''}`);
}

export function retryJob(jobId: string) {
  return request<{ job: JobExecution }>(`/admin/jobs/${jobId}/retry`, { method: 'POST' });
}

// Locale Settings
export interface LocalePreferences {
  timezone: string;
  date_format: string;
  currency: string;
  locale: string;
}

export function getLocaleSettings() {
  return request<LocalePreferences>('/admin/jobs/locale/settings');
}

export function updateLocaleSettings(updates: Partial<LocalePreferences>) {
  return request<LocalePreferences>('/admin/jobs/locale/settings', {
    method: 'POST',
    body: JSON.stringify(updates),
  });
}

// Performance & Scalability
export interface RequestTimingSummary {
  total_requests: number;
  avg_duration_ms: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  slow_requests: number;
  slowest_endpoints: { path: string; method: string; avg_ms: number; count: number }[];
  requests_per_minute: number;
}

export interface PerformanceStats {
  total: number;
  warning: number;
  critical: number;
  recent_averages: { category: string; metric_name: string; avg_value: number; max_value: number; unit: string; count: number }[];
}

export interface PerformanceMetricRecord {
  id: string;
  category: string;
  metric_name: string;
  value: number;
  unit: string;
  threshold_warning: number | null;
  threshold_critical: number | null;
  status: string;
  context: object | null;
  recorded_at: string;
}

export interface CapacityReport {
  current: { total_leads: number; active_campaigns: number; active_users: number; pending_actions: number; failed_jobs: number; daily_throughput: number };
  growth: { period: string; leads: number; emails: number; interactions: number; jobs: number }[];
  bottlenecks: string[];
  recommendations: string[];
  weekly_growth_multiplier: number;
}

export function getPerformanceStats() {
  return request<PerformanceStats>('/admin/performance/stats');
}

export function getRequestTimingSummary() {
  return request<RequestTimingSummary>('/admin/performance/requests');
}

export function getPerformanceMetrics(filters?: { category?: string; status?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (filters?.category) params.set('category', filters.category);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return request<{ metrics: PerformanceMetricRecord[]; total: number }>(`/admin/performance${qs ? '?' + qs : ''}`);
}

export function getCapacityReport() {
  return request<CapacityReport>('/admin/capacity');
}

// Resource Configuration
export interface ResourceConfig {
  max_per_cycle: number;
  max_per_campaign: number;
  send_window_start: number;
  send_window_end: number;
  max_daily_calls: number;
  api_rate_limit: number;
  retry_delay_minutes: number;
}

export function getResourceConfig() {
  return request<ResourceConfig>('/admin/capacity/resources');
}

export function updateResourceConfig(updates: Partial<ResourceConfig>) {
  return request<ResourceConfig>('/admin/capacity/resources', {
    method: 'POST',
    body: JSON.stringify(updates),
  });
}

// Intelligence Decisions
export interface IntelligenceDecision {
  decision_id: string;
  trace_id: string;
  problem_detected: string;
  analysis_summary: string;
  recommended_action: string;
  action_details: object | null;
  risk_score: number;
  confidence_score: number;
  risk_tier: string;
  execution_status: string;
  executed_at: string | null;
  executed_by: string | null;
  reasoning: string | null;
  created_at: string;
}

export interface DecisionStats {
  total: number;
  proposed: number;
  approved: number;
  executed: number;
  rejected: number;
  failed: number;
  by_risk_tier: Record<string, number>;
  avg_confidence: number;
}

export function getDecisionStats() {
  return request<DecisionStats>('/admin/decisions/stats');
}

export function getDecisions(filters?: { execution_status?: string; risk_tier?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (filters?.execution_status) params.set('execution_status', filters.execution_status);
  if (filters?.risk_tier) params.set('risk_tier', filters.risk_tier);
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return request<{ decisions: IntelligenceDecision[]; total: number }>(`/admin/decisions${qs ? '?' + qs : ''}`);
}

export function updateDecisionStatus(id: string, status: string, reasoning?: string) {
  return request<{ decision: IntelligenceDecision }>(`/admin/decisions/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, reasoning }),
  });
}

// Agent Management
export interface AiAgentRecord {
  id: string;
  name: string;
  type: string;
  department: string | null;
  status: string;
  schedule: string | null;
  enabled: boolean;
  last_run_at: string | null;
  metrics: object | null;
}

export function getAgents(filters?: { type?: string; enabled?: string }) {
  const params = new URLSearchParams();
  if (filters?.type) params.set('type', filters.type);
  if (filters?.enabled) params.set('enabled', filters.enabled);
  const qs = params.toString();
  return request<{ agents: AiAgentRecord[]; total: number }>(`/admin/agents${qs ? '?' + qs : ''}`);
}

export function enableAgent(name: string) {
  return request<{ agent: AiAgentRecord }>(`/admin/agents/${name}/enable`, { method: 'PATCH' });
}

export function disableAgent(name: string) {
  return request<{ agent: AiAgentRecord }>(`/admin/agents/${name}/disable`, { method: 'PATCH' });
}

export interface AgentRunRecord {
  id: string;
  agent_name: string;
  status: 'success' | 'failed' | 'skipped';
  duration_ms: number | null;
  details: object | null;
  error_message: string | null;
  created_at: string;
}

export function getAgentRunHistory(name: string, limit?: number) {
  return request<{ runs: AgentRunRecord[]; total: number }>(`/admin/agents/${name}/history${limit ? '?limit=' + limit : ''}`);
}

export function getAgentActivity(hours?: number) {
  return request<{ runs: AgentRunRecord[]; total: number }>(`/admin/agents/activity${hours ? '?hours=' + hours : ''}`);
}

// User Profile
export interface UserProfile {
  user: { id: string; email: string; first_name: string; last_name: string; role: string; status: string; last_login_at: string | null };
  completeness: { score: number; filled: string[]; missing: string[]; is_complete: boolean };
  locale: LocalePreferences;
}

export function getUserProfile() {
  return request<UserProfile>('/users/me/profile');
}

// Unexpected Engagement
export function logUnexpectedEngagement(data: { description: string; page_context?: string; metadata?: object }) {
  return request<{ feedback: any }>('/admin/feedback/unexpected-engagement', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Data Management & Privacy
export interface SecurityAuditResult {
  compliance_score: number;
  health: string;
  checks: { name: string; status: string; details: string }[];
  recommendations: string[];
  metrics: Record<string, number>;
}

export interface ConsentStats {
  [consentType: string]: { granted: number; revoked: number };
}

export interface EtlPipelineRecord {
  id: string;
  name: string;
  source: string;
  status: string;
  records_extracted: number | null;
  records_transformed: number | null;
  records_loaded: number | null;
  error_message: string | null;
  duration_ms: number | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface EtlStats {
  total: number;
  completed: number;
  failed: number;
  running: number;
  total_records_loaded: number;
  avg_duration_ms: number;
  success_rate: number;
}

export function getSecurityAudit() {
  return request<SecurityAuditResult>('/admin/security-audit');
}

export function getConsentStats() {
  return request<ConsentStats>('/admin/feedback/consents/stats');
}

export function getEtlPipelines(filters?: { source?: string; status?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (filters?.source) params.set('source', filters.source);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return request<{ pipelines: EtlPipelineRecord[]; total: number }>(`/admin/etl${qs ? '?' + qs : ''}`);
}

export function getEtlStats() {
  return request<EtlStats>('/admin/etl/stats');
}

// Deployments
export interface DeploymentRecord {
  id: string;
  version: string;
  environment: string;
  status: string;
  description: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface DeploymentStats {
  total: number;
  deployed: number;
  failed: number;
  rolled_back: number;
  success_rate: number;
}

export function getDeployments() {
  return request<{ deployments: DeploymentRecord[]; total: number }>('/admin/deployments');
}

export function getDeploymentStats() {
  return request<DeploymentStats>('/admin/deployments/stats');
}

// API Documentation
export interface ApiEndpoint {
  method: string;
  path: string;
  description: string;
  auth: boolean;
  permission: string | null;
}

export interface ApiDocs {
  title: string;
  version: string;
  base_url: string;
  endpoints: ApiEndpoint[];
  roles: { name: string; permissions: string[] }[];
  generated_at: string;
}

export function getApiDocs() {
  return request<ApiDocs>('/docs');
}

// Data Export
export function exportLeads(format: 'json' | 'csv' = 'json', filters?: { status?: string; pipeline_stage?: string; temperature?: string }) {
  const params = new URLSearchParams({ format });
  if (filters?.status) params.set('status', filters.status);
  if (filters?.pipeline_stage) params.set('pipeline_stage', filters.pipeline_stage);
  if (filters?.temperature) params.set('temperature', filters.temperature);
  return request<{ leads: any[]; total: number; exported_at: string }>(`/admin/leads/export?${params.toString()}`);
}

// --- Reservation auto-quotes (booking mailbox -> priced) ---
export interface ReservationQuoteRow {
  id: number;
  subject: string | null;
  from_email: string | null;
  received_at: string | null;
  mode: string;
  market: string | null;
  quote_total: string | null;
  confidence: string;
  status: 'auto_ready' | 'needs_review' | 'forward' | 'manual';
  raw_body: string | null;
  conversation_id?: string | null;
  responded_at?: string | null;
  result: {
    trip?: { passenger_name?: string; pickup_address?: string; dropoff_address?: string; service_type?: string; date_of_service?: string; start_time?: string; passengers?: number };
    quote?: { grand_total?: number; subtotal?: number; lines?: { label: string; amount: number }[]; warnings?: string[]; pricing_mode?: string; service_type?: string; customer_category?: string; market?: string; approvals_needed?: string[] };
    manual_reason?: string;
    source?: 'bookrides' | 'nl';
    sent?: { at: string; to: string | null };
    prepared?: { at: string; to: string | null };
  } | null;
}

export function getReservations(status?: string) {
  const q = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
  return request<{ reservations: ReservationQuoteRow[]; total: number }>(`/admin/quotes/reservations${q}`);
}

export function ingestReservations(lookback_hours = 72) {
  return request<{ fetched: number; created: number; skipped_existing: number; auto_ready: number; needs_review: number; forward: number; manual: number; errors: number }>(
    `/admin/quotes/reservations/ingest`, { method: 'POST', body: JSON.stringify({ lookback_hours }) });
}

export function sendReservationQuote(id: number) {
  return request<{ sent: boolean; dry: boolean; to: string | null; draft: { subject: string; text: string } }>(
    `/admin/quotes/reservations/${id}/send`, { method: 'POST' });
}

export interface ReservationMetrics {
  by_status: { status: string; n: number; avg_conf: number; value: number }[];
  by_source: { source: string; n: number }[];
  by_market: { market: string; n: number }[];
  by_service: { service_type: string; n: number }[];
  funnel: { total: number; quoted: number; sent: number; replied: number; total_value: number };
  confidence: { high: number; mid: number; low: number; none: number };
  autosend_threshold: number;
}

export function getReservationMetrics() {
  return request<ReservationMetrics>(`/admin/quotes/reservations/metrics`);
}
