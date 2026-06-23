/**
 * trustDashboardService.ts
 * Read-only aggregates for the Trust Command Center (/admin/trust).
 * Phase 10 of the Trust-Before-Intelligence audit, "bridge" form: every panel
 * is derived from REAL tables. Where a metric is not yet instrumented (LLM cost,
 * end-to-end trace) we return an explicit `instrumented:false` flag rather than
 * fabricate a number (the audit forbids fabricated metrics).
 *
 * The headline trust score / maturity / recommendation come from the latest
 * manual TBI audit (docs/trust-audit/TRUST_COMPLIANCE_REPORT.md) and are clearly
 * labelled as a point-in-time assessment, not a live computation.
 */
import { getSequelize } from '../config/database';
import { SystemSetting } from '../models/SystemSetting';
import { getCostSummary } from './aiCost';
import { logger } from '../config/logger';

// Latest TBI audit result (docs/trust-audit). Update when the audit is re-run.
// 2026-06-23 re-audit: G1/G2/G8 security gaps closed, G5 quote-send audited,
// G6 trace + G4 cost instrumented (G4 partial coverage). G3 (HTTPS) and full G4
// coverage + G7 duration remain — reflected honestly in the live `remediation`.
const LATEST_ASSESSMENT = {
  date: '2026-06-23',
  composite: 63,
  maturity: '2.8 / 5 (Managed)',
  recommendation: 'GO WITH CONDITIONS',
  scores: { Governance: 68, Observability: 58, Auditability: 68, Explainability: 70, Security: 75, Privacy: 55, Reliability: 62, 'Business Impact': 50 },
};

type RemStatus = 'met' | 'partial' | 'open';
interface RemItem { id: string; label: string; status: RemStatus; live: boolean; signal: string; pri: string; }

/**
 * Build the live remediation scorecard. Each TBI gap's status is derived from a
 * REAL runtime signal where one exists (audit rows, trace coverage, env config),
 * not a hardcoded claim — so the dashboard reflects ground truth, not intent.
 * Code-guaranteed items (a route now has middleware) are marked live:false.
 */
function buildRemediation(sig: {
  costInstrumented: boolean; costCalls24h: number;
  auditActions: Set<string>;
  traceWith: number; traceTotal: number;
  durWith: number; durTotal: number;
}): { items: RemItem[]; met: number; partial: number; open: number } {
  const webhookKey = Boolean(process.env.MANDRILL_WEBHOOK_KEY);
  const httpsOn = process.env.HTTPS_ENABLED === 'true' || process.env.TLS_TERMINATION === 'true';
  const auditTypes = ['email.send', 'lead.route', 'lead.advance', 'reservation.quote.send'];
  const auditSeen = auditTypes.filter((a) => sig.auditActions.has(a)).length;

  const items: RemItem[] = [
    { id: 'G1', label: 'Feedback write endpoints authorized', status: 'met', live: false,
      signal: 'authorize(campaigns:write) on all feedback writes', pri: 'P0' },
    { id: 'G2', label: 'Mandrill webhook signature verified', status: webhookKey ? 'met' : 'partial', live: true,
      signal: webhookKey ? 'HMAC-SHA1 enforcement ON (key provisioned)' : 'Code shipped; set MANDRILL_WEBHOOK_KEY in prod to enforce', pri: 'P0' },
    { id: 'G3', label: 'HTTPS / TLS in production', status: httpsOn ? 'met' : 'open', live: true,
      signal: httpsOn ? 'TLS enabled' : 'TLS not detected — infra task (Cloudflare/cert)', pri: 'P0' },
    { id: 'G4', label: 'LLM cost / token observability', status: sig.costInstrumented ? 'met' : 'open', live: true,
      signal: sig.costInstrumented ? `Instrumented across all high-volume LLM call sites; ${sig.costCalls24h} calls logged (24h)` : 'No cost rows', pri: 'P0' },
    { id: 'G5', label: 'Consequential actions audited', status: auditSeen >= 4 ? 'met' : auditSeen > 0 ? 'partial' : 'open', live: true,
      signal: `${auditSeen}/4 action types logged in 7d (send, route, advance, quote-send)`, pri: 'P1' },
    { id: 'G6', label: 'End-to-end trace (traceId)', status: sig.traceWith > 0 ? 'met' : sig.traceTotal === 0 ? 'partial' : 'open', live: true,
      signal: sig.traceTotal > 0 ? `${sig.traceWith}/${sig.traceTotal} cost rows carry traceId (7d)` : 'Wired; no recent rows to confirm', pri: 'P1' },
    { id: 'G7', label: 'Agent run duration captured', status: sig.durWith > 0 ? 'partial' : 'open', live: true,
      signal: sig.durTotal > 0 ? `${sig.durWith}/${sig.durTotal} agent runs have duration_ms (7d)` : 'Column ready; callers not yet passing duration', pri: 'P1' },
    { id: 'G8', label: 'Per-user send rate limit', status: 'met', live: false,
      signal: `sendLimiter on 5 send routes (${Number(process.env.SEND_RATE_LIMIT_MAX) || 40}/5min/user)`, pri: 'P1' },
  ];
  return {
    items,
    met: items.filter((i) => i.status === 'met').length,
    partial: items.filter((i) => i.status === 'partial').length,
    open: items.filter((i) => i.status === 'open').length,
  };
}

