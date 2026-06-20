# Governance Audit — Phase 4

Where AI/automation can act, and whether humans can review / bypass / roll back / audit it.

## Authn / Authz
- `middleware/auth.ts:29-70` — JWT + per-user `X-API-Token`; sets `req.user{userId,email,role}`.
- `middleware/authorize.ts:5-39` — `authorize(...perms)` + `requireRole(...)`; roles in `config/roles.ts` (admin=`['*']`; `campaigns:approve` restricted to manager/account_manager; `users:write` to account_manager).
- Coverage: all `/api/admin/*` mutating endpoints require auth + a permission. **Exceptions:** `POST /api/admin/feedback` (**no auth**), `POST /api/webhooks/mandrill` (**no signature validation**), `auth/register|login` (intentional, rate-limited).

## Action gates (each side-effecting path)

| Area | Can AI act alone? | Human review | Bypass | Rollback | Audited | Evidence |
|---|---|---|---|---|---|---|
| Outreach email send | No (test_mode default; whitelist) | Yes (review/approve) | flip `test_mode` | log only (can't unsend) | comm_logs (not AuditLog) | `outreachEmailService.ts:127-134,225-258,273-299` |
| Reservation quote send | Conditional (≥0.90 + flag) | Yes (needs_review queue) | `RESERVATION_SEND_ENABLED=true` | log only | result.sent (not AuditLog) | `reservationQuoteService.ts:180-183,308-334` |
| CEO-intro draft send | No | **Yes, mandatory** approve gate | none | regen/reject | **AuditLog** | `ceoIntroRoutes.ts`, `draftService.ts:113-167` |
| Scheduled-email dispatch | Yes (in pipeline) | guard chain (active/window/test/safety) | env | cancel (status) | comm_logs | `schedulerService.ts:61-147` |
| AI message gen in scheduler | Yes (if `ai_drafts_enabled`) | guard chain + quoteResponseGuard | settings | — | partial | `schedulerService.ts:89-119` |
| Lead pipeline advance | **Yes, implicit on send** | none | — | manual DB | **not audited** | `outreachEmailService.ts:418-426`, `leadProgressionService.ts` |
| Lead routing (reassign) | **Yes, by industry** | manual override (`category_source='manual'`) | — | manual | **not audited** | `leadRoutingService.ts:117-220` |
| Pulse / briefing send | **Yes, scheduled** | none (defaults to safe recipient) | disable flag | — | logs | `pipelineAutoRunner.ts:247-280` |
| Pipeline master | n/a | `PIPELINE_AUTORUN=false` default | env | — | logs | `pipelineAutoRunner.ts:60` |

## Strengths
- Customer-facing **sends are gated** (whitelist, test-mode, approval, confidence + dry-default).
- **Deterministic fallback** for quote bodies; **hallucination guard** rejects bad AI output pre-send.
- **Master kill switch** + per-job disables; stepper dry-run by default with batch cap (10/cycle).
- Caller-role escalation checks in `userManagementService` (account_manager can't mint admins).

## Weaknesses
- **Unauthenticated write** (`/api/admin/feedback`) and **unsigned webhook** (Mandrill) — spoofable.
- **No rate limiting on manual send endpoints** (per-campaign limit only in scheduler).
- **Lead routing + pipeline progression are unaudited** despite being consequential AI decisions.
- **No automated rollback** — reversal is manual; sent emails/quotes are irreversible by nature.
- A `middleware/governanceCheck.ts` exists but appears **unused** (no central policy engine / ABAC).

## Governance maturity: **LEVEL 3 — MANAGED**
Controls + enforced human review on the highest-risk (customer-facing) paths, with audit on a core set of admin actions. Held below Level 4 (TRUSTED) by: incomplete audit coverage (sends/routing/progression), no unified policy engine/ABAC, no automated rollback, and the two open auth gaps.
