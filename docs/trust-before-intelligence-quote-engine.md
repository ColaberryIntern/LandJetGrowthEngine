# Trust Before Intelligence — Quote Engine Alignment

How the reservation auto-quote process (ingest → price → review → send) maps to the
Colaberry **Trust Before Intelligence** frameworks (INPACT™ + GOALS™). Source:
[colaberry/trust-before-intelligence-book](https://github.com/colaberry/trust-before-intelligence-book).

Core thesis: **trust precedes autonomy** — the agent assists and explains; humans
decide; autonomy is earned, not assumed.

## INPACT™ — the six needs

| Need | How the quote engine meets it | Where |
|---|---|---|
| **I — Instant** | Pricing is deterministic and fast; the mailbox is polled every 10 min; the review queue loads on demand. LLM extraction is bounded by a 15s timeout. | `pipelineAutoRunner` (10-min job), `nlTripExtraction` (timeout) |
| **N — Natural** | Free-form, plain-English booking emails are understood via LLM extraction, not just the rigid BookRides format. | `nlTripExtraction.ts`, `processInboundEmailNL` |
| **P — Permitted** | Every endpoint is authorized (`campaigns:read/write`); territory scoping applies; **sending is gated** by `RESERVATION_SEND_ENABLED` (off by default). | `quoteTesterRoutes`, `sendReservationQuote` |
| **A — Adaptive** | _Gap._ The learning loop (improve from how humans fix exceptions) is not built yet. | open: BC #10017156199 |
| **C — Contextual** | Combines the booking mailbox (Graph), the pricing engine, customer-category detection, and flat-rate routes. | `inboundQuoteEngine`, `landjetPricing` |
| **T — Transparent** | Every quote ships with a line-item breakdown, warnings, a **confidence score**, and provenance (`source: bookrides | nl`); the full result + Graph message id are stored and logged. | `reservation_quotes.result`, review queue UI |

## GOALS™ — the five targets

| Target | Status | Notes |
|---|---|---|
| **G — Governance** | Strong | Human-in-the-loop (`needs_review`), dry-by-default sending, authorization, full audit (`result` JSONB + structured logs). Model is env-pinned (`AI_MODEL`) for rollback. |
| **O — Observability** | Partial | Structured logs for ingest/send; explainability via the breakdown. _Gap:_ no accuracy / hallucination metrics yet. |
| **A — Availability** | Adequate | Fast UI; mailbox freshness is ~10 min (the domain does not need <30s). |
| **L — Lexicon** | **Enforced** | The framework's rule: below the confidence threshold, do not guess — hand to a human. We encode `AUTOSEND_MIN_CONFIDENCE = 0.90`; **the agent may only ever auto-send at/above 0.90**, and the LLM is instructed not to invent addresses/dates. Today all LLM-extracted quotes (0.3–0.5) are below it and route to `needs_review`. |
| **S — Solid** | Adequate | Parsed/extracted fields validated; fail-soft per email; idempotent ingest. |

## The trust posture, concretely

1. **No autonomous customer action.** Quotes are never emailed automatically. A
   person reviews and clicks Send; even then sending is off until
   `RESERVATION_SEND_ENABLED=true` after Percy/Lorie validate.
2. **AI never acts on a low-confidence read.** `autoSendEligible()` requires
   `auto_ready` **and** confidence ≥ 0.90. Everything else is human-reviewed.
3. **AI-extracted (free-form) quotes always go to a human** (`source: nl` →
   `needs_review`), surfaced with the extracted details and a visible
   "AI-extracted · verify" tag.
4. **Everything is explainable and auditable** — breakdown, warnings, confidence,
   provenance, stored result, and logs tie each quote back to its source email.

## Honest gaps (to earn more autonomy later)

- **Adaptive (INPACT-A):** no feedback/learning loop yet — BC #10017156199.
- **Observability (GOALS-O):** no accuracy / hallucination metrics yet.
- **Road-distance accuracy:** distance trips price at miles=0 (concierge fills in)
  until the Google Maps key lands — BC #10015474993.

These are the prerequisites the framework would require before turning on real
auto-send. Until then the engine stays assistive: it prepares, explains, and
waits for a human.
