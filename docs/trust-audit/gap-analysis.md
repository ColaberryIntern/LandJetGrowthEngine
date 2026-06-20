# Gap Analysis — Phase 8

Priority: **P0** (blocks trust/security) · **P1** (high) · **P2** (medium) · **P3** (low). Effort: S/M/L.

| ID | Gap | Current | Target | Eff | Risk | Value | Pri |
|---|---|---|---|---|---|---|---|
| G1 | Unauthenticated write `POST /api/admin/feedback` | no auth | auth + `authorize` | S | low | high | **P0** |
| G2 | Mandrill webhook unsigned | accepts any payload | HMAC signature verify (`crypto.timingSafeEqual`) | S | low | high | **P0** |
| G3 | No HTTPS on growth.landjet.com | HTTP only (nginx :80) | TLS (Cloudflare or cert) | M | med | high | **P0** |
| G4 | LLM cost/token not captured | tokens only in 1 path; no $ | capture usage+USD on every call; per user/workflow rollup; daily budget alert | M | low | high | **P0** |
| G5 | Sends/routing/progression unaudited | comm_logs only | audit (or `system_events`) for email send, quote send, lead route, pipeline advance | M | med | high | **P1** |
| G6 | No end-to-end trace | requestId per HTTP only | `traceId`/`workflowId` propagated request→AI→agent→outcome (AsyncLocalStorage) | M | low | high | **P1** |
| G7 | `recordAgentRun` inconsistent; `duration_ms` unset | several AI calls skip it | wrap all LLM calls; populate duration | S | low | med | **P1** |
| G8 | No rate limit on manual sends | scheduler-only cap | per-user/route send limiter | S | med | med | **P1** |
| G9 | No unified event model | 10 scattered tables | `system_events` spine (event-model.md) | L | med | high | **P1** |
| G10 | No Trust Command Center | scattered/none | `/admin/trust` (dashboard-design.md) | L | med | high | **P2** |
| G11 | Adaptive/learning loop absent (INPACT-A) | none | capture human corrections → improve | L | low | med | **P2** |
| G12 | No automated rollback | manual | reversible-action registry + undo where possible | M | med | med | **P2** |
| G13 | Central input validation (Zod) | ad-hoc | schema validation at route boundary | M | low | med | **P2** |
| G14 | Secret rotation / vault | env only | rotation + masked logging audit | M | med | med | **P3** |
| G15 | PII retention/TTL on stored bodies | indefinite | retention policy + redaction | M | low | med | **P3** |
| G16 | Google Maps key (quote accuracy) | absent | provision → real road miles → more quotes ≥0.90 | S | low | high | **P1** |

## Suggested build order
1. **P0 quick wins (days):** G1, G2 (security one-liners), then G3 (TLS).
2. **Observability foundation:** G4 (cost capture) + G6 (traceId) + G7 → unlocks the dashboard's honest numbers.
3. **Auditability:** G5 (+ G9 event spine as the durable form).
4. **Dashboard:** G10 once G4/G6/G9 feed it; G16 in parallel (improves auto-quote readiness).
5. **Maturity:** G11 (adaptive), G12 (rollback), G13–G15 hardening.
