# Trust Command Center — Dashboard Design (Phase 7)

One pane of glass over every AI capability. Route: **`/admin/trust`** (Next.js page) backed by `GET /api/admin/trust/*` aggregates. Reuses existing patterns (the reservation dashboard `/reservations/dashboard` is a working precedent).

## Views

### 1. Executive
- Composite **Trust Score** (from trust-scorecard) + per-area gauges; **TBI Maturity Level**.
- AI activity (LLM calls 24h/7d), **estimated $ spend** (once cost capture lands), compliance status (open P0s), revenue-influenced (from InteractionOutcome → bookings once attribution lands).

### 2. Operations
- Active workflows / running agents (from `AiAgent` + `AgentRun` last_run); job health (`JobExecution`, pipelineAutoRunner); error rate (`CampaignError`); throughput (sends, quotes, ingests/hr).

### 3. Governance
- **Approval queue** (CEO-intro drafts pending, reservation `needs_review`, `IntelligenceDecision` proposed).
- Violations/overrides (category-guard rejections, sender-whitelist blocks, `category_source='manual'`), policy exceptions (test_mode off, `RESERVATION_SEND_ENABLED`/`PIPELINE_*` flag states surfaced as banners).

### 4. Observability
- Workflow/agent traces (once `traceId` lands), tool usage, **decision history** with confidence + the 0.90 auto-send line (already visualized on `/reservations/dashboard`).

### 5. Business Impact
- Time saved (FTE-equivalent of auto-quotes), opportunities generated (leads touched), revenue influenced, customer impact (reply/booking rates).

## Component architecture
- `frontend/app/admin/trust/page.tsx` (+ subviews as tabs) → `lib/api.getTrust*()`.
- Backend `src/routes/admin/trustRoutes.ts` → `src/services/trustDashboardService.ts` with read-only aggregates over `system_events` (preferred) or, until that exists, over the current tables (AgentRun, AuditLog, ReservationQuote, IntelligenceDecision, JobExecution, CampaignError, InteractionOutcome).
- Charts: server-computed counts + CSS/SVG bars (no new chart dep), matching the reservation dashboard.

## Data design
- **Preferred:** the `system_events` table from event-model.md becomes the single source; every panel is a `GROUP BY` over it.
- **Bridge (no schema change):** `trustDashboardService` unions the existing tables into the panels above so the dashboard ships before the event spine is complete; clearly label panels whose underlying metric is not yet captured (e.g. **cost = "not yet instrumented"**) rather than fabricate numbers.

## Guardrail (Phase 10)
Implementing this route writes real code (new route + page + possibly the `system_events` table). Per the kit + repo `CLAUDE.md` governance, **build on a branch, gate behind approval of this design first**, derive every metric from real data, and use clearly-labelled placeholders where data isn't captured yet. See gap-analysis.md for the build order.
