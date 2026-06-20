# Trust Scorecard — Phase 5

0-100 per area, with a heat map. Scores are evidence-derived (see linked phase reports).

| Area | Score | Band | Basis |
|---|---:|---|---|
| Security | **60** | 🟡 | auth+RBAC+bcrypt(12)+rate-limit+ORM params. Gaps: HTTP-only (no TLS), unsigned webhook, 1 unauth write, no secret rotation/2FA. |
| Privacy | **55** | 🟡 | DNC/Unsubscribe/UserConsent models; logger context. Gaps: raw email bodies stored (`reservation_quotes.raw_body`, comm logs), no retention/TTL, PII-mask coverage unverified. |
| Observability | **40** | 🔴 | structured logs + decision/quote confidence. Gaps: cost(20), no end-to-end trace, agent duration unpopulated. |
| Governance | **65** | 🟡 | strong send gates + human-in-loop + kill switch. Gaps: audit coverage, no ABAC/rollback, auth gaps. |
| Auditability | **45** | 🔴 | `AuditLog` on ~37 actions. Gaps: 109+ service mutations + sends + routing + progression unaudited; no unified event. |
| Explainability | **70** | 🟢 | quote line-item breakdown + confidence + provenance; `IntelligenceDecision.reasoning`; classifier confidence; hallucination guard. Best area. |
| Reliability | **60** | 🟡 | fail-soft, overlap guards, idempotency (graph_message_id, processor_id), timeouts. Gaps: inconsistent retries/circuit-breakers, duration not measured. |
| Business Impact | **50** | 🟡 | `InteractionOutcome`, KPI/briefing, reservation funnel + value. Gaps: no cost/ROI rollup, revenue attribution (BookRides) not wired, no $/lead. |

**Composite Trust Score: ≈ 56 / 100.**

## Heat map (highest risk first)
```
🔴 Auditability   45  ████████▌            <- coverage gaps on consequential AI actions
🔴 Observability  40  ████████             <- cost + trace blind spots
🟡 Privacy        55  ███████████
🟡 Business Imp.  50  ██████████
🟡 Security       60  ████████████         <- TLS + webhook + unauth endpoint
🟡 Reliability    60  ████████████
🟡 Governance     65  █████████████
🟢 Explainability 70  ██████████████       <- strongest
```

## Highest-risk areas to address
1. **Auditability** of sends, lead routing, and pipeline progression (consequential, currently invisible).
2. **Cost observability** (no spend visibility or budget enforcement on LLM calls).
3. **Security**: enable HTTPS, sign the Mandrill webhook, protect the feedback endpoint.
