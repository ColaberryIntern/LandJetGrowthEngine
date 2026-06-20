# Event Model — Phase 6

## Current state: scattered, not unified
There is **no single event stream**. At least 10 tables capture slices of "what happened," each with different fields and **no shared id**:

| Table | Captures | Has user? | confidence? | cost? | trace? |
|---|---|---|---|---|---|
| `AuditLog` | admin CRUD (old/new/ip) | ✅ | — | — | — |
| `AgentRun` | agent name/status/details | ❌ | in details | tokens (some) | — |
| `IntelligenceDecision` | decision + before/after + reasoning | executed_by | ✅ | — | `trace_id` |
| `ReservationQuote` | quote + provenance | ❌ | ✅ | — | conversation_id |
| `CommunicationLog` | email/SMS delivery | ❌ | — | — | provider_message_id |
| `InteractionOutcome` | channel outcome | ❌ | — | — | — |
| `JobExecution` | batch job run | ❌ | — | — | — |
| `CampaignError` | error + ai_reasoning | resolved_by | — | — | repair_attempt_id |
| `EmailThread` | classified_data.confidence | ❌ | ✅ | — | thread id |
| `PageEvent` | web events | ❌ | — | — | session_id |

**Consequence:** you cannot answer "for lead X, show every AI call, decision, send, cost, and outcome in order, by whom" without manual cross-table joins — and several links (user, cost, workflow) simply don't exist.

## Recommended canonical event
A single append-only `system_events` table (or a typed view over the above), emitted by a shared helper at every meaningful step:

```jsonc
{
  "eventId":       "uuid",           // unique per event
  "timestamp":     "ISO-8601",
  "traceId":       "uuid",           // === workflow correlation; propagated request -> AI -> agent -> outcome
  "workflowId":    "string",         // e.g. "outreach:lead-123:step-2", "reservation:msg-abc"
  "userId":        "uuid|null",      // actor; null for system, but set 'actor':'cron:reservations'
  "actor":         "string",         // user email or 'cron:<job>' / 'agent:<name>'
  "agentId":       "string|null",    // AiAgent.name when an agent acted
  "action":        "string",         // 'ai.draft', 'email.send', 'lead.route', 'quote.prepare', ...
  "entity":        { "type":"lead|campaign|quote|...", "id":"..." },
  "confidence":    0.0,              // when a model produced/decided this
  "evidence":      { },              // inputs/breakdown/before-after that justify it
  "outcome":       "success|failed|skipped|needs_review|sent|dry",
  "cost":          { "model":"gpt-4o", "input_tokens":0, "output_tokens":0, "usd":0.0 },
  "approvalStatus":"none|pending|approved|rejected|auto",
  "meta":          { }
}
```

## Migration path (low-risk, incremental)
1. Add a shared `emitEvent(evt)` helper writing to `system_events`; call it from `recordAgentRun`, the send paths, `leadRoutingService`, `advanceLead`, and the LLM wrappers.
2. Propagate `traceId` from `requestId` middleware into a request-scoped context and pass to services (or AsyncLocalStorage).
3. Backfill `cost` by capturing `usage` on every OpenAI call (most discard it today).
4. Keep the specialized tables; `system_events` is the unifying spine + the dashboard's source.
