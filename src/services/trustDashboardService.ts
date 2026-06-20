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
import { logger } from '../config/logger';

// Latest manual audit result (docs/trust-audit). Update when the audit is re-run.
const LATEST_ASSESSMENT = {
  date: '2026-06-20',
  composite: 56,
  maturity: '2.5 / 5 (Controlled→Managed)',
  recommendation: 'GO WITH CONDITIONS',
  open_conditions: 4,
  scores: { Governance: 65, Observability: 40, Auditability: 45, Explainability: 70, Security: 60, Privacy: 55, Reliability: 60, 'Business Impact': 50 },
};

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
  const [agents, runs24, jobs, errors, comms24, resv, conf, decisions, outcomes7, overrides, audit] = await Promise.all([
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
  ]);

  // Governance flag states (env + settings). These are the "policy exceptions" panel.
  let testMode: boolean | null = null;
  try {
    const row = await SystemSetting.findByPk('outreach.settings');
    testMode = row ? Boolean((row.value as Record<string, unknown>).test_mode) : null;
  } catch { /* ignore */ }

  return {
    assessment: LATEST_ASSESSMENT,
    executive: {
      ai_runs_24h: runs24,
      compliance_open_conditions: LATEST_ASSESSMENT.open_conditions,
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
      cost: { instrumented: false, note: 'LLM token capture is partial and USD is not computed (audit gap G4).', tokens_24h_partial: (runs24.tokens as number) || 0 },
      tracing: { instrumented: false, note: 'No end-to-end traceId yet (audit gap G6); requestId is per-HTTP only.' },
    },
    business_impact: {
      reservations: resv,
      outcomes_7d: outcomes7,
    },
  };
}
