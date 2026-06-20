# Observability Audit — Phase 3

Scores 0-100 (evidence-based). Logger: Winston JSON (`src/config/logger.ts`), 14/30-day rotation. Per-HTTP `requestId` (`middleware/requestId.ts`), returned as `X-Request-Id`.

| Dimension | Score | Evidence / gap |
|---|---:|---|
| **User** (who/when/where) | **45** | `AuditLog` carries `user_id`+`ip` for ~37 actions; `requestId` per request. But `CommunicationLog`, `InteractionOutcome`, `AgentRun`, `JobExecution` have **no user_id**; automation has no actor. |
| **Workflow** (path/order/duration) | **40** | No `workflowId`/`traceId` linking calls. `requestId` is per-HTTP only and does not propagate into services. `JobExecution.duration_ms` + pipelineAutoRunner start/end logs give job-level timing, but a multi-step workflow (draft→polish→classify) cannot be reconstructed. |
| **Agent** (which/why/inputs/outputs) | **50** | `recordAgentRun` (`agentRegistry.ts:76-93`) logs name+status+JSONB details. But **`duration_ms` never populated**, inputs/outputs not stored, several AI calls (LinkedIn, NL, location, reply-analysis) **never call recordAgentRun**, and `.catch(()=>{})` swallows recording failures. |
| **Tool** (tools/APIs/external) | **35** | External calls logged ad hoc (warn/error on failure). No unified "tool call" record (which API, latency, status) per workflow. |
| **Retrieval** (docs/sources/citations) | **30** | No vector RAG. FAQ keyword search (`landjetFaqService`) and few-shot examples (`replyAnalysisService`); reservation `result.source` records bookrides vs nl. Citations not surfaced as data. |
| **Decision** (why/confidence/evidence) | **55** | Strong where present: `IntelligenceDecision` (confidence_score, risk_tier, reasoning, before/after_state, executed_by), `ReservationQuote` (confidence + result breakdown), `responseClassifier` (confidence). But not all decisions captured; no link to the LLM call that produced them. |
| **Cost** (tokens/$/per workflow/user) | **20** | Tokens captured **only** in the `aiMessageService` path (`:199,216`); items 1-5,9 in ai-inventory **discard token counts**. **No $ conversion, no per-user/campaign/workflow rollup, no cost alerts, no budget enforcement.** |

**Overall observability: ~40 / 100.**

## What works
- Structured JSON logs everywhere via the shared logger; failures logged with context.
- Job-level telemetry (`JobExecution`, pipelineAutoRunner duration/outcome).
- Decision/quote confidence is first-class in the two newest subsystems.

## What's missing (priority)
1. **Cost/token observability** — capture input/output tokens + USD on every LLM call; aggregate per user/campaign/workflow; alert on daily spend. (Highest-value gap.)
2. **End-to-end trace** — a `traceId`/`workflowId` propagated from request → every AI call → agent run → decision → outcome.
3. **Populate `AgentRun.duration_ms`** and call `recordAgentRun` on the AI calls that currently skip it (LinkedIn, NL extraction, location, reply analysis).
4. **Unify events** — see event-model.md (10 scattered event tables today).
