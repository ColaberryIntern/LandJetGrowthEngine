/**
 * aiCost.ts — LLM cost observability (audit gap G4).
 * recordLlmUsage() is called fail-soft at every OpenAI call site; it computes
 * USD from token usage and writes an AiCostLog row tagged with the request
 * traceId + userId (from AsyncLocalStorage). getCostSummary() feeds the
 * Trust Command Center.
 */
import { AiCostLog } from '../models/AiCostLog';
import { getContext } from '../middleware/requestContext';
import { logger } from '../config/logger';

// USD per 1,000 tokens (2026 OpenAI list). Adjust if pricing changes.
const RATES: Record<string, { in: number; out: number }> = {
  'gpt-4o': { in: 0.0025, out: 0.01 },
  'gpt-4o-mini': { in: 0.00015, out: 0.0006 },
  'gpt-4-turbo': { in: 0.01, out: 0.03 },
};
function rateFor(model: string) {
  return RATES[model] || RATES[process.env.AI_MODEL || 'gpt-4o'] || { in: 0.0025, out: 0.01 };
}

export function priceUsd(model: string, inputTokens = 0, outputTokens = 0): number {
  const r = rateFor(model);
  return +(((inputTokens / 1000) * r.in) + ((outputTokens / 1000) * r.out)).toFixed(5);
}

interface Usage { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }

export function recordLlmUsage(args: { source: string; model?: string; usage?: Usage | null; status?: string }): void {
  try {
    const model = args.model || process.env.AI_MODEL || 'gpt-4o';
    const u = args.usage || {};
    const input = typeof u.prompt_tokens === 'number' ? u.prompt_tokens : null;
    const output = typeof u.completion_tokens === 'number' ? u.completion_tokens : null;
    const total = typeof u.total_tokens === 'number' ? u.total_tokens : (((input || 0) + (output || 0)) || null);
    const ctx = getContext();
    AiCostLog.create({
      source: args.source,
      model,
      input_tokens: input,
      output_tokens: output,
      total_tokens: total,
      usd: priceUsd(model, input || 0, output || 0),
      status: args.status || 'success',
      trace_id: ctx.traceId || null,
      user_id: ctx.userId || null,
    } as any).catch(() => { /* never block on cost logging */ });
  } catch (e) {
    logger.warn('recordLlmUsage failed (non-fatal)', { error: (e as Error).message });
  }
}

export async function getCostSummary(hours = 24): Promise<Record<string, unknown>> {
  const h = Math.max(1, Math.min(Math.trunc(hours) || 24, 24 * 90));
  const seq = AiCostLog.sequelize!;
  const q = async (sql: string) => (await seq.query(sql))[0] as any[];
  const totals = (await q(`SELECT count(*)::int calls, coalesce(sum(total_tokens),0)::int tokens, coalesce(round(sum(usd),4),0)::float usd FROM ai_cost_log WHERE created_at > now() - interval '${h} hours'`))[0] || { calls: 0, tokens: 0, usd: 0 };
  const bySource = await q(`SELECT source, count(*)::int calls, coalesce(sum(total_tokens),0)::int tokens, coalesce(round(sum(usd),4),0)::float usd FROM ai_cost_log WHERE created_at > now() - interval '${h} hours' GROUP BY source ORDER BY usd DESC LIMIT 12`);
  const budget = parseFloat(process.env.AI_DAILY_BUDGET_USD || '0') || null;
  return { instrumented: true, window_hours: h, totals, by_source: bySource, daily_budget_usd: budget, over_budget: budget ? (Number((totals as any).usd) || 0) > budget : false };
}