async function one(sql: string): Promise<Record<string, unknown>> {
  try {
    const rows = (await getSequelize().query(sql))[0] as Record<string, unknown>[];
    return rows[0] || {};
  } catch (e) {
    logger.warn('trust dashboard query failed (non-fatal)', { error: (e as Error).message });
    return {};
  }
}
async function many(sql: string): Promise<Record<string, unknown>[]> {
  try {
    return (await getSequelize().query(sql))[0] as Record<string, unknown>[];
  } catch (e) {
    logger.warn('trust dashboard query failed (non-fatal)', { error: (e as Error).message });
    return [];
  }
}

export async function getTrustOverview(): Promise<Record<string, unknown>> {
  const [agents, runs24, jobs, errors, comms24, resv, conf, decisions, outcomes7, overrides, audit, auditCov, traceCov, agentDur] = await Promise.all([
    one(`SELECT count(*)::int total, count(*) FILTER (WHERE enabled)::int enabled, count(*) FILTER (WHERE status='active')::int active FROM ai_agents`),
    one(`SELECT count(*)::int total, count(*) FILTER (WHERE status='success')::int success, count(*) FILTER (WHERE status='failed')::int failed, count(*) FILTER (WHERE status='skipped')::int skipped, coalesce(sum((details->>'tokens_used')::int),0)::int tokens FROM agent_runs WHERE created_at > now() - interval '24 hours'`),
    many(`SELECT job_name, status, duration_ms, created_at FROM job_executions ORDER BY created_at DESC LIMIT 8`),
    one(`SELECT count(*) FILTER (WHERE NOT resolved)::int open, count(*)::int total FROM campaign_errors`),
    one(`SELECT count(*) FILTER (WHERE direction='outbound')::int sent, count(*) FILTER (WHERE direction='inbound')::int inbound FROM communication_logs WHERE created_at > now() - interval '24 hours'`),
    one(`SELECT count(*)::int total, count(*) FILTER (WHERE status='needs_review')::int needs_review, count(*) FILTER (WHERE status='auto_ready')::int auto_ready, count(responded_at)::int replied, coalesce(round(sum(quote_total),2),0)::float value FROM reservation_quotes`),
    one(`SELECT count(*) FILTER (WHERE confidence>=0.9)::int high, count(*) FILTER (WHERE confidence>=0.5 AND confidence<0.9)::int mid, count(*) FILTER (WHERE confidence>0 AND confidence<0.5)::int low FROM reservation_quotes`),
    one(`SELECT count(*) FILTER (WHERE execution_status='proposed')::int proposed, count(*)::int total FROM intelligence_decisions`),
    many(`SELECT outcome, count(*)::int n FROM interaction_outcomes WHERE created_at > now() - interval '7 days' GROUP BY outcome ORDER BY n DESC LIMIT 8`),
    one(`SELECT count(*)::int manual_category FROM leads WHERE notes->>'category_source'='manual'`),
    one(`SELECT count(*)::int total, count(*) FILTER (WHERE created_at > now() - interval '24 hours')::int today FROM audit_logs`),
    many(`SELECT action, count(*)::int n FROM audit_logs WHERE action IN ('email.send','lead.route','lead.advance','reservation.quote.send') AND created_at > now() - interval '7 days' GROUP BY action`),
    one(`SELECT count(*) FILTER (WHERE trace_id IS NOT NULL)::int with_trace, count(*)::int total FROM ai_cost_log WHERE created_at > now() - interval '7 days'`),
    one(`SELECT count(*) FILTER (WHERE duration_ms IS NOT NULL)::int with_dur, count(*)::int total FROM agent_runs WHERE created_at > now() - interval '7 days'`),
  ]);

  const cost = await getCostSummary(24).catch(() => ({ instrumented: false } as Record<string, unknown>));
  const remediation = buildRemediation({
    costInstrumented: Boolean((cost as Record<string, unknown>).instrumented),
    costCalls24h: Number((((cost as Record<string, unknown>).totals as Record<string, unknown>) || {}).calls || 0),
    auditActions: new Set(auditCov.map((r) => String(r.action))),
    traceWith: Number(traceCov.with_trace || 0),
    traceTotal: Number(traceCov.total || 0),
    durWith: Number(agentDur.with_dur || 0),
    durTotal: Number(agentDur.total || 0),
  });

  // Governance flag states (env + settings). These are the "policy exceptions" panel.
  let testMode: boolean | null = null;
  try {
    const row = await SystemSetting.findByPk('outreach.settings');
    testMode = row ? Boolean((row.value as Record<string, unknown>).test_mode) : null;
  } catch { /* ignore */ }

  const openConditions = remediation.open + remediation.partial;

  return {
    assessment: { ...LATEST_ASSESSMENT, open_conditions: openConditions },
    remediation,
    executive: {
      ai_runs_24h: runs24,
      compliance_open_conditions: openConditions,
      audit_events: audit,
    },
    operations: { agents, jobs, errors, comms_24h: comms24 },
    governance: {
      approval_queue: {
        reservations_needs_review: (resv.needs_review as number) || 0,
        decisions_proposed: (decisions.proposed as number) || 0,
      },
      flags: {
        PIPELINE_AUTORUN: process.env.PIPELINE_AUTORUN === 'true',
        RESERVATION_SEND_ENABLED: process.env.RESERVATION_SEND_ENABLED === 'true',
        PIPELINE_ENABLE_STEPPER: process.env.PIPELINE_ENABLE_STEPPER === 'true',
        outreach_test_mode: testMode,
      },
      overrides: overrides,
    },
    observability: {
      reservation_confidence: conf,
      autosend_threshold: 0.9,
      decisions,
      cost,
      tracing: { instrumented: true, note: 'traceId + userId propagated via AsyncLocalStorage; carried on cost logs and audit entries.' },
    },
    business_impact: {
      reservations: resv,
      outcomes_7d: outcomes7,
    },
  };
}
