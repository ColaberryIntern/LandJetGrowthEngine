# Repository Map — Phase 1

**Repo:** LandJet Growth Engine · **Audited:** 2026-06-20 · Evidence-based, file:line cited.

## Architecture

- **Backend:** Express 5 + TypeScript, `/src`. Boots via `src/server.ts` (init Sequelize, run migrations, listen) → `src/app.ts:44-137` (route mounting, helmet/CORS, `requestId` middleware, rate limiting).
- **Frontend:** Next.js 16 / React 19 / Tailwind, `/frontend` (app-router pages: outreach, conversations, campaigns, inbound, reservations, quote-tester, agents, admin/*).
- **DB:** PostgreSQL 16 via Sequelize (38 models, `src/models`). No ORM auto-sync; schema via migrations + manual DDL.
- **Infra:** Docker (`docker-compose.production.yml`), nginx `growth.landjet.com` (**HTTP only**; `/api/*`→backend:3011, `/`→frontend:4000).

## System / service inventory

- **86 services** in `src/services` (see ai-inventory.md + service list). Key subsystems: campaigns/leads, communication/email, sequences/automation, intelligence/decision, pricing/quotes, analytics/reporting, integrations.
- **29 admin route groups** in `src/routes/admin` + core `auth.ts`, `users.ts`, `notifications.ts`, `extension.ts`, `webhooks/mandrillWebhook.ts`. All `/api/admin/*` are auth-gated (exceptions in governance-audit.md).

## Agent inventory

Central registry `src/intelligence/agents/agentRegistry.ts` (`registerAgent`, `recordAgentRun:76-93`); models `AiAgent.ts`, `AgentRun.ts`. Agents observed: `draft_writer`, `email_polisher`, `draft_rewriter`, `response_classifier`, `priority_engine`, `scheduler_engine`, `sequence_engine`, `communication_safety`, `health_scanner`, plus `src/agents/*` (campaignQA, campaignRepair, engagementFeatures, modelManagement, userManagement). Runs recorded to `agent_runs` (status + JSONB details). `duration_ms` field exists but is never populated.

## Scheduled jobs (`src/services/pipelineAutoRunner.ts`)

Master switch `PIPELINE_AUTORUN` (default **off**, `:60`). Six jobs, each with overlap guard + `PIPELINE_DISABLE_*` flag + structured start/end logging:

| Job | Interval | Fn | Disable flag |
|---|---|---|---|
| Inbound ingest | 5 min | `runIngest:119` | `PIPELINE_DISABLE_INGEST` |
| Outbound scheduler | 1 min | `runScheduler:167` | `PIPELINE_DISABLE_SCHEDULER` |
| Sequence stepper (dry-run unless `PIPELINE_ENABLE_STEPPER`) | 5 min | `runStepper:191` | `PIPELINE_DISABLE_STEPPER` |
| Daily Pulse (7am CT, weekdays) | 24 h | `runPulse:247` | `PIPELINE_DISABLE_PULSE` |
| Friday briefing | weekly | `runWeeklyBriefing:219` | `PIPELINE_DISABLE_BRIEFING` |
| Reservation auto-quote | 10 min | `runReservations:146` | `PIPELINE_DISABLE_RESERVATIONS` |

## Data inventory (38 models — provenance-bearing highlighted)

`AuditLog` (who/when/what/old/new/ip), `Lead`, `Campaign`, `CampaignLead`, `ScheduledEmail` (ai_generated, ai_instructions, approved_by, polisher_quality_score), `CommunicationLog`, `InteractionOutcome`, **`ReservationQuote`** (confidence, result.source), **`IntelligenceDecision`** (trace_id, confidence_score, risk_tier, before/after_state, executed_by — closest to a canonical event), `AgentRun`, `CampaignError` (ai_reasoning), `EmailThread` (classified_data.confidence), `JobExecution`, `CampaignHealth`, `EtlPipeline`, `DncList`, `Unsubscribe`, `UserConsent`, `SecurityIncident`, plus User/SystemSetting/Notification/analytics models.

## External integrations

| System | Where | Auth (env) |
|---|---|---|
| **Microsoft Graph / M365** (read+send mailboxes: rlandry@, percy@, gnecker@, ljreservations@) | `emailReplyService`, `outreachEmailService`, `reservationQuoteService`, `bounceProcessorService`, `morningBriefingService` | `OAUTH_TENANT_ID/CLIENT_ID/CLIENT_SECRET` (client-credentials, tenant-wide Mail.Read/Send) |
| **OpenAI** (gpt-4o) | aiMessageService, outreachQueryService, nlTripExtraction, leadLocation, replyAnalysisService, emailIntelligenceService, dealMatchingService, dailySummaryService | `OPENAI_API_KEY`, `AI_MODEL` |
| **Apollo** (lead sourcing) | `apolloLeadService` | `APOLLO_API_KEY` |
| **Mandrill** (Ali-side + delivery) | `emailService`, `webhooks/mandrillWebhook` | `MANDRILL_API_KEY` |
| **Basecamp** | `basecampService` | `BASECAMP_ACCESS_TOKEN` |
| **Google Maps** (distance) | `quoteTesterRoutes:258` | key **not provisioned in prod** |
| **CCPP MSSQL** | Basecamp token store (ops scripts) | MSSQL_* (prod only) |
| Synthflow / GHL / Stripe | smsService / stripeService | env-gated, likely inactive |

> Note: a legacy **Gmail OAuth** path exists (`gmailService.ts`, `/api/admin/communication/gmail/auth`) but is unused/non-functional for LandJet (M365 tenant); active mail is Microsoft Graph. See ai-inventory.md.

## Security boundaries

Auth (`middleware/auth.ts` JWT + X-API-Token), RBAC (`middleware/authorize.ts`, `config/roles.ts`), bcrypt(12), rate limiter (`middleware/rateLimiter.ts`), Sequelize parameterization. **Gaps:** HTTP-only (no HTTPS), no central Zod validation, unsigned Mandrill webhook, one unauthenticated write endpoint (`POST /api/admin/feedback`), no secret rotation. Detail in governance-audit.md / trust-scorecard.md.
