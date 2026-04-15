import { ROLES } from '../config/roles';

export interface ApiEndpoint {
  method: string;
  path: string;
  description: string;
  auth: boolean;
  permission: string | null;
}

export interface ApiDocumentation {
  title: string;
  version: string;
  base_url: string;
  endpoints: ApiEndpoint[];
  roles: { name: string; permissions: string[] }[];
  generated_at: string;
}

/**
 * Generate comprehensive API documentation from registered routes and roles.
 */
export function getApiDocumentation(): ApiDocumentation {
  const endpoints: ApiEndpoint[] = [
    // Health
    { method: 'GET', path: '/api/health', description: 'System health check (status, db, uptime, environment)', auth: false, permission: null },
    { method: 'GET', path: '/api/docs', description: 'API documentation and role catalog', auth: false, permission: null },

    // Auth
    { method: 'POST', path: '/api/auth/login', description: 'Authenticate user and get JWT token', auth: false, permission: null },
    { method: 'POST', path: '/api/auth/register', description: 'Register new user account', auth: false, permission: null },

    // Users
    { method: 'GET', path: '/api/users/me', description: 'Get current authenticated user', auth: true, permission: null },
    { method: 'GET', path: '/api/users/me/profile', description: 'Get user profile with completeness score and locale', auth: true, permission: null },

    // Notifications
    { method: 'GET', path: '/api/notifications', description: 'List user notifications (paginated)', auth: true, permission: 'notifications:read' },
    { method: 'POST', path: '/api/notifications', description: 'Create notification for a user', auth: true, permission: 'notifications:write' },
    { method: 'PATCH', path: '/api/notifications/:id/read', description: 'Mark notification as read', auth: true, permission: 'notifications:read' },

    // Leads
    { method: 'GET', path: '/api/admin/leads', description: 'List leads with filters (status, pipeline, temperature, search)', auth: true, permission: 'leads:read' },
    { method: 'GET', path: '/api/admin/leads/:id', description: 'Get lead by ID', auth: true, permission: 'leads:read' },
    { method: 'POST', path: '/api/admin/leads', description: 'Create new lead with auto-scoring', auth: true, permission: 'leads:write' },
    { method: 'PATCH', path: '/api/admin/leads/:id', description: 'Update lead fields', auth: true, permission: 'leads:write' },

    // Campaigns
    { method: 'GET', path: '/api/admin/campaigns', description: 'List campaigns with filters (status, type, approval)', auth: true, permission: 'campaigns:read' },
    { method: 'GET', path: '/api/admin/campaigns/:id', description: 'Get campaign by ID', auth: true, permission: 'campaigns:read' },
    { method: 'POST', path: '/api/admin/campaigns', description: 'Create new campaign', auth: true, permission: 'campaigns:write' },
    { method: 'PATCH', path: '/api/admin/campaigns/:id', description: 'Update campaign fields', auth: true, permission: 'campaigns:write' },
    { method: 'POST', path: '/api/admin/campaigns/:id/approve', description: 'Transition campaign approval status', auth: true, permission: 'campaigns:approve' },
    { method: 'POST', path: '/api/admin/campaigns/:id/enroll', description: 'Enroll lead into campaign', auth: true, permission: 'campaigns:write' },
    { method: 'POST', path: '/api/admin/campaigns/:id/enroll-bulk', description: 'Bulk enroll leads into campaign', auth: true, permission: 'campaigns:write' },
    { method: 'GET', path: '/api/admin/campaigns/:id/leads', description: 'List enrolled leads for campaign', auth: true, permission: 'campaigns:read' },

    // Outreach
    { method: 'GET', path: '/api/admin/outreach/settings', description: 'Get outreach settings', auth: true, permission: 'campaigns:read' },
    { method: 'POST', path: '/api/admin/outreach/settings', description: 'Update outreach settings', auth: true, permission: 'campaigns:write' },
    { method: 'GET', path: '/api/admin/outreach/today', description: 'Get daily outreach queue with drafts', auth: true, permission: 'campaigns:read' },
    { method: 'POST', path: '/api/admin/outreach/:id/advance', description: 'Approve and send outreach (advances lead)', auth: true, permission: 'campaigns:write' },
    { method: 'POST', path: '/api/admin/outreach/:id/skip', description: 'Skip outreach contact for today', auth: true, permission: 'campaigns:write' },
    { method: 'GET', path: '/api/admin/outreach/campaigns/:id/analytics', description: 'Campaign analytics (SQL aggregated)', auth: true, permission: 'campaigns:read' },
    { method: 'GET', path: '/api/admin/outreach/campaigns/:id/contacts', description: 'Campaign contacts (paginated)', auth: true, permission: 'campaigns:read' },
    { method: 'GET', path: '/api/admin/outreach/campaigns/batch-analytics', description: 'Batch analytics for multiple campaigns', auth: true, permission: 'campaigns:read' },
    { method: 'POST', path: '/api/admin/outreach/campaigns/:id/upload', description: 'Upload CSV contacts to campaign', auth: true, permission: 'campaigns:write' },

    // CEO Intro
    { method: 'GET', path: '/api/admin/ceo-intro/drafts', description: 'List CEO intro email drafts', auth: true, permission: 'campaigns:read' },
    { method: 'POST', path: '/api/admin/ceo-intro/drafts/:id/approve', description: 'Approve CEO intro draft', auth: true, permission: 'campaigns:write' },
    { method: 'POST', path: '/api/admin/ceo-intro/drafts/:id/reject', description: 'Reject CEO intro draft', auth: true, permission: 'campaigns:write' },

    // QA
    { method: 'GET', path: '/api/admin/qa/dashboard', description: 'QA dashboard (status counts, health, errors, agents)', auth: true, permission: 'campaigns:read' },
    { method: 'GET', path: '/api/admin/qa/campaigns', description: 'Per-campaign QA details', auth: true, permission: 'campaigns:read' },
    { method: 'POST', path: '/api/admin/qa/run-cycle', description: 'Trigger manual QA scan', auth: true, permission: 'campaigns:write' },
    { method: 'GET', path: '/api/admin/qa/agents', description: 'Agent repair/healing activity (24h)', auth: true, permission: 'campaigns:read' },
    { method: 'GET', path: '/api/admin/qa/test-suite', description: 'Test suite info (framework, categories, files)', auth: true, permission: 'campaigns:read' },

    // Performance
    { method: 'GET', path: '/api/admin/performance/stats', description: 'Performance metric aggregates (hourly)', auth: true, permission: 'campaigns:read' },
    { method: 'GET', path: '/api/admin/performance/requests', description: 'Request timing summary (p50/p95/p99, RPM)', auth: true, permission: 'campaigns:read' },
    { method: 'GET', path: '/api/admin/performance', description: 'List performance metrics', auth: true, permission: 'campaigns:read' },

    // Capacity & Resources
    { method: 'GET', path: '/api/admin/capacity', description: 'Capacity report (growth, bottlenecks, recommendations)', auth: true, permission: 'analytics:read' },
    { method: 'GET', path: '/api/admin/capacity/resources', description: 'Get resource configuration', auth: true, permission: 'analytics:read' },
    { method: 'POST', path: '/api/admin/capacity/resources', description: 'Update resource configuration', auth: true, permission: 'campaigns:write' },

    // Agents
    { method: 'GET', path: '/api/admin/agents', description: 'List registered AI agents', auth: true, permission: 'campaigns:read' },
    { method: 'GET', path: '/api/admin/agents/:name', description: 'Get agent by name', auth: true, permission: 'campaigns:read' },
    { method: 'POST', path: '/api/admin/agents', description: 'Register new agent', auth: true, permission: 'campaigns:write' },
    { method: 'PATCH', path: '/api/admin/agents/:name/enable', description: 'Enable agent', auth: true, permission: 'campaigns:write' },
    { method: 'PATCH', path: '/api/admin/agents/:name/disable', description: 'Disable agent', auth: true, permission: 'campaigns:write' },

    // Decisions
    { method: 'GET', path: '/api/admin/decisions/stats', description: 'Decision statistics (by status, risk, confidence)', auth: true, permission: 'campaigns:read' },
    { method: 'GET', path: '/api/admin/decisions', description: 'List intelligence decisions', auth: true, permission: 'campaigns:read' },
    { method: 'POST', path: '/api/admin/decisions', description: 'Create intelligence decision', auth: true, permission: 'campaigns:write' },
    { method: 'PATCH', path: '/api/admin/decisions/:id/status', description: 'Update decision status (approve/reject)', auth: true, permission: 'campaigns:write' },

    // Errors & Incidents
    { method: 'GET', path: '/api/admin/errors/stats', description: 'Error statistics', auth: true, permission: 'campaigns:read' },
    { method: 'GET', path: '/api/admin/errors', description: 'List campaign errors', auth: true, permission: 'campaigns:read' },
    { method: 'PATCH', path: '/api/admin/errors/:id/resolve', description: 'Resolve an error', auth: true, permission: 'campaigns:write' },
    { method: 'GET', path: '/api/admin/incidents/stats', description: 'Incident statistics', auth: true, permission: 'campaigns:read' },
    { method: 'GET', path: '/api/admin/incidents', description: 'List security incidents', auth: true, permission: 'campaigns:read' },
    { method: 'POST', path: '/api/admin/incidents', description: 'Create security incident', auth: true, permission: 'campaigns:write' },
    { method: 'PATCH', path: '/api/admin/incidents/:id', description: 'Update incident (status, resolution)', auth: true, permission: 'campaigns:write' },

    // Jobs
    { method: 'GET', path: '/api/admin/jobs/stats', description: 'Job execution statistics', auth: true, permission: 'campaigns:read' },
    { method: 'GET', path: '/api/admin/jobs', description: 'List job executions', auth: true, permission: 'campaigns:read' },
    { method: 'POST', path: '/api/admin/jobs/:id/retry', description: 'Retry a failed job', auth: true, permission: 'campaigns:write' },
    { method: 'GET', path: '/api/admin/jobs/locale/settings', description: 'Get locale preferences', auth: true, permission: 'campaigns:read' },
    { method: 'POST', path: '/api/admin/jobs/locale/settings', description: 'Update locale preferences', auth: true, permission: 'campaigns:write' },

    // Deployments
    { method: 'GET', path: '/api/admin/deployments/stats', description: 'Deployment statistics', auth: true, permission: 'campaigns:read' },
    { method: 'GET', path: '/api/admin/deployments', description: 'List deployments', auth: true, permission: 'campaigns:read' },
    { method: 'POST', path: '/api/admin/deployments', description: 'Create deployment record', auth: true, permission: 'campaigns:write' },

    // Roles
    { method: 'GET', path: '/api/admin/roles', description: 'List all roles with permissions', auth: true, permission: 'campaigns:read' },
    { method: 'GET', path: '/api/admin/roles/stats', description: 'Role assignment stats (user count per role)', auth: true, permission: 'campaigns:read' },
    { method: 'GET', path: '/api/admin/roles/audit', description: 'Permission audit (find anomalies)', auth: true, permission: 'campaigns:read' },
    { method: 'GET', path: '/api/admin/roles/:name', description: 'Get role detail by name', auth: true, permission: 'campaigns:read' },

    // Analytics
    { method: 'GET', path: '/api/admin/analytics/retention', description: 'Cohort retention analysis', auth: true, permission: 'campaigns:read' },
    { method: 'GET', path: '/api/admin/analytics/engagement', description: 'Engagement metrics (active users, feature adoption)', auth: true, permission: 'campaigns:read' },
    { method: 'GET', path: '/api/admin/analytics/conversions', description: 'Conversion funnel metrics', auth: true, permission: 'campaigns:read' },
    { method: 'GET', path: '/api/admin/analytics/segments', description: 'User engagement segments', auth: true, permission: 'campaigns:read' },

    // Audit Logs
    { method: 'GET', path: '/api/admin/audit-logs/stats', description: 'Audit log statistics', auth: true, permission: 'campaigns:read' },
    { method: 'GET', path: '/api/admin/audit-logs', description: 'List audit logs', auth: true, permission: 'campaigns:read' },

    // Security Audit
    { method: 'GET', path: '/api/admin/security-audit', description: 'Run security compliance audit', auth: true, permission: 'campaigns:read' },

    // Feedback & Consent
    { method: 'GET', path: '/api/admin/feedback/stats', description: 'Feedback statistics', auth: true, permission: 'campaigns:read' },
    { method: 'GET', path: '/api/admin/feedback', description: 'List user feedback', auth: true, permission: 'campaigns:read' },
    { method: 'POST', path: '/api/admin/feedback', description: 'Submit feedback', auth: true, permission: null },
    { method: 'POST', path: '/api/admin/feedback/unexpected-engagement', description: 'Log unexpected user behavior', auth: true, permission: null },
    { method: 'GET', path: '/api/admin/feedback/consents/stats', description: 'Consent statistics by type', auth: true, permission: 'campaigns:read' },

    // ETL
    { method: 'GET', path: '/api/admin/etl/stats', description: 'ETL pipeline statistics', auth: true, permission: 'campaigns:read' },
    { method: 'GET', path: '/api/admin/etl', description: 'List ETL pipelines', auth: true, permission: 'campaigns:read' },
    { method: 'POST', path: '/api/admin/etl', description: 'Create ETL pipeline', auth: true, permission: 'campaigns:write' },

    // Integrations
    { method: 'GET', path: '/api/admin/integrations/stats', description: 'Integration health statistics', auth: true, permission: 'campaigns:read' },
    { method: 'GET', path: '/api/admin/integrations', description: 'List API integrations', auth: true, permission: 'campaigns:read' },
    { method: 'POST', path: '/api/admin/integrations', description: 'Create integration', auth: true, permission: 'campaigns:write' },
    { method: 'PATCH', path: '/api/admin/integrations/:id', description: 'Update integration', auth: true, permission: 'campaigns:write' },
  ];

  const roles = Object.entries(ROLES).map(([key, role]) => ({
    name: role.name,
    permissions: role.permissions,
  }));

  return {
    title: 'LandJet Growth Engine API',
    version: '1.0.0',
    base_url: '/api',
    endpoints,
    roles,
    generated_at: new Date().toISOString(),
  };
}
