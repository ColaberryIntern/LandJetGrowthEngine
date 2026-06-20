# AI Inventory — Phase 2

Every AI/LLM capability, with purpose, I/O, risk, autonomy, and observability. All gpt-4o (`AI_MODEL`), via OpenAI `chat/completions`. **No Anthropic/Gemini/Ollama/embeddings/RAG-vector usage found** (retrieval is keyword FAQ + few-shot examples).

| # | Capability | File:line | Purpose | Output acted on | Risk | Recorded? |
|---|---|---|---|---|---|---|
| 1 | Email draft generation | `outreachQueryService.ts:252-300` (call `:271`) | Cold email body/subject | Human reviews + clicks send | **HIGH** (customer-facing) | `recordAgentRun('draft_writer','email_polisher')` `:353` — tokens **discarded** |
| 2 | LinkedIn message/connect | `outreachQueryService.ts:722-813` (`:770`) | LinkedIn note/DM | Human copies/sends | MEDIUM | **no recordAgentRun**; cached on lead.notes |
| 3 | Draft rewrite (tone) | `outreachRoutes.ts:946-1030` (`:957`) | Shorter/personal/direct | Human reviews | MEDIUM | `recordAgentRun('draft_rewriter')` `:1014` |
| 4 | NL trip extraction | `nlTripExtraction.ts:24-79` (`:33`) | Parse free-form booking → trip | Priced quote → **needs_review** (human) | MEDIUM | **no recordAgentRun**; 15s timeout, fail-soft |
| 5 | Lead location (company HQ) | `leadLocation.ts:124-172` (`:138`) | Territory state from company | Sets lead.state; auto-routed | MEDIUM | **no recordAgentRun**; validated vs US_STATES; `confident` gate |
| 6 | Email polisher agent | `agents/emailPolisherAgent.ts:87` → `aiMessageService.ts:216` | QA/polish draft, quality_score | Feeds draft | MEDIUM | tokens captured (`aiMessageService:199`) |
| 7 | Response classifier | `agents/responseClassifierAgent.ts:28-86` (`:63`) | Classify inbound reply + confidence + recommended_action (pause/continue/escalate/unsub) | Drives sequence action; writes InteractionOutcome | **HIGH** | `recordAgentRun('response_classifier',{confidence})` |
| 8 | Generic message gen | `aiMessageService.ts:149-228` (`:173`) | SMS/email/voice body | Scheduler may auto-fill+send | **HIGH** | tokens+model recorded; URL allow-list sanitization `:123` |
| 9 | Reply analysis (few-shot) | `replyAnalysisService.ts:57-120` (`:72`) | Propose Ryan's reply, learns voice | Human-facing suggestion | MEDIUM | **no recordAgentRun**; no timeout |
| 10 | Daily/morning summary, email intelligence, deal matching, todo gen | `dailySummaryService`, `emailIntelligenceService`, `dealMatchingService`, `todoGenerationService`, `morningBriefingService` | Summaries/classification/matching | Internal reports | LOW–MED | not consistently recorded |

## Hallucination / safety controls (notable)

- **Quote response guard** `quoteResponseGuard.ts:92-188`: validates AI quote body contains the exact price + customer + cities, **rejects forbidden phrases** (free/discount/refund/loyalty), and **falls back to a deterministic non-AI template** on failure. Strong.
- **URL allow-list** `aiMessageService.ts:123-126`: replaces hallucinated booking URLs.
- **Location** `confident` flag + US-state validation; **NL** "do not invent addresses/dates" + needs_review.
- **Reservation auto-send** gated at confidence ≥ 0.90 (`reservationQuoteService.ts:AUTOSEND_MIN_CONFIDENCE`).

## Approval / autonomy posture (summary)

- **Customer-facing sends are human-gated:** outreach defaults to `test_mode` + `ALLOWED_SENDERS` whitelist; CEO-intro drafts require `campaigns:approve`; reservation quotes are dry-by-default (`RESERVATION_SEND_ENABLED`) and route NL/complex to `needs_review`.
- **Autonomous-but-bounded:** lead pipeline auto-advances on send; lead routing auto-reassigns by industry; pulse/briefing auto-send (default to safe recipient). These act without per-action human approval and (routing/progression) **without an audit entry** — see governance/auditability.

## Owners

Single operator context (Ali / Colaberry). No per-capability owner metadata in code; recommend an `owner` field on `AiAgent`.

## Risk roll-up

CRITICAL: none fully autonomous to a customer without a gate. HIGH: items 1, 7, 8 (customer-facing content that can reach send paths). The mitigating control across all HIGH items is human-in-the-loop before external send.
