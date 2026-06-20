# Trust Compliance Report — LandJet Growth Engine

**Date:** 2026-06-20 · **Framework:** Trust Before Intelligence (INPACT™ / GOALS™) · **Method:** evidence-based, file:line cited (see `docs/trust-audit/*`).

## Executive summary
LandJet Growth Engine is an AI-heavy outreach + quoting platform (10+ gpt-4o capabilities, 6 scheduled jobs, 38 data models, Microsoft-Graph mail, Apollo, Mandrill). On the **central Trust-Before-Intelligence question — "does the AI act on its own, or does a human decide?" — the answer is good:** every customer-facing action is gated (sender whitelist, test-mode default, approval workflows, dry-by-default quote sends, a 0.90 auto-send confidence floor, a hallucination guard with deterministic fallback, and a master automation kill-switch that is OFF by default). **Explainability is the strongest area** (quotes ship with line-item breakdowns + confidence + provenance).

The weaknesses are **visibility, not control**: there is **no cost/token observability**, **no end-to-end trace**, **audit coverage is partial** (sends, lead routing, and pipeline progression are not audited), and there is **no unified event model or trust dashboard**. Two concrete security gaps (an unauthenticated write endpoint and an unsigned webhook) and the lack of HTTPS are easily fixable but real.

## Scores
| | Score |
|---|---:|
| **Composite Trust** | **56 / 100** |
| Governance | 65 (LEVEL 3 — MANAGED) |
| Observability | 40 |
| Auditability | 45 |
| Explainability | 70 |
| Security | 60 · Privacy 55 · Reliability 60 · Business Impact 50 |
| **TBI Maturity Level** | **2.5 / 5 (CONTROLLED → MANAGED)** |

## Critical findings
1. **No LLM cost/spend visibility or budget enforcement** — tokens are discarded on most calls; runaway-spend risk on large pulls. (observability-audit, G4)
2. **Consequential AI actions are unaudited** — email sends, lead routing, pipeline advancement leave no audit entry. (auditability, G5)
3. **Two open security gaps** — unauthenticated `POST /api/admin/feedback` (G1) and an **unsigned Mandrill webhook** (G2, spoofable → false outcomes). Plus **HTTP-only** in prod (G3).
4. **No correlation/trace** linking request → AI call → agent → decision → outcome (G6) and no unified event model (G9).

## Top 10 risks
1 Cost blind spot/no budget · 2 Unsigned webhook · 3 Unauth feedback write · 4 No HTTPS · 5 Send/routing/progression unaudited · 6 No trace id · 7 `recordAgentRun` gaps + duration unset · 8 No rate-limit on manual sends · 9 No automated rollback · 10 Raw PII bodies stored without retention.

## Top 10 quick wins
1 Auth the feedback endpoint (S) · 2 Verify webhook signature (S) · 3 Capture OpenAI `usage` on every call (S) · 4 Populate `AgentRun.duration_ms` + wrap the 4 unrecorded LLM calls (S) · 5 Per-user send rate limiter (S) · 6 Provision Google Maps key → more quotes clear 0.90 (S) · 7 Audit-log email send + lead route + pipeline advance (M) · 8 Propagate `traceId` via AsyncLocalStorage (M) · 9 TLS via Cloudflare (M) · 10 Daily spend alert (S).

## Roadmap
- **30 days:** P0 security (G1, G2, G3) + cost capture (G4) + agent-run hygiene (G7) + Maps key (G16). → raises Security, Observability, and auto-quote readiness.
- **60 days:** auditability (G5) + traceId (G6) + the `system_events` spine (G9) + send rate limiting (G8). → Observability/Auditability into the green.
- **90 days:** ship the **Trust Command Center** `/admin/trust` (G10) on the event spine; begin the Adaptive learning loop (G11) and automated rollback (G12).

## Executive recommendation: **GO WITH CONDITIONS**
The system is **safe to keep operating today** because no AI capability reaches a customer without a human gate, and automation is off-by-default with explicit kill-switches. It is **not yet ready to be presented to regulators/customers as a "trusted, observable" system, nor to expand AI autonomy,** until the conditions below are met.

**Conditions (must, before expanding autonomy or external trust claims):**
1. Close the two auth gaps (G1, G2) and enable HTTPS (G3).
2. Instrument LLM cost + a daily budget alert (G4).
3. Audit the consequential AI actions — sends, routing, progression (G5).
4. Add request→outcome tracing (G6).

Meeting those four moves the composite trust score from ~56 into the ~70s and the maturity level to a solid **MANAGED (3)**, at which point the Trust Command Center (Phase 10) and broader auto-send become defensible.

---
*Phase 10 (building `/admin/trust` + the event table) is intentionally NOT executed in this run — it writes application code and is gated behind approval of `dashboard-design.md`, per the kit's guardrail and the repo's `CLAUDE.md` governance.*
