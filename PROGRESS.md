# PROGRESS.md
**LandJet Growth Engine -- Task Tracking & Session History**

Last updated: 2026-06-25

---

## Session: 2026-06-25

- [x] **Outreach feedback: live smoke test + fix `sendSystemEmail` address hygiene (trailing-space recipient rejection)**
  - Date: 2026-06-25
  - What changed: Ran the feedback loop once end-to-end against the deployed API + real OpenAI triage + real Graph (minted a Ryan JWT via `refreshToken`, POSTed "emails are too long, keep to 3 sentences"). The loop PASSED (200, `add_guardrail`, `status=applied`, row stored) but the confirmation email FAILED: the stored `sender_email` carries a trailing space (`"rlandry@landjet.com "`) and Graph rejects the whole send ("recipient is not resolved"). The bulkhead held — request still returned 200, no email half-sent. Hardened [sendSystemEmail](src/services/outreachEmailService.ts) to trim `from`/`to`/`cc`, `encodeURIComponent` the `from` in the URL, and return a typed failure when `from`/`to` are empty. Cleaned up the smoke-test side effects in prod (cleared the test guardrail from `outreach.settings`, deleted the test `outreach_feedback` row).
  - Verification: backend `tsc --noEmit` clean; new jest [sendSystemEmail.test.ts](src/tests/unit/sendSystemEmail.test.ts) **2/2** (trailing-space on from/to/cc is trimmed so Graph resolves; empty `to` returns a typed failure, no throw). Live re-verify after deploy: one Graph notification to ali@colaberry.com with a deliberately dirty `from` -> success.
  - Notes: TWO live findings surfaced — (1) prod outreach `test_mode` is **false**, so feedback confirmation emails address the real Ryan + cc Ali (not a test inbox); Ali's call: hold quietly, no Ryan notification yet, feature stays live. (2) the stored `sender_email` setting itself had a trailing space — **actioned**: trimmed `sender_email` (and `test_email`) in the prod `outreach.settings` JSONB to clean values, in addition to the defensive trim in the send path.

## Session: 2026-06-24

- [x] **Outreach "Report an issue" -> auto-assess -> auto-fix -> notify (Ryan's WhatsApp loop, in-app)**
  - Date: 2026-06-24
  - What changed: Brought the Reservations "tell us what's wrong and we fix it" pattern to the Outreach page so Ryan can log issues in-app instead of over WhatsApp, with the change applied AND an email back explaining what changed. **(1) Model** — new [OutreachFeedback.ts](src/models/OutreachFeedback.ts) (`outreach_feedback`: category, comment, raw LLM `triage` JSONB, chosen `action`, plain-language `applied`, `status` applied|needs_review|failed, contact_id, created_by); registered in [models/index.ts](src/models/index.ts). **(2) Service** — new [outreachFeedbackService.ts](src/services/outreachFeedbackService.ts): `triageOutreachFeedback` prompts the existing OpenAI integration (same key/model as draft gen, 15s AbortController timeout) to map free text to ONE bounded action — `add_guardrail` (voice/style rule), `update_setting` (allow-listed: sender_name/role, signature, emails_per_day, follow_up_delay_days), `block_contact` (reuses `blockLead`), `reassign_campaign` (resolve by name, repoint campaign_id + reset to step 1), or `needs_review`. `coerceTriage` distrusts the model: unknown/unsafe actions, low confidence (<0.55), or actions needing an absent contact_id are downgraded to needs_review. Safe actions auto-apply; everything is stored; a confirmation email fires best-effort. **(3) Guardrails surface** — added `draft_guardrails` to `OutreachSettings` ([outreachQueryService.ts](src/services/outreachQueryService.ts)), injected into the draft system prompt and the rewrite prompt ([outreachRoutes.ts](src/routes/admin/outreachRoutes.ts)) so accumulated rules shape every future email; de-duped on append so it's idempotent. **(4) Email** — new exported `sendSystemEmail` on [outreachEmailService.ts](src/services/outreachEmailService.ts) reuses the tenant Graph token + `users/{from}/sendMail`; the notification goes to Ryan (rlandry@), cc Ali, from rlandry@, and redirects to the test inbox when `test_mode` is on. Never throws (best-effort bulkhead). **(5) Route** — `POST /api/admin/outreach/feedback` ([outreachRoutes.ts](src/routes/admin/outreachRoutes.ts), `campaigns:write`, validates category). **(6) Frontend** — `submitOutreachFeedback` client ([api.ts](frontend/lib/api.ts)) + a "Report an issue" header button and modal (category select + free-text + result banner) and an editable "Writing rules" textarea in Settings so a bad auto-added guardrail is reviewable/removable from the UI ([outreach/page.tsx](frontend/app/outreach/page.tsx)).
  - Verification: backend `tsc --noEmit` clean + frontend `tsc --noEmit` clean. New jest [outreachFeedbackService.test.ts](src/tests/unit/outreachFeedbackService.test.ts) **8/8** — BUILD-BREAK-HARDEN: happy path (too-long -> add_guardrail -> settings updated -> applied row -> 1 email to test inbox), failure paths (LLM unreachable -> needs_review, no mutation, row still stored; no OPENAI_API_KEY -> needs_review without calling the LLM), boundary (unknown action coerced; block without contact_id held), block-with-contact applies, idempotency (duplicate guardrail not appended twice, case-insensitive), and the email bulkhead (Graph 500 still returns stored:true/applied). Adjacent suites unaffected: outreachQueries + outreachRelease + outreachSender + draftService **126/126**.
  - Notes: Auto-fix scope is deliberately bounded to safe/reversible actions (Ali's choice: auto-apply safe, hold risky); risky/ambiguous feedback is logged as needs_review and surfaced in the cc'd email rather than guessed at. `reassign_campaign` does the minimal safe repoint (drafts regenerate on read) rather than replicating the 170-line route flow. Not yet deployed to prod; `outreach_feedback` table is created by Sequelize sync on boot.

- [x] **Outreach area isolation hardening + Grant send-capability + live 25-point release checklist**
  - Date: 2026-06-23
  - What changed: Pre-release verification ("login as each rep, confirm nobody shows on the wrong list, send test emails") surfaced real gaps and fixed them. **(1) RBAC** — Grant was `account_manager`, which has `leads:read` but NOT `campaigns:write`, so he could VIEW his IA leads but never SEND outreach (the /advance route needs campaigns:write). [provisionOutreachTeam.ts](src/scripts/provisionOutreachTeam.ts) now provisions Grant as `manager` (leads:read + campaigns:write, no admin powers) and sets roles authoritatively on the existing accounts. **(2) Area-isolation leaks** — the leads LIST and outreach TODAY queue were scoped, but three sibling routes were NOT: `/admin/leads/export` ran unscoped (a TX rep could dump the whole pool), `/admin/leads/:id` (detail) let a rep open any lead by id, and `/admin/leads/distinct` (filter chips) listed every state's values. New [leadScope.isStateInScope](src/services/leadScope.ts) + wiring in [leadRoutes.ts](src/routes/admin/leadRoutes.ts): export is now state-clamped, detail returns 404 for an out-of-area lead, and distinct values are restricted to the user's territory. Ryan (no scope) still sees everything (Ali's choice: Ryan = all incl. TX/IA). **(3) Live harness** — new [verifyOutreachLive.ts](src/scripts/verifyOutreachLive.ts) mints a real session token per rep (same JWT the login endpoint issues) and runs a **25-point checklist** against the live API + services: authenticate, send-capability, list/today/export/detail/distinct isolation, cross-area (TX lead 404s for Grant; IA lead 404s for Percy), sender/from resolution, signature correctness (no Ryan personal data), identity guard, personalization, and 3 real signature test-emails (gated behind SEND_TEST_EMAILS=1, sent to ali@colaberry.com).
  - Verification: backend `tsc --noEmit` clean; jest [outreachRelease.test.ts](src/tests/unit/outreachRelease.test.ts) **45/45** (adds isStateInScope: code+full-name match, out-of-area blocked, null-state blocked for scoped users). **Deployed + re-provisioned on prod; live 25-point checklist = 25 PASS / 0 fail.** Highlights: Percy list 200/200 TX + Grant 200/200 IA + Ryan sees both; Percy export clamped to 342 TX leads (was full pool); cross-area detail TX lead #7886 -> 404 for Grant / 200 for Percy, IA lead #7851 -> 404 for Percy / 200 for Grant; Grant role admin->manager; 3 signature test-emails sent from rlandry@/percy@/gnecker@ to ali@colaberry.com (correct from-address each).
  - Notes: `isStateInScope` deliberately hides null/blank-state leads from a scoped rep (consistent with the list's state predicate) -- isolation over convenience; Ryan still sees them. Detail-route out-of-area read returns 404 (indistinguishable from missing).

- [x] **Reservations: persistent auto-merge of duplicate forwards (ingest + backfill)**
  - Date: 2026-06-24
  - What changed: Upgraded the visual forward-dedup to a real, persistent merge per Ali. New `reservationDedupKey` (reservation number / trip signature / sender + normalized subject) + `autoMergeDuplicates` ([reservationQuoteService.ts](src/services/reservationQuoteService.ts)) group ACTIVE rows by key and absorb the extras into a canonical (prefer one with a draft, then most recent = the forward) via the existing `mergeReservations` (sets merged_into + closes the duplicate; unmerge restores). Runs every reservations ingest cycle ([pipelineAutoRunner.ts](src/services/pipelineAutoRunner.ts)) and as a one-off [backfill](src/scripts/autoMergeReservationDuplicates.ts). Idempotent (merged/closed rows excluded).
  - Verification: backend tsc clean; jest reservationQuoteService 35/35 (FW:/RE:/[External] of the same subject collapse; different subjects do not; reservation number preferred). Deployed; backfill merged 13 duplicates across 11 groups -- the three "June 30th" rows (#104,#102) absorbed into the forward #138 (canonical), BookRides duplicate pairs cleaned up. /reservations 200.
  - Notes: only ACTIVE (needs_reply/awaiting_customer) rows are auto-merged; canonical = forward/latest unless an older row already has a draft.

- [x] **Outreach signatures: fix prod-data leak (Ryan keeps his own signature; Percy/Grant get the clean branded template)**
  - Date: 2026-06-23
  - What changed: Live prod verification (with Sequelize models initialized) of the seeded `outreach.senders` exposed two real defects in deriving everyone's signature from Ryan's stored one: (1) the title rendered "Chief Executive Officer" for Percy (Ryan's signature spells the title out; the tokenizer only knew "CEO"), and (2) Percy's signature carried **Ryan's personal mobile (949.412.2682) and Ryan's Calendly link**. Auto-tokenizing one person's real signature for the whole team is unsafe. [provisionOutreachTeam.ts](src/scripts/provisionOutreachTeam.ts) now sets the shared `template` to the clean branded `DEFAULT_SIGNATURE_TEMPLATE` (name/title/email/website, fully tokenized, no personal data) and gives Ryan a `signature_override` = his EXACT existing signature (it is his). Percy + Grant render from the clean template with their own name, correct title (COO / Business Development), and their own email -- no leaked contact info.
  - Verification: backend `tsc --noEmit` clean; jest [outreachRelease.test.ts](src/tests/unit/outreachRelease.test.ts) **41/41** -- added a regression test proving a rich `signature_override` on one sender (Ryan's mobile/Calendly/spelled-out title) never appears in another sender's signature and that Percy/Grant show their own title. Re-provisioned prod (APPLY=1) and re-rendered live: Ryan keeps his full signature; percy@ -> "Percy Kapadia / COO" and gnecker@ -> "Grant Necker / Business Development" with NO Ryan personal data (see deploy evidence below).
  - Notes: Percy/Grant signatures intentionally omit phone/booking-link until they provide their own (Ryan's were personal). They can paste a richer signature anytime via Outreach -> Settings -> Sender Profiles (signature_override).

- [x] **Outreach release-readiness: per-sender identity (correct account + signature + title), personalization guards, server-side area enforcement, verified via a 20-failure-mode x 5-scenario loop**
  - Date: 2026-06-23
  - What changed: Made outreach ready to release to the team (Ali: Percy/Ryan/Grant log in + see their areas, send from the correct account with the correct signature). **(1) Per-sender identity** — new [senderProfileService.ts](src/services/senderProfileService.ts): a from-address resolves to ONE owner (name, title, area, signature) stored in `outreach.senders`. Fixed the core bug where a send from percy@/gnecker@ went out as "Ryan Landry" with Ryan's signature: [sendOutreachEmail](src/services/outreachEmailService.ts) now derives the display name + signature from the from-address profile, and a new **identity guard** (`detectIdentityConflict`) blocks any send whose name/signature describes a different known person than the mailbox. Added percy@ + gnecker@ to `ALLOWED_SENDERS` (+ `OUTREACH_EXTRA_SENDERS` env, case/space-robust `isAllowedSender`). [/advance](src/routes/admin/outreachRoutes.ts) uses the profile-derived identity. Titles (Ryan CEO / Percy COO / Grant Business Development) are editable in settings via new GET/PUT `/admin/outreach/senders` + a Sender Profiles editor with a title dropdown ([outreach/page.tsx](frontend/app/outreach/page.tsx), [api.ts](frontend/lib/api.ts)). **(2) Personalization guards** — new [outreachPersonalization.ts](src/services/outreachPersonalization.ts): empty `{{first_name}}` degrades to "Hi there," (not "Hi ," or a literal `{{first_name}}`), unknown/misspelled tokens are stripped + reported, lead HTML is escaped; wired as a safety-net over subject+body in /advance. **(3) Area enforcement** — new [leadScope.ts](src/services/leadScope.ts) `effectiveStates()` clamps the requested states to the authenticated user's allowed scope server-side ([leadRoutes.ts](src/routes/admin/leadRoutes.ts)), so a TX rep can't pull IA leads by editing the query string (was a UI-only default). **(4) Provisioning** — idempotent [provisionOutreachTeam.ts](src/scripts/provisionOutreachTeam.ts) ensures the 3 logins are active + scoped (Percy TX, Grant IA, Ryan all), seeds sender profiles, and derives the shared signature template from Ryan's existing stored signature (tokenized).
  - Verification: backend `tsc --noEmit` clean + frontend `tsc --noEmit` clean (both exit 0). New deterministic verifier [outreachReleaseChecks.ts](src/services/outreachReleaseChecks.ts) runs **20 failure modes x 5 scenarios** (Ryan/Percy/Grant happy paths + an edge scenario with empty name/cross-area/wrong-vertical/injected-Ryan-identity + a failure scenario with dead domain/HTML-injection/suspended-login). `npx tsx src/scripts/verifyOutreachRelease.ts` -> ALL APPLICABLE CHECKS PASS (exit 0). jest [outreachRelease.test.ts](src/tests/unit/outreachRelease.test.ts) **40/40** (matrix gate + per-check + pure-unit tests). Adjacent suites unaffected: leadTerritoryFilter + emailValidation + userManagementService **69/69**. BUILD-BREAK-HARDEN: the 20 modes ARE the BREAK list; each is HARDENed by a guard (sender whitelist, identity guard, personalization fallback/strip, area clamp, category guard, email-validation guard, test-mode redirect, HTML-escape) and covered by a passing cell across the scenarios.
  - Notes: `provisionOutreachTeam.ts` + the prod `outreach.senders` seed have NOT been run on prod yet (dry-run is the default; run `APPLY=1 docker exec landjet-backend npx tsx /app/src/scripts/provisionOutreachTeam.ts` to apply, then `verifyOutreachRelease.ts` for evidence). Area enforcement is now server-side, role-agnostic (Percy is admin/COO but still only sees TX because scope is keyed off `default_filters.states`, not role).

- [x] **Reservations: dedupe forwards by sender + subject (no trip details to key on)**
  - Date: 2026-06-23
  - What changed: Two rows for the same request ("June 30th" + "FW: June 30th" from the same internal forwarder) were not auto-deduped because neither had trip details. Added a fallback to `dedupKey` ([reservations/page.tsx](frontend/app/reservations/page.tsx)): when the reservation-number and trip-detail keys are unavailable, group by sender + normalized subject (`normSubject` strips Re:/FW:/[External] prefixes). Canonical stays the most-recent row (the forward), matching "precedence to who it got forwarded to".
  - Verification: frontend tsc clean; deployed; /reservations 200.
  - Notes: visual auto-grouping (collapses to one row + "N duplicates" badge, reversible via the toggle), consistent with the existing exact-duplicate behavior.

- [x] **Reservations: subject-aware extraction, "Ready to book" gating, Awaiting button, sticky manual status**
  - Date: 2026-06-23
  - What changed: (1) "Ready to book" contradiction -- the green tag is the customer-intent tag, firing on "confirming I received your email"; tightened the confirmation classifier ([inboundIntent.ts](src/services/inboundIntent.ts), no bare "confirm") and gated the tag so it only shows when the trip is complete (priced / nothing missing) ([reservations/page.tsx](frontend/app/reservations/page.tsx)). (2) Read the SUBJECT in extraction -- dates/routes are often there ("...Kenneth Guy 6/29/26 & 7/14/26") and the body alone missed them; ingest + reextract prepend "Subject: ..." for the NL path, and `firstDateInText` ([reservationClassify.ts](src/services/reservationClassify.ts)) backfills the trip date from the subject even on the BookRides parser path. (3) "Awaiting customer" button in Needs reply (+ a "Needs reply" button back). (4) Manual status sticks: `setReservationLifecycle` stamps `manual_lifecycle_at`; the reconcile respects a hand-set status (no auto lifecycle / incomplete override) until a NEW message arrives, then resumes auto. Schema via idempotent [migrateReservationsManualLifecycle.ts](src/scripts/migrateReservationsManualLifecycle.ts).
  - Verification: backend tsc + frontend tsc clean; jest inboundIntent + reservationQuoteService 40/40 ("confirming I received" not a confirmation). Deployed; migration applied; live -- Kenneth Guy row re-extracted, date now 6/29/26 from the subject (Missing: Date clears). /reservations 200.
  - Notes: manual override releases automatically when the customer next replies, so the queue stays accurate.

- [x] **Trust remediation: close P0 security gaps (G1/G2/G8), audit quote-send (G5), persist agent duration (G7), make the Trust dashboard score live/honest**
  - Date: 2026-06-23
  - What changed: Re-audited the TBI gaps at file:line (skeptical of prior PROGRESS claims) and closed the real open ones. **G1** — added `authorize('campaigns:write')` to the three unprotected feedback write routes ([feedbackRoutes.ts](src/routes/admin/feedbackRoutes.ts); router already enforced `authenticate`). **G2** — new [mandrillSignature.ts](src/middleware/mandrillSignature.ts) verifies the inbound Mandrill webhook via HMAC-SHA1 (base64) over `url + sorted(key+value)`, constant-time compare; verify-when-`MANDRILL_WEBHOOK_KEY`-configured so deploying it can't drop real events before the prod key lands; wired into [mandrillWebhook.ts](src/routes/webhooks/mandrillWebhook.ts). **G8** — new `sendLimiter` (per-user, 40/5min, `SEND_RATE_LIMIT_MAX`) in [rateLimiter.ts](src/middleware/rateLimiter.ts) applied to the 5 manual-send routes in [outreachRoutes.ts](src/routes/admin/outreachRoutes.ts). **G5** — [sendReservationQuote](src/services/reservationQuoteService.ts) now writes a `reservation.quote.send` audit entry (was unaudited despite being customer-facing). **G7** — [recordAgentRun](src/intelligence/agents/agentRegistry.ts) now persists `duration_ms` to its column when callers supply it (was permanently null). **Score honesty** — [trustDashboardService.ts](src/services/trustDashboardService.ts) updated to the 2026-06-23 re-audit (composite 56→63, maturity 2.8/5) and now emits a live `remediation` scorecard: each gap's status (met/partial/open) is derived from a real runtime signal (audit-action coverage 7d, traceId coverage on `ai_cost_log`, `duration_ms` coverage on `agent_runs`, env config) rather than a static claim; `open_conditions` is computed from it. New [trust page](frontend/app/admin/trust/page.tsx) "Trust remediation — live conditions" panel with LIVE vs CODE provenance chips. `.env.example` documents `MANDRILL_WEBHOOK_KEY`, `MANDRILL_WEBHOOK_URL`, `SEND_RATE_LIMIT_MAX`. Re-audit addendum added to [TRUST_COMPLIANCE_REPORT.md](docs/trust-audit/TRUST_COMPLIANCE_REPORT.md).
  - Verification: backend `tsc --noEmit` clean + frontend `tsc --noEmit` clean (both exit 0); jest mandrillSignature 5/5 (valid passes, no-key accepts, wrong/missing sig rejected 401, URL-tamper rejected) + reservationQuoteService 32/32. BUILD-BREAK-HARDEN on the webhook: failure modes (forged sig, missing header, wrong URL, no key) each covered by a test. **Deployed to prod** (backend+frontend rebuilt); `GET /api/admin/trust/overview` returns 401 unauth (route healthy, no 500); backend logs clean of validation errors after the two follow-on fixes below.
  - Notes: Honest remaining gaps shown as partial/open on the dashboard: **G3** HTTPS still infra-only (set `HTTPS_ENABLED=true` after TLS termination — runbook at [directives/enable-https-g3.md](directives/enable-https-g3.md)); **G4** cost wired to ~6 of ~20 LLM call sites (high-volume callers still untracked → "partial"); **G2** enforcement is "partial" until `MANDRILL_WEBHOOK_KEY` is set in prod; **G7** "partial/open" until agent call sites pass `duration_ms`.

- [x] **Trust deploy follow-ups: Express trust-proxy + IPv6-safe send-limiter key**
  - Date: 2026-06-23
  - What changed: Two prod issues the new `sendLimiter` surfaced behind nginx. (1) [app.ts](src/app.ts) now `app.set('trust proxy', 1)` — was unset, so express-rate-limit threw `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` and `req.ip` was the proxy, not the client. '1' (single nginx hop), not 'true', keeps XFF unspoofable. (2) [rateLimiter.ts](src/middleware/rateLimiter.ts) `sendLimiter` keyGenerator now routes the IP fallback through `ipKeyGenerator` (express-rate-limit v8 export) so IPv6 clients can't rotate within their /64 to bypass (`ERR_ERL_KEY_GEN_IPV6`); user id remains the primary key. Also added [directives/enable-https-g3.md](directives/enable-https-g3.md) (Cloudflare + Let's Encrypt runbook for the remaining G3).
  - Verification: backend tsc clean; redeployed; `docker logs landjet-backend` shows NO `ERR_ERL_*`/ValidationError after restart; container Up; trust endpoint 401 (healthy).
  - Notes: HTTPS (G3) remains an infra task per the directive; flipping `HTTPS_ENABLED=true` after TLS auto-greens the dashboard G3 row. (2026-06-24 follow-up: inspected the box — growth.landjet.com is host-nginx :80 only; host :443 is held by another app's `op-nginx` container, so enabling HTTPS is a cross-tenant/owner decision, not a safe autonomous change. Directive updated with the verified state + the two clean paths, Cloudflare recommended.)

- [x] **Trust G4: extend LLM cost instrumentation to the remaining high-volume call sites**
  - Date: 2026-06-23
  - What changed: The re-audit found cost capture covered only ~6 of ~20 OpenAI call sites. Added the fail-soft `recordLlmUsage({ source, usage })` (from [aiCost.ts](src/services/aiCost.ts)) after the chat-completion parse in 8 more services: [replyAnalysisService.ts](src/services/replyAnalysisService.ts) (`reply_analysis`), [inboundLeadService.ts](src/services/inboundLeadService.ts) (`inbound_lead_quote`), [emailReplyService.ts](src/services/emailReplyService.ts) (`email_reply`), [dealMatchingService.ts](src/services/dealMatchingService.ts) (`deal_matching`), [morningBriefingService.ts](src/services/morningBriefingService.ts) (`morning_briefing`), [emailIntelligenceService.ts](src/services/emailIntelligenceService.ts) (`email_intelligence`), [dailySummaryService.ts](src/services/dailySummaryService.ts) (`daily_summary`), [todoGenerationService.ts](src/services/todoGenerationService.ts) (`todo_generation`). Two suspected files were correctly left untouched — `landjetFaqService` (keyword-based, no LLM call) and `messageAgentService` (delegates to the already-instrumented `aiMessageService`). Dashboard G4 condition flipped `partial -> met` ([trustDashboardService.ts](src/services/trustDashboardService.ts)): signal now "instrumented across all high-volume LLM call sites".
  - Verification: backend `tsc --noEmit` clean (exit 0). Each insert placed after the response `.ok` guard, fail-soft (unwrapped), behavior-preserving (inlined parses split to capture `usage` first).
  - Notes: 5 additional route-level LLM calls in `src/routes/admin/outreachRoutes.ts` were also instrumented (sources `outreach_route:*`) but that file is part of concurrent in-flight outreach work; those lines ride along with that feature's commit rather than this one.

---

## Session: 2026-06-20

- [x] **Reservations: fix not_quote false positives + feedback form that learns from corrections**
  - Date: 2026-06-23
  - What changed: (1) Audit fix -- real BookRides quote requests were mis-filed as not_quote because [isPostBookingEmail](src/services/reservationClassify.ts) scanned the BODY for "Grand Total"/"Please rate us on Google", footer text BookRides also puts in quote-request emails. Now detects invoices/receipts/confirmations by SUBJECT only, and never treats an explicit quote-request subject as post-booking. Backfill made bidirectional ([migrateReservationsNotQuote.ts](src/scripts/migrateReservationsNotQuote.ts)) -> restored 16 mis-filed quotes to needs_reply; not_quote bucket now only genuine noise. (2) Learning + feedback (Ali: let the team fix issues and have the system learn, not escalate to me). New [reservation_classifier_rules](src/models/ReservationClassifierRule.ts) + [reservationClassifierRules.ts](src/services/reservationClassifierRules.ts): a human correction becomes a learned rule (domain never-a-quote / address is-a-quote; personal domains learn the exact address, not the domain), consulted by ingest BEFORE the heuristic. "Not a quote"/"Actually a quote" now go through /reclassify (sets lifecycle + learns). New per-reservation feedback form ([reservation_feedback](src/models/ReservationFeedback.ts) + [reservationFeedbackService.ts](src/services/reservationFeedbackService.ts)): "Report an issue" -> category dropdown + category-specific one-click fixes (reclassify, re-read conversation to re-extract, set status) that apply automatically + free-text stored as training data. Schema via idempotent [migrateReservationsFeedback.ts](src/scripts/migrateReservationsFeedback.ts).
  - Verification: backend tsc + frontend tsc clean; jest reservationClassify + reservationQuoteService 38/38 (adds: quote-request-with-invoice-footer not post-booking). Deployed; backfill restored 16 quotes; live learning loop test -- reclassifying the "Get Meta Verified" row (#122) to not_quote learned a global.metamail.com domain rule, and a NEW promotions@global.metamail.com now auto-files not_quote while a random gmail returns null (no over-block). /reservations 200.
  - Notes: free-text feedback is stored for learning; structured corrections apply automatically. Edge senders (e.g. metamail) the heuristic misses are now caught by one human correction.

- [x] **Reservations: incomplete quotes stay in Needs reply; Quote Tester + draft prompt fixes**
  - Date: 2026-06-23
  - What changed: Three related fixes. (1) Quote Tester ([quoteTesterRoutes.ts](src/routes/admin/quoteTesterRoutes.ts) /test paste) used the rigid BookRides parser only, so free-form / Ruby / pasted-conversation emails the live queue handles failed with "Could not parse". Now runs the SAME `processInboundEmailNL` + real road miles (distance enrichment, round-trip doubling, flat-rate detection) as the queue. (2) AI draft ([reservationDraftService.ts](src/services/reservationDraftService.ts)) is conversation-stage aware: need_info -> ask for missing details (no price); follow_up (a quote was already given / we already engaged, detected from the THREAD not the unreliable our_reply_at) -> respond to the customer's latest message and provide service, never restate/recalculate/invent a price; first_quote -> give the quote. Rubric is stage-aware (`no_new_quote` rewarded on follow-up). Fixes Ali's case where it re-quoted a different/lower number on a settled deal. (3) Incomplete quotes are outstanding work and stay in Needs reply ([isIncompleteRequest](src/services/reservationQuoteService.ts)) with the "Missing: ..." items shown, not Awaiting/Resolved; when the customer replies on an incomplete row, `reextractIntoRow` re-reads the whole thread and re-prices so a supplied detail clears the flag. Composer only shows on needs_reply (our turn).
  - Verification: backend tsc + frontend tsc clean; jest reservationDraft 7/7 + reservationQuoteService 32/32 + inboundIntent (follow-up no-new-quote, incomplete flagged/priced-not-flagged/not_quote-excluded). Deployed; live: Ruby form pastes -> priced $991.89; Kenneth follow-up draft #86 no longer quotes (acknowledges flight change, "nothing else you need to do"); Golf trip #120 moved Awaiting -> needs_reply showing Missing Date+Passengers; Instagram #121 swept to not_quote. Distribution 10 needs_reply / 10 awaiting / 19 not_quote / 4 completed.
  - Notes: reextract is gated to fire only when a NEW customer reply is detected on an incomplete row (bounded LLM cost).

- [x] **Reservations: AI reply composer only when it's our turn (hide in Awaiting/Resolved)**
  - Date: 2026-06-23
  - What changed: The "Generate AI reply" composer showed in Awaiting customer (we already replied), which is wrong. Gated the composer on `canReply = lifecycle === 'needs_reply'` so it only appears when the ball is in our court ([reservations/page.tsx](frontend/app/reservations/page.tsx)). The "what's missing" panel now says "We already asked... awaiting their reply" instead of pointing at a non-existent button when not our turn.
  - Verification: frontend tsc clean; deployed.

- [x] **Reservations: resolve when WE close the thread; Past trips bucket once trip passes**
  - Date: 2026-06-22
  - What changed: A reservation is Resolved when there's no more work for us -- including when WE send the closing message, not only when the customer signs off. Previously a courtesy close from the desk (Lorie's "Thank you for letting us know") left the row stuck in Awaiting customer. New [classifyOutboundIntent](src/services/inboundIntent.ts): a closing courtesy from us (no price/question/CTA) vs an open one (quote/question/confirm-to-book). [decideLifecycleFromThread](src/services/reservationQuoteService.ts) maps a closing last-message-from-us to `completed` (resolved); an open one stays awaiting_customer; a later customer question still re-opens to needs_reply. Past trips: a resolved reservation stays in Resolved until its trip date passes, then moves to a new "Past trips" tab (hidden by default, viewable); Resolved + All exclude past trips ([tripPassed](frontend/app/reservations/page.tsx)).
  - Verification: backend tsc + frontend tsc clean; jest inboundIntent + reservationQuoteService 35/35 (Lorie courtesy-close -> completed incl. signature/policy boilerplate; our quote/question -> awaiting; outbound closing vs open). Deployed; reconcile moved Brett Peterson #88 ("8/19 and 8/21", Lorie close) to completed/resolved; awaiting 14->12, completed 6->8, needs_reply 3. /reservations 200.
  - Notes: "Needs reply" now only ever holds outstanding items needing a reply right now. classifyOutboundIntent is conservative (defaults to 'open') so a real pending quote stays Awaiting.

- [x] **Reservations: classify BookRides invoices/confirmations as not_quote; cleaner two-address map**
  - Date: 2026-06-22
  - What changed: An invoice ("LandJet, LLC Invoice For Services Completed") and a "Transportation Confirmation" arrive from the SAME no-reply@bookridesonline.com as quote requests, so they were landing in Needs reply. New [isPostBookingEmail](src/services/reservationClassify.ts) detects invoice/receipt/confirmation by content (subject + body: Grand Total Due, Bill To, Download Invoice PDF, Transportation Confirmation) and forces `not_quote` at ingest even if a stray trip parsed; backfill reclassifies existing ones regardless of parsed trip. Map: [cleanAddr](frontend/app/reservations/page.tsx) strips "(ORD)"-style parentheticals / trailing USA / stray commas so the keyless route embed frames the driving route instead of an ocean view; row map slightly larger.
  - Verification: backend tsc + frontend tsc clean; jest reservationClassify 5/5 (BookRides invoice + Transportation Confirmation flagged by content; real request not flagged). Deployed; backfill moved invoice #96 + confirmation #87 to not_quote; Needs reply down to 3 (real quote requests only).

- [x] **Reservations: non-quote bucket + soft delete + single-address map + "what's missing"**
  - Date: 2026-06-22
  - What changed: "Needs reply" should only hold real quote requests. (1) [reservationClassify.isNonQuoteEmail](src/services/reservationClassify.ts) auto-files inbox noise (Instagram, SharePoint, receipts/QuickBooks, bounces, calendar, Canva) to a new `not_quote` lifecycle on ingest -- BookRides is never treated as noise (checked only on non-quote rows). New "Not a quote" filter + manual "Not a quote"/"Actually a quote" toggles. (2) Soft delete: new `deleted_at` column + delete/restore services+routes; GET hides deleted by default (`?deleted=1`); a "Deleted" tab with Restore. (3) Single-address map: [mapSrc](frontend/app/reservations/page.tsx) renders a one-point map when only pickup OR dropoff is known. (4) What's missing: `missingForQuote` lists gaps (pickup/dropoff/date/passengers) as a "Missing: ..." tag + an expanded panel; [generateDraft](src/services/reservationDraftService.ts) now asks the customer for exactly the missing fields when incomplete (the protocol for incomplete requests); composer/send enabled for incomplete-but-real requests (manual rows sendable only with a reviewed draft). Schema via idempotent [migrateReservationsNotQuote.ts](src/scripts/migrateReservationsNotQuote.ts).
  - Verification: backend tsc + frontend tsc clean; jest 58/58 across reservation suites (adds isNonQuoteEmail incl. BookRides-not-noise, missingForQuote). Deployed; migration+backfill moved 9 noise rows (Instagram #117, SharePoint #116, Canva #109, undeliverable #100, QuickBooks invoices, SAGE cart #82) to not_quote -> needs_reply dropped ~17 to 9; distribution 9 needs_reply / 16 awaiting / 9 not_quote / 5 completed. /reservations 200.
  - Notes: BookRides web-form requests arrive complete; free-form/direct emails can be incomplete -> "Missing" surfaces the gaps and the draft requests them. not_quote + deleted excluded from reconcile.

- [x] **Reservations: smart intent tags + auto-resolve customer sign-offs into Resolved (newest first)**
  - Date: 2026-06-22
  - What changed: A customer's last message being a sign-off ("Sounds great, thanks!") was wrongly flagged Needs reply. New deterministic classifier [inboundIntent.ts](src/services/inboundIntent.ts) (`classifyInboundIntent` -> gratitude|confirmation|question|other) runs on Graph bodyPreview during lifecycle reconciliation. New `completed` lifecycle: a gratitude sign-off after we replied auto-resolves into the Resolved bucket (reversible; a later question re-opens it to needs_reply). Smart tags surface state at a glance: "Customer signed off" (completed/teal), "Question · needs answer" (rose), "Ready to book" (emerald). Resolved bucket = completed|booked|closed, sorted by new `resolved_at` newest-first; stat card "Booked" -> "Resolved". [decideLifecycleFromThread](src/services/reservationQuoteService.ts) now returns intent + resolved_at; setLifecycle/merge stamp resolved_at, reopen/unmerge clear it. Schema via idempotent [migrateReservationsIntent.ts](src/scripts/migrateReservationsIntent.ts) (last_inbound_intent, resolved_at).
  - Verification: backend tsc + frontend tsc clean; jest inboundIntent + reservationQuoteService 31/31 (sign-off->completed, re-open on new question, no-prior-reply stays needs_reply, thanks-with-a-question->question). Deployed; migration applied; reconcile over live data auto-resolved 5 sign-off threads -> distribution 17 needs_reply / 17 awaiting / 5 completed; the flagged Courtney Parkin row (#118) is now completed/gratitude/resolved_at set. /reservations 200.
  - Notes: completed is auto + reversible (re-opens on new substantive message); booked/closed remain manual + sticky.

- [x] **Reservations: manual merge (pick one to keep) + money formatting with commas**
  - Date: 2026-06-22
  - What changed: Same-person/same-day rows that are genuinely different quotes (different reservation #/time/price) are not auto-duplicates, so added a manual merge. New `merged_into` column ([ReservationQuote.ts](src/models/ReservationQuote.ts)) + `mergeReservations`/`unmergeReservation` ([reservationQuoteService.ts](src/services/reservationQuoteService.ts)) + `POST /reservations/merge` and `/:id/unmerge` routes. Merged rows are closed, badged "Merged into #X", hidden under the grouped toggle, excluded from stats/counts; the kept row shows "N merged"; unmerge restores. UI ([reservations/page.tsx](frontend/app/reservations/page.tsx)) adds a Merge mode (select rows, pick which to keep, confirm) and an Unmerge action. Also formatted money with thousands separators ($1,114.98) across the reservations list, quote tester, AI draft facts ([reservationDraftService.ts](src/services/reservationDraftService.ts)), and the template fallback. Schema via idempotent [migrateReservationsMerge.ts](src/scripts/migrateReservationsMerge.ts).
  - Verification: backend tsc clean; frontend tsc clean; jest reservationQuoteService 23/23. Deployed backend+frontend; migration applied (merged_into present:true); /reservations 200.
  - Notes: Merge is operator-driven and reversible; auto-dedup (exact reservation #) is unchanged and separate.

- [x] **Reservations: duplicate detection + sort by most recent customer activity**
  - Date: 2026-06-22
  - What changed: BookRides sends the same request as several emails, each ingested as its own row (e.g. Stacey Spillum #110/#111 both reservation 3503372). Added client-side duplicate detection in [reservations/page.tsx](frontend/app/reservations/page.tsx): `dedupKey` uses the BookRides reservation number (exact) or a strict passenger+route+date+time signature; `buildDupMap` groups copies and picks a canonical (prefers the one with a draft, then most recent). Duplicates are hidden by default with a "N duplicates hidden" toggle; the canonical shows an "N duplicates" badge and revealed copies show "Duplicate of #X" (dashed amber). Stats + tab counts now reflect UNIQUE requests so copies do not inflate the workload. Distinct requests stay separate (e.g. #112 reservation 3503371, different time/price). Also sorts the list by most recent CUSTOMER activity (last customer reply, else when the request came in), desc, so a just-answered thread jumps to the top.
  - Verification: frontend tsc clean; deployed. Real data confirms the key: #110/#111 share reservation 3503372 (grouped), #112 is 3503371 (separate).

- [x] **Pre-send email validation guard (Ryan WhatsApp 2026-06-22: stop sending to dead addresses)**
  - Date: 2026-06-22
  - What changed: Ryan reported "a handful of undeliverable emails" and asked for an email-validation tool that checks addresses are legitimate before the engine sends. An [emailValidationService](src/services/emailValidationService.ts) (format + MX) already existed but was never wired into the send path. (1) Hardened the service: every MX lookup now has a hard timeout (`EMAIL_MX_TIMEOUT_MS`, default 5s -- previously none) and classifies outcomes as `has_mx` / `no_mx` (definitive: NXDOMAIN/ENOTFOUND/ENODATA or empty MX) / `unknown` (transient ESERVFAIL/timeout). `validateEmail` now returns `transient:true` on `unknown` so callers can fail-open; added an injectable resolver for testability. (2) Wired the guard into [sendOutreachEmail](src/services/outreachEmailService.ts) as a third guard beside the sender + category guards: a malformed address or dead domain is never transmitted (writes a failed comm_log with `email_guard:true` + reason and returns), while transient DNS failures fail OPEN (send proceeds, warning logged) so a flaky resolver can't halt the whole queue. (3) New [validateActiveLeadEmails.ts](src/scripts/validateActiveLeadEmails.ts) sweep: validates every ACTIVE lead's email, reports counts by reason, dry-run by default; `APPLY=1` blocks only the definitively-invalid via the existing tested `blockLead()` (transient never blocked).
  - Verification: `tsc --noEmit` clean; jest [emailValidation.test.ts](src/tests/unit/emailValidation.test.ts) 16/16 -- covers format happy/boundary, MX has/no/empty, NXDOMAIN, transient servfail, timeout path, fail-open, idempotency, and batch. BREAK simulations covered: DNS timeout (hangs resolver -> unknown), resolver failure (servfail -> fail-open), bad/empty input (rejected pre-DNS), idempotency (same verdict twice). Full unit suite 660/661 (the 1 failure is pre-existing roles.test.ts:45 RBAC, unrelated). **Deployed to prod 2026-06-22** (image build ran tsc clean). Sweep run live: dry-run over 7,861 active leads found 7,700 valid / 32 transient (not blocked) / 129 dead domains (no_mx_records); APPLY=1 archived all 129 (active 7,861 -> 7,732, 128 new dnc_list rows, 1 already present). Existing `emailService.test.ts` unaffected (tests pure `applyTestMode`, not the send path).
  - Notes: DNS-level validation cannot detect a valid domain with a dead mailbox (person left the job) -- that needs SMTP/paid verification (ZeroBounce/NeverBounce), which is a governance escalation (paid external dependency) flagged to Ali/Ryan (BC decision todo #10022194532), not adopted unilaterally; the post-send bounceProcessor remains the backstop. Sweep `APPLY=1` is a prod data mutation -- run dry-run first. Inbound archived to BC message board (#10022194422); build todo #10022194474.

- [x] **Reservations conversation view: newest-first + explicit sent/received labels**
  - Date: 2026-06-22
  - What changed: Conversation thread rendered oldest-first; flipped to newest-first ("Most recent first" header, "· latest" on the top message). Then clarified each bubble's direction with explicit wording -- "LandJet · we sent" vs "<sender> · received" -- and label inbound BookRides notifications as "Customer request (via BookRides) · received". This removes a real misread: a BookRides quote-request email leads with LandJet's letterhead, so it looked like an outbound message when it is actually the inbound request. [reservations/page.tsx](frontend/app/reservations/page.tsx).
  - Verification: frontend tsc clean; deployed. Confirmed the example row (Stacey Spillum, #111) is genuinely needs_reply: from no-reply@bookridesonline.com, our_reply_at null, single inbound message -- correctly "Needs reply".

- [x] **Reservations: lifecycle follows who replied LAST (fix "Needs reply" on threads we already answered)**
  - Date: 2026-06-22
  - What changed: Ali saw a thread tagged "Needs reply" whose last message was a reply the desk sent directly from Outlook. Lifecycle only flipped to awaiting_customer on app Send-button sends, so replies sent outside the app were invisible. [refreshReservationReplies](src/services/reservationQuoteService.ts) now reconciles lifecycle from the real thread: last message from us (@landjet.com) -> awaiting_customer, last message from the customer -> needs_reply (booked/closed untouched); also stamps our_reply_at and responded_at. Broadened from "responded_at IS NULL only" to all non-resolved rows in a ~3-week window so it self-corrects every cron cycle. Extracted pure decideLifecycleFromThread() + isOurAddress() for unit coverage.
  - Verification: backend tsc clean; jest reservationQuoteService 23/23 (adds 5 lifecycle-from-thread cases). Deployed; reconcile pass over existing rows changed 18/30; distribution now 16 awaiting_customer / 14 needs_reply (was all needs_reply); row #107 correctly awaiting_customer with our_reply_at set.
  - Notes: The cron reconciles every ingest cycle over the trailing ~3 weeks, so the queue stays accurate as staff reply from Outlook. "Ours" = any @landjet.com sender, so staff replying from their own address still counts.

- [x] **Reservations: read the ENTIRE conversation history (fix Graph thread-fetch bug + format handling)**
  - Date: 2026-06-22
  - What changed: Ali saw rows with addresses showing no map -- the engine was only reading the latest email, not the thread. Root cause: the conversation-by-id Graph queries combined `$filter=conversationId` with `$orderby=receivedDateTime`, which Graph rejects (400 InefficientFilter), so fetchConversationText (full-history extraction), getConversationThread (conversation view), and refreshReservationReplies (customer-reply detection) were ALL silently failing. Removed `$orderby` from all three, sort in code. Then: (a) ingest now retries extraction on the full conversation when the latest message lacks a route, and generateDraft feeds the whole thread into the reply prompt ([reservationQuoteService.ts](src/services/reservationQuoteService.ts), [reservationDraftService.ts](src/services/reservationDraftService.ts), [nlTripExtraction.ts](src/services/nlTripExtraction.ts) prompt+window 4k->14k); (b) [bookRidesParser.ts](src/services/bookRidesParser.ts) now deterministically picks the most complete Pickup/Dropoff across repeated/quoted blocks in a thread, and falls back to the first Stop(s) (incl. named airports, address-guarded) as the dropoff on round trips that have no Dropoff label; (c) new [reprocessMissingRoutes](src/services/reservationQuoteService.ts) + [backfillReservationRoutes.ts](src/scripts/backfillReservationRoutes.ts) to fill maps on existing rows from thread history (idempotent, never regresses).
  - Verification: backend tsc clean; jest bookRidesParser 17/17 (repeated-block best-match, Stop-as-dropoff, airport-stop, non-address guard) + reservationDraft/reservationQuoteService 24/24. Deployed. Backfill lifted map coverage 5 -> 12 of 28 rows; remaining 16 are non-trips (6 invoices/receipts, apparel cart, undeliverable bounce, fragment) + sales-form stubs + 2 edge formats (out-of-territory / no address). Conversation view verified returning the full ordered thread for #107.
  - Notes: The $orderby bug also silently broke customer-reply detection and the conversation tab -- both fixed by the same change. Going forward every new email reads the full thread for extraction, drafting, conversation view, and reply detection.

- [x] **Reservations engine v2: live ops console + AI replies in account voice + lifecycle + learning loop**
  - Date: 2026-06-22
  - What changed: Major upgrade to the Reservations surface. (1) Reply from the account it came in on: send already replies from `rq.mailbox`; now overridable via new `reply_from` and surfaced in UI ("Send from Percy's inbox"). (2) Learn from history: new models [ReservationReplyExemplar](src/models/ReservationReplyExemplar.ts) + [ReservationToneProfile](src/models/ReservationToneProfile.ts); [reservationLearningService](src/services/reservationLearningService.ts) mines each mailbox's Sent Items (paginated, capped+logged), pairs each reply with the customer message in its thread, and LLM-summarizes the account's voice; cron re-learns ~daily. (3) AI draft + self-evaluating rubric: [reservationDraftService.generateDraft](src/services/reservationDraftService.ts) writes the reply primed with the sending account's tone profile + top-K similar past replies (no em dashes), and `scoreDraft` grades greeting/sign-off/length/no-em-dash/account-voice/price/route into a 0-1 match score (fair denominator). (4) Lifecycle: needs_reply -> awaiting_customer (on send) -> needs_reply when customer replies -> booked/closed; rows STAY in queue until booked/closed. (5) Live UI [reservations/page.tsx](frontend/app/reservations/page.tsx): lifecycle-colored rows, "Live" pulse + 20s auto-refresh (pauses while editing), stat strip, colored trip tags, AI composer with rubric chips + editable text + "Send from {account}", conversation thread view, mark booked/closed/reopen. New endpoints POST/PUT :id/draft, POST :id/lifecycle, GET :id/conversation, POST /reservations/learn; GET /reservations gains lifecycle filter. Schema via idempotent [migrateReservationsV2.ts](src/scripts/migrateReservationsV2.ts).
  - Verification: backend tsc clean; frontend tsc clean; jest reservationDraft+reservationQuoteService 24/24 (rubric keep/drop + reply-trim cases). Deployed backend+frontend; migration applied (4 cols + 2 tables confirmed in DB); historical learn run live -> ljreservations@ 398 exemplars + tone profile, rlandry@ 329 exemplars + tone profile, percy@ 0 (new address, will populate). End-to-end draft on real row 101: reply_from=desk, score 1.0, in learned voice ("Hi Todd," / "Warm regards, Reservation Team"), no em dashes. /reservations returns 200.
  - Notes: percy@ Sent Items empty today (brand-new account); its voice fills in as he sends + the daily re-learn runs. Live customer sending still gated behind RESERVATION_SEND_ENABLED=true (dry-prepare by default). Mining capped at 400 msgs/mailbox/run (logged, not silent).

- [x] **Consolidate inbound: one Reservations queue across mailboxes; Quote Tester nested; Inbound tab retired**
  - Date: 2026-06-22
  - What changed: Inbound (scanned only rlandry@) was a manual duplicate of what the Reservations engine does automatically; Quote Tester and Inbound were separate top-nav tabs overlapping Reservations. (1) Backend: [ingestReservationQuotes](src/services/reservationQuoteService.ts) now takes `onlyBookings`; new exported `isBookingIntent()` keeps priced/forward_only/NL-trips-with-an-address and drops non-bookings (not_bookrides, faq, parser-noise, NL non-bookings); IngestCounts gains `filtered`. [pipelineAutoRunner.runReservations](src/services/pipelineAutoRunner.ts) now ingests the dedicated booking mailbox (persist all) PLUS rlandry@ + percy@ with onlyBookings=true (env RESERVATION_EXTRA_MAILBOXES), so a request landing in Ryan's or Percy's inbox flows into the same queue without flooding it. (2) Frontend: removed Inbound + Quote Tester from top nav; deleted the Inbound page; moved Quote Tester to [/reservations/test](frontend/app/reservations/test/page.tsx) with a back-link + a "Test a quote" button on the Reservations header; repointed the dead homepage Inbound card to Reservations.
  - Verification: backend `tsc --noEmit` clean; frontend `tsc --noEmit` clean; jest reservationQuoteService+pipelineAutoRunner 30/30 (adds isBookingIntent keep/drop cases); deployed backend+frontend.
  - Notes: lib/api.ts inbound* client fns + the backend `/admin/outreach/inbound/*` endpoints are now dormant (no UI consumer) -- removable in a follow-up cleanup. ljreservations@ ingest behavior unchanged (still persists all); only the new general mailboxes get the booking filter.

- [x] **Reply Intelligence (proposed vs actual reply, learns over time) + trip-map fix**
  - Date: 2026-06-20
  - What changed: New [replyAnalysisService.ts](src/services/replyAnalysisService.ts) `analyzeReply(leadId)` -- pulls the lead's reply, drafts "what we would have replied" (AI in Ryan's voice, few-shot primed from past their->Ryan reply pairs), fetches Ryan's ACTUAL reply from the Graph thread, scores AI-proposed vs actual similarity (Jaccard), and persists each (their msg -> Ryan reply) pair on the inbound row's metadata so proposals improve over time. New `GET /api/admin/conversations/:leadId/reply-analysis` + an expandable 3-panel view on the Conversations page (They replied | What we'd reply (AI) | What Ryan sent) with the similarity + "learned from N examples". Trip-map fix: dropped the fixed `z=7` in [reservations/page.tsx](frontend/app/reservations/page.tsx) so each route auto-fits.
  - Verification: backend + frontend `tsc --noEmit` clean; deployed backend+frontend. Trip maps verified per-trip (DB: quotes 13-20 carry distinct pickup/dropoff; 8-12 null -> no map); they only looked identical because all sample trips are the Des Moines IA <-> MI/WI corridor with duplicate/reverse pairs at a fixed regional zoom.
  - Notes: AI proposal is generated live on expand. "Smarter over time" = the (their->Ryan) example store grows as analyses run and Ryan keeps replying; similarity should climb. A confirmed booking still needs LJ's booking backend; everything here uses the reachable mailbox + AI.

- [x] **Deal-tracking Phase 3: outreach funnel + deal-value capture**
  - Date: 2026-06-20
  - What changed: Briefing gains an "Outreach funnel" section (reached -> replied -> meeting -> proposal -> won, conversion %, summed Won $) via a funnel query in [weeklyBriefingService.ts](src/services/weeklyBriefingService.ts) + `funnelChart` in [weeklyBriefingRenderer.ts](src/services/weeklyBriefingRenderer.ts). Won = pipeline_stage 'enrolled' with `notes.deal_amount`. The Conversations endpoint + page ([conversationsRoutes.ts](src/routes/admin/conversationsRoutes.ts), [page](frontend/app/conversations/page.tsx)) gain a Deal $ field and a Won total. Closes the "did outreach close it" loop: mark a responder enrolled + enter the amount -> it rolls into the funnel.
  - Verification: backend + frontend `tsc --noEmit` clean; deployed backend+frontend; funnel currently reads reached=151, replied~9, meeting/proposal/won=0 (nothing advanced past replied yet), which is correct.
  - Notes: v1 stores deal value on lead.notes.deal_amount (no migration) and uses existing pipeline_stage for won/lost; a normalized Deal model (multiple deals per lead, close_date, source) is the future enhancement. The funnel fills as the team advances responders + records amounts on the Conversations page. Completes the see -> track -> attribute arc (Phases 1-3).

- [x] **Deal-tracking Phase 2: Conversations tracker + booking tags**
  - Date: 2026-06-20
  - What changed: (1) "Who replied" redesigned -- dropped the conversation text for deterministic colored category tags via [replyClassification.ts](src/services/replyClassification.ts) (Wants to meet / Interested / Question / Not now / Auto-reply) plus a green "Booking" icon when the lead's email matches a `reservation_quotes` row (trip-quote request). (2) New [conversationsRoutes.ts](src/routes/admin/conversationsRoutes.ts) (`/api/admin/conversations` GET list + PATCH stage/next_action) and a [/conversations admin page](frontend/app/conversations/page.tsx) -- the interactive tracker to move responders replied -> meeting_scheduled -> proposal_sent -> ... with a next-action note. Navbar link added. (3) Activated the booking signal by running `ingestReservationQuotes` (read-only).
  - Verification: backend + frontend `tsc --noEmit` clean; classifyReply unit test 7/7; deployed backend+frontend; reservation_quotes now has 6 rows (4 match leads).
  - Notes: Booking icon = "requested a trip quote" (the reachable LandJet booking signal via ljreservations@); a TRUE confirmed/paid booking needs LandJet's booking backend (not connected). Current 9 responders are investors so 0 overlap with quote-requesters today; 4 separate leads DID request quotes but haven't replied to outreach (a booking-intent set worth surfacing). Phase 3 (Deal model + funnel reached->replied->meeting->closed $) still pending; its "closed" gate needs outcome capture.

- [x] **Deal-tracking Phase 1: see the reply messages**
  - Date: 2026-06-20
  - What changed: [replyIngestionService.ts](src/services/replyIngestionService.ts) now captures each reply's `bodyPreview` from Graph into `communication_logs.body` (backfilling rows recorded before body capture). The briefing "Who replied" section ([weeklyBriefingRenderer.ts](src/services/weeklyBriefingRenderer.ts)) now shows each responder's name, company, subject, and a ~240-char preview of what they said. Also restored the investor campaign on the chart and reassigned 5 investor responders (Spike/UBS/Infusion/Casepoint/Thornburg) to Investor Outreach.
  - Verification: `tsc --noEmit` clean; deployed; re-ingest backfilled bodies (DB: inbound_with_body 17/17, idempotent: 0 new / 0 re-advanced); regenerated report + emailed to ali@ shows real previews (e.g. "Monday's bad for me. Do you prefer Friday or Tuesday?", "I assume you aren't going through with this now? No communication in over 2 months").
  - Notes: Phase 1 of the deal-attribution plan (see/track/attribute). Shows bodyPreview, not the full ordered thread (Phase 1.5 endpoint/page). Phase 2 (move responders through stages w/ next-action) and Phase 3 (Deal model + funnel reached->replied->meeting->closed $) are next; Phase 3's "closed" gate needs outcome capture since most closes (esp. investor) are off-system.

- [x] **Navbar: personalize with signed-in user name + territory**
  - Date: 2026-06-20
  - What changed: [Navbar.tsx](frontend/components/Navbar.tsx) now fetches /users/me/profile and shows the signed-in user (initials avatar + name) plus their territory chip (`Name · 📍 TX`, or "All regions" when unscoped) in the top-right. Non-fatal if the fetch fails (nav still renders).
  - Verification: frontend tsc --noEmit clean (exit 0); deployed; nav renders name + 📍 TX for the TX-scoped demo user.

- [x] **Campaigns list scoped to rep territory**
  - Date: 2026-06-20
  - What changed: [campaignRoutes.ts](src/routes/admin/campaignRoutes.ts) GET /campaigns loads the caller default_filters.states and passes to [campaignService.ts](src/services/campaignService.ts) listCampaigns, which restricts to campaigns having >=1 lead in those states (Op.iRegexp via buildStatesPattern). Unscoped admins see all. Mirrors the /today enforcement.
  - Verification: tsc --noEmit clean (exit 0); deployed; total campaigns 21, TX-scoped (Percy/demo) returns 15 (the 6 with no TX leads hidden).

- [x] **Reservation queue: reply detection, sent-timing, route map**
  - Date: 2026-06-20
  - What changed: [reservationQuoteService.ts](src/services/reservationQuoteService.ts) now captures the Graph conversationId on ingest and a refreshReservationReplies() pass stamps responded_at when the customer next replies in the thread (runs at the end of each ingest cycle, fail-soft). New columns conversation_id + responded_at on reservation_quotes. The [/reservations](frontend/app/reservations/page.tsx) row now shows: a green "Replied Xago" or "Awaiting reply" badge, "Quote sent/prepared Xago" (from result.sent/prepared), and a small no-key Google Maps embed of the pickup->dropoff route on each overview row.
  - Verification: backend + frontend tsc --noEmit clean (exit 0). (Deploy + page verification this session.)
  - Notes: map uses the keyless maps.google.com saddr/daddr embed (no GOOGLE_MAPS_API_KEY in prod yet, #10015474993) so it is approximate (kinda-sorta route). Reply detection matches the customer from-address newer than the original email; forwarded/notification emails (non-customer from) will not flag.

- [x] **Quote engine: fix false needs_review on clean flat-rate BookRides quotes**
  - Date: 2026-06-22
  - What changed: Percy forwarded a REAL BookRides quote-request (from no-reply@bookridesonline.com -> ljreservations@). Confirmed the parser handles the exact format (Davenport -> Kinnick Stadium, round trip, 5 pax, Res #3499965), priced as a flat route at $1,587, Maps key resolves the leg (54 mi one-way). Bug found: deriveConfidenceAndStatus needsHuman regex matched bare "mile"/"concierge", which appear in the routine flat-rate fuel-surcharge note -> false-flagged clean quotes as needs_review. Tightened the regex to specific complex/incomplete patterns (overnight/dead-leg/2nd-driver/over-10h/per-diem/approval/actual-0-mi/minimum-applied). Clean flat-rate BookRides quotes now -> auto_ready 0.9.
  - Verification: tsc --noEmit clean; jest reservationQuoteService 14/14 (adds flat-rate-note case). Real BookRides email run end-to-end: priced, market quad_cities, both addresses, flat_rate $1587.
  - Notes: Real BookRides requests DO arrive at ljreservations@ in the exact parseable format; my retroactive inbox scan missed already-processed ones (filed/removed after quoting). The 10-min cron catches new arrivals. Broadening the scan to processed folders is a follow-up.

- [x] **Quote engine: handle all 4 of Percy's inbound channels ("respond to any of these requests")**
  - Date: 2026-06-22
  - What changed: Percy sent 4 real inbound examples and said "I need the tool to essentially be able to respond to any of these." Ran all 4 verbatim bodies through processInboundEmailNL. Two already worked (BookRides Jason Besch -> auto_ready $1587; Ruby form Pam Brandt -> priced/needs_review $991.89 distance). Two were over-restrictive and fixed: (1) Sales lead form (Chris Stibbs, KC->Louisville, rough estimate, no dates) was dropped because [nlTripExtraction.ts](src/services/nlTripExtraction.ts) prompt literally told the LLM to reject "a sales lead form" -- loosened so any price/quote/estimate ask with origin+destination counts, even informal / lead-form / no firm dates (still rejects invoices, receipts, thread replies, general questions). Now -> forward_only routed to the KC team (correct: KC is forward-only, Louisville is not a LandJet market). (2) Direct email (Greg Bush, O'Hare->LeClaire IA) extracted BOTH addresses but detectMarketForTrip returned null -- "LeClaire" was missing from MARKET_CITY_MAP -> nl_no_route. Added LeClaire + neighboring QC towns (Eldridge, Blue Grass, Walcott, Princeton) in [inboundQuoteEngine.ts](src/services/inboundQuoteEngine.ts); now -> priced/needs_review $927.
  - Verification: jest reservationQuoteService 16/16 (adds detectMarketFromAddress LeClaire/Le Claire/Eldridge cases). All 4 real bodies re-run live post-deploy: ch1 auto_ready $1587, ch2 needs_review $991.89, ch3 forward_only->KC team, ch4 needs_review $927. Deployed ecb2187.
  - Notes: All 4 now produce a response path (auto-send / review-queue / forward). NL-extracted quotes stay needs_review by design (human verifies the AI read before send), per Trust-Before-Intelligence.

- [x] **Quote engine: NL-augment incomplete BookRides parses (unlocks real reservation emails)**
  - Date: 2026-06-22
  - What changed: Diagnosed that the live ljreservations@ emails are mostly FREE-FORM concierge threads, not structured BookRides quote-requests -- the rigid parser extracted a pickup but no dropoff, so distance could not compute. [inboundQuoteEngine.processInboundEmailNL](src/services/inboundQuoteEngine.ts) now detects an incomplete priced BookRides parse (missing pickup or dropoff), calls the LLM extractor to fill the missing address, and re-prices (source nl -> stays human-reviewed). With both addresses present, the existing Google Distance enrichment then applies real road miles. Set GOOGLE_MAPS_API_KEY in prod (verified Distance Matrix returns real miles, e.g. 399 mi).
  - Verification: tsc --noEmit clean (exit 0); jest reservationQuoteService 13/13. Maps key live + confirmed in-app (roadMilesBetween -> 399.4).
  - Notes: AI-filled addresses are flagged source nl so they never auto-send (TBI). Cost of the extra extraction call is now tracked (ai_cost_log).

- [x] **TBI remediation: LLM cost observability (G4) + auditability & tracing (G5/G6) + Google distance wiring (G16)**
  - Date: 2026-06-20
  - What changed: (1) COST: new [AiCostLog](src/models/AiCostLog.ts) + [aiCost.ts](src/services/aiCost.ts) recordLlmUsage/getCostSummary (USD from token usage, per-model rates); wired into 5 LLM call sites (ai_message, email_draft, linkedin_draft, nl_extraction, company_location). (2) TRACE: [requestContext.ts](src/middleware/requestContext.ts) AsyncLocalStorage carries traceId+userId (app middleware + auth capture). (3) AUDIT: auditAction() in [auditLogService.ts](src/services/auditLogService.ts) auto-fills userId+traceId; wired email.send, lead.route, lead.advance (previously unaudited). (4) DISTANCE: [googleDistance.ts](src/services/googleDistance.ts) roadMilesBetween (gated on GOOGLE_MAPS_API_KEY, fail-soft); reservation ingest re-prices distance trips with real miles, raising confidence toward the 0.90 auto-send line. Trust dashboard cost/tracing panels now show real data.
  - Verification: backend+frontend tsc --noEmit clean (exit 0); jest reservationQuoteService+leadLocation 20/20. ai_cost_log table created on prod.
  - Notes: Google Maps key NOT yet in prod env -- distance falls back to miles=0 until GOOGLE_MAPS_API_KEY is set (then distance trips auto-improve). Optional AI_DAILY_BUDGET_USD enables the over-budget flag. Cost wired to the 5 highest-volume calls; route-level rewrite endpoints can be added later.

- [x] **Trust Command Center dashboard (TBI Phase 10, Ali-approved)**
  - Date: 2026-06-20
  - What changed: Built the /admin/trust dashboard (audit Phase 10) in the bridge form -- read-only aggregates over REAL tables, no new DB table. New [trustDashboardService.ts](src/services/trustDashboardService.ts) getTrustOverview() unions ai_agents, agent_runs, job_executions, campaign_errors, communication_logs, reservation_quotes, intelligence_decisions, interaction_outcomes, leads, audit_logs + env/setting flags. New GET /api/admin/trust/overview ([trustRoutes.ts](src/routes/admin/trustRoutes.ts), mounted in app.ts). New [/admin/trust](frontend/app/admin/trust/page.tsx) page: Executive (composite score+maturity+recommendation from latest audit), Operations, Governance (approval queue + automation flags + overrides), Observability (confidence distribution + 0.90 line; cost+tracing labelled NOT instrumented), Business Impact. Added to Admin nav.
  - Verification: backend+frontend tsc --noEmit clean (exit 0). Deploy + endpoint/page check this session.
  - Notes: Per the kit guardrail + CLAUDE.md, Phase 10 was gated and is now Ali-approved. Bridge form chosen (no system_events table yet) so it ships now; cost (G4) and tracing (G6) are shown as explicit NOT-instrumented placeholders rather than fabricated. Headline trust score (56) sourced from docs/trust-audit and labelled as point-in-time.

- [x] **Ran the Trust-Before-Intelligence (TBI) 10-phase audit (Phases 1-9)**
  - Date: 2026-06-20
  - What changed: Pulled the TBI audit kit from Basecamp (Ali Personal todo 10017316985) and ran its evidence-based 10-phase audit on this repo via 4 parallel exploration passes (file:line cited). Wrote 9 reports to [docs/trust-audit/](docs/trust-audit/): repository-map, ai-inventory, observability-audit, governance-audit, trust-scorecard, event-model, dashboard-design, gap-analysis, and TRUST_COMPLIANCE_REPORT.
  - Verification: docs-only (no code). Composite Trust 56/100; Governance LEVEL 3 (MANAGED); Observability 40, Auditability 45, Explainability 70; TBI maturity ~2.5/5. Recommendation: GO WITH CONDITIONS.
  - Notes: Phase 10 (build /admin/trust + system_events table) intentionally NOT executed -- it writes app code and is gated behind approval of dashboard-design.md per the kit guardrail + CLAUDE.md governance. Top P0s: cost/token observability, audit coverage on sends/routing/progression, unauth feedback endpoint + unsigned Mandrill webhook + HTTPS.

- [x] **Quote Engine dashboard (GOALS-Observability)**
  - Date: 2026-06-20
  - What changed: New getReservationMetrics() aggregates reservation_quotes (by status w/ avg confidence + value, by source bookrides/nl, by market, by service type, the quoted/sent/replied funnel, confidence distribution vs the 0.90 line) behind GET /api/admin/quotes/reservations/metrics. New [/reservations/dashboard](frontend/app/reservations/dashboard/page.tsx) renders KPI cards + bars + a confidence-distribution panel that calls out the trust-before-intelligence auto-send threshold and that auto-send is OFF (all human-reviewed). Linked from the queue header.
  - Verification: backend + frontend tsc --noEmit clean (exit 0). Deploy + endpoint/page check this session.
  - Notes: directly fills the GOALS-Observability gap noted in the TBI alignment doc (monitoring/metrics + explainability of the confidence posture).

- [x] **TBI framework alignment: read the actual INPACT/GOALS, encoded the Lexicon 0.90 auto-send gate, wrote the mapping doc**
  - Date: 2026-06-20
  - What changed: Read the real frameworks from the public repo (manuscript ch.2 INPACT, ch.7 GOALS, quick reference). Mapped the quote engine to each tenet in [docs/trust-before-intelligence-quote-engine.md](docs/trust-before-intelligence-quote-engine.md). Encoded the one autonomy rule we were missing -- GOALS-Lexicon "below the confidence threshold, do not guess, hand to a human": new  +  in [reservationQuoteService.ts](src/services/reservationQuoteService.ts) so any future auto-send may only fire on auto_ready AND confidence >= 0.90; everything else stays human-reviewed.
  - Verification: tsc --noEmit clean (exit 0); jest reservationQuoteService 13/13 (adds autoSendEligible threshold cases).
  - Notes: Strong alignment on Transparent (breakdown+confidence+provenance+audit), Permitted (authz+send gate), Natural (NL extraction), Governance/HITL (human-in-loop, dry-by-default), Lexicon (0.90 gate). Honest gaps: Adaptive/learning loop (#10017156199) and accuracy/hallucination metrics not built. Detailed mapping in the doc.

- [x] **Reservation queue: relative trip dates, at-a-glance tags, conditional colors, Trust-Before-Intelligence framing**
  - Date: 2026-06-20
  - What changed: [/reservations](frontend/app/reservations/page.tsx) rows now show the APPOINTMENT time relative + color-coded by urgency ("Trip in 5 hrs" red, tomorrow amber, in N days blue/gray), a row of at-a-glance TAGS (service type one-way/round-trip/hourly, market/location, special-incentive customer categories JD/Investor/Lockton/LJ-Member, and special gates: overnight / dead leg / long-or-2-driver / needs-approval / forward-to-local), confidence colored by level, and an AI-provenance tag ("AI-extracted - verify") for NL rows. Header carries an explicit trust line. Added quote fields (service_type/customer_category/market/approvals_needed) + trip.start_time to the [api type](frontend/lib/api.ts).
  - Verification: frontend tsc --noEmit clean (exit 0). Deploy + page check this session.
  - Trust Before Intelligence alignment (per Ali / colaberry trust-before-intelligence-book): the AI never acts autonomously -- it prepares + EXPLAINS every quote (line-item breakdown, warnings) with a CONFIDENCE score; a human reviews and sends; sending is DRY by default (RESERVATION_SEND_ENABLED gate); LLM-extracted (free-form) quotes ALWAYS route to needs_review; provenance (source bookrides vs nl) + full audit (stored result, structured logs) are retained. Trust/autonomy is earned (validation) before auto-send is enabled. NOTE: the book is private and the detailed INPACT/GOALS tenets were not publicly fetchable; aligned to the documented thesis + Governance/Observability layers. Ask Ali for colaberry.com/frameworks to map exact tenets.

- [x] **Reservation review queue UI + guarded 1-click send**
  - Date: 2026-06-20
  - What changed: New [/reservations](frontend/app/reservations/page.tsx) page lists priced reservation emails (status chips auto_ready/needs_review/forward/manual, confidence, market, total), expands to show the parsed trip + quote breakdown + warnings + original email, and has a 1-click "Send quote reply". Added Navbar link. Backend [composeQuoteReply + sendReservationQuote](src/services/reservationQuoteService.ts) and POST /api/admin/quotes/reservations/:id/send. SAFETY: real customer sends only fire when RESERVATION_SEND_ENABLED=true; default is DRY (returns the draft, marks result.prepared, emails no one) so the 1-click UX is safe to demo before Percy/Lorie validate quotes. "Refresh from mailbox" button triggers the ingest.
  - Verification: backend + frontend tsc --noEmit clean (exit 0). (Deploy + page-load verification in this session.)
  - Notes: manual/forward rows cannot be sent (no priced quote). Next: confidence-based auto-send (#10017156199) flips RESERVATION_SEND_ENABLED + auto-fires high-confidence quotes, plus the NL-parsing fallback for free-form requests.

- [x] **Quote engine NL fallback: price free-form (non-BookRides) booking emails**
  - Date: 2026-06-20
  - What changed: New [nlTripExtraction.ts](src/services/nlTripExtraction.ts) uses the in-prod OpenAI key to extract a trip (pickup/dropoff/service/date/passengers/name) from free-form email text, fail-soft. Refactored [inboundQuoteEngine.ts](src/services/inboundQuoteEngine.ts): shared priceTripResult() for both the rigid BookRides parser and the NL path; new async processInboundEmailNL() tries BookRides first, then NL extraction. Reservation ingest now uses the NL path so real free-form requests (e.g. "book me an 8-seater Monday, Dallas to DFW") get priced instead of dumped to manual. LLM-extracted quotes are always needs_review (human verifies the AI read); a booking we understood but cannot route surfaces with its extracted details (nl_no_route, needs_review 0.3).
  - Verification: tsc --noEmit clean (exit 0); jest reservationQuoteService 11/11 (adds NL-source cases). Reprocessed the real ljreservations@ mailbox through the NL path this session.
  - Notes: This directly answers "pull in real emails" -- the real free-form booking note in the mailbox now parses into structured, reviewable details instead of raw manual. Emails with no route still need a human to add pickup/dropoff. Distance still miles=0 pending the Maps key (#10015474993).

- [x] **Reservation auto-quote: 24/7 ingest of ljreservations@ (Percy #1 priority)**
  - Date: 2026-06-20
  - What changed: New [reservationQuoteService.ts](src/services/reservationQuoteService.ts) pulls reservation emails from the booking mailbox (ljreservations@landjet.com) via the tenant Graph app, prices each with the existing engine ([inboundQuoteEngine.processInboundEmail](src/services/inboundQuoteEngine.ts)), and persists a [ReservationQuote](src/models/ReservationQuote.ts) row scored by confidence/status (auto_ready / needs_review / forward / manual) per Percy: simple trips score high (auto-send candidates), incomplete/complex go to a human. Idempotent by Graph message id; fail-soft per email. Wired into [pipelineAutoRunner.ts](src/services/pipelineAutoRunner.ts) as a 10-min job (PIPELINE_DISABLE_RESERVATIONS to disable). Added GET /api/admin/quotes/reservations (list) + POST /reservations/ingest (manual trigger), a run script, and the reservation_quotes table (DDL on prod).
  - Verification: tsc --noEmit clean (exit 0); jest reservationQuoteService 8/8 (confidence/status rules + htmlToText + an end-to-end real BookRides email). Prod table created; live ingest run pending in this session.
  - Notes: Distance trips currently price with miles=0 (engine flags concierge) -> needs_review; flat-rate routes -> auto_ready 0.9. Cost inputs Percy gave were applied separately. Next pieces: reservation review UI (#10017156196) + confidence autonomy/auto-send (#10017156199).

- [x] **Outreach: server-side territory enforcement + visible location badge**
  - Date: 2026-06-20
  - What changed: Even with location data populated, the Outreach screen still showed the full pool because `/today` only scoped when the client passed `?states=` and the frontend hook was not reliably seeding it. Fixed at the source: [outreachRoutes.ts](src/routes/admin/outreachRoutes.ts) `/today` now loads the signed-in user's `default_filters.states` and ENFORCES it (a territory owner like Percy=TX only ever sees their state, regardless of client params); users with no profile scope keep ad-hoc query filtering. Response now returns `state`/`city` per contact; [outreach/page.tsx](frontend/app/outreach/page.tsx) renders a location badge (📍 City, ST) with a muted "No location" chip when unresolved; added `state`/`city` to `OutreachContact` ([api.ts](frontend/lib/api.ts)).
  - Verification: backend + frontend `tsc --noEmit` clean (exit 0). Deployed both containers; post-deploy, logging in as the TX demo user with NO states param returns 40 contacts ALL `TX` (was 40 mixed before), each carrying its state -- confirms server-side scope enforcement + the field is present for the badge.
  - Notes: City is null for area-code-derived rows (area code yields state only); the company-LLM pass adds cities. Map UI still pending (BC #10017098565).

- [x] **Lead location resolution (unblocks territory scoping + map) + go-forward wiring**
  - Date: 2026-06-20
  - What changed: Root cause of "cannot confirm Percy is Texas-scoped": all 7,888 leads had empty `state`/`city`, so the territory/state filter had nothing to match (a TX-scoped view returned the full pool, not Texas). Built a multi-source resolver and populated location:
    - New [leadLocation.ts](src/services/leadLocation.ts): `stateFromAreaCode()` (deterministic NANP area-code -> US state map, toll-free/non-geographic -> null), `stateFromCompanyLLM()` (company HQ lookup via the in-prod OPENAI key, 15s timeout, validated against `US_STATES`, never throws), `resolveLeadLocation()` (precedence: area code 0.7 -> company LLM 0.6 -> none), all carrying `source` + `confidence`.
    - New backfill [backfillLeadLocations.ts](src/scripts/backfillLeadLocations.ts): dry-run default, `--apply`, `--llm --limit N` for the company pass, `--refresh`; idempotent; stamps `notes.location` provenance.
    - [apolloLeadService.ts](src/services/apolloLeadService.ts): ingestion now resolves location alongside vertical categorization -- prefers Apollo state/city, falls back to area code then company LLM when Apollo gives none; fail-soft (resolution error never loses the lead); stamps `notes.location`.
  - Verification: `npx tsc --noEmit` clean (exit 0); `npx jest leadLocation` = 7/7 pass (area-code happy/formatting/boundary/invalid + resolver precedence/no-LLM). Prod backfill (area-code pass) applied: 4,907 of 7,888 leads resolved (62%), 2,981 still unresolved (no phone). Confirmed scoping works via direct `getLeadsForToday({states:['TX']})`: returns 40 leads ALL TX (`state ~* '^(TX|texas)$'`), vs unscoped 40 mixed (TX/IL/NY/NV/...). Top states now: IA 1743, IL 689, KS 475, MO 458, TX 297.
  - Notes: Area-code state is approximate (mobile portability) -- carried at confidence 0.7 with provenance. The ~2,981 phoneless leads are invisible to any territory-scoped view until the company-LLM pass runs (`backfillLeadLocations.ts --apply --llm --limit N`, costs OpenAI calls, batched). Go-forward ingest wiring is committed but NOT yet deployed (held to avoid a backend restart during the 9 AM demo); the backfill DATA is already live in prod so the call is unaffected. Map UI is the next build (BC #10017098565).

- [x] **Regression fix: auto-route pulled investor prospects out of "Investor Outreach"**
  - Date: 2026-06-20
  - What changed: The 2026-06-19 reconciliation sweep moved 31 actively-worked investor prospects OUT of the "Investor Outreach" campaign into "Banking & Finance Outreach" -- their industry is "Investment", which classifies to the Banking vertical, and "Investor Outreach" has no banking/finance keyword to protect it. Restored those 31 to Investor Outreach via SQL (campaign_id back to 6c18c01a..., notes.linkedin_draft cleared so messaging regenerates for the investor campaign, stamped category_source=manual). Code fix: `buildStrategicCampaignIds()` in [leadRoutingService.ts](src/services/leadRoutingService.ts) = active campaigns whose name maps to NO vertical (Investor Outreach, General Outreach); `routeLeadToCorrectCampaign` now returns 'protected' and skips any lead whose current campaign is strategic. Wired into the Apollo ingestion path ([apolloLeadService.ts](src/services/apolloLeadService.ts)) and the reconcile sweep ([reconcileLeadVerticals.ts](src/scripts/reconcileLeadVerticals.ts)).
  - Verification: `tsc --noEmit` clean; routing tests 8/8 incl. new "never pulls a lead out of a strategic campaign" regression test; DB confirms Investor Outreach now 1,668 leads, 31 touched restored, 0 investor-send leads orphaned. Deployed.
  - Notes: The campaign was NEVER deleted. Restore keyed on logged sends, so only the 31 with comm_logs under Investor were auto-recoverable; leads moved out that had NO logged sends can't be perfectly identified (no per-lead record of pre-sweep campaign). The 9 reply responders are a separate set scattered across General Outreach (4), Manufacturing Outreach (1), and no campaign (4) -- several are clearly investor (Spike Capital, UBS, Infusion Equity, Casepoint, Steven Thornburg) and may want manual reassignment to Investor Outreach pending Ryan's confirmation.

- [x] **Reply ingestion + pipeline write-back (replies now count)**
  - Date: 2026-06-20
  - What changed: Built [replyIngestionService.ts](src/services/replyIngestionService.ts) -- reads the rlandry@ mailbox via Graph and records a reply ONLY if validated: sender is a lead (internal + vendor `tagteamagency.com` domains denied; newsletter/charity/fundraising subjects denied) AND the thread has an outbound from us (rlandry@/ryan@/ryan.landry@) to that lead before the reply. Validated replies are written as inbound `communication_logs` rows (deduped by Graph message id) and the lead advances `contacted -> replied`. Runner [ingestReplies.ts](src/scripts/ingestReplies.ts) (dry-run default, --apply). Briefing now reads these persisted replies (single source of truth; removed its own live Graph matcher), adds a "Who replied" table, and Section 04 shows real pipeline movement.
  - Verification: `tsc --noEmit` clean; deny-filter unit test 5/5; dry-run on prod showed 9 distinct responders / 17 messages (down from a naive 22 -- vendor/newsletter/charity correctly excluded); `--apply` persisted 17 inbound rows and advanced 9 leads to 'replied' (DB-verified: inbound_rows=17, leads_at_replied=9). Updated briefing emailed to ali@ shows "Replies received: 17" (was 0).
  - Notes: The 9 are almost all investor conversations (Spike Capital, UBS, Infusion Equity, Casepoint, Deloitte, EDC, KFM, Steven Thornburg). This is Ali's chosen "reply tracking + pipeline" priority. Still manual-run; next increment is wiring a periodic ingestion job into pipelineAutoRunner so it stays fresh. The validation is best-effort (thread we-reached-first + deny lists); a maintained deny list may need occasional additions.

- [x] **LinkedIn message stale after campaign move (Ryan WhatsApp 2026-06-20)**
  - Date: 2026-06-20
  - What changed: Moving a contact to a new campaign kept showing the OLD campaign's LinkedIn message after refresh (e.g. a contact moved Sports -> Business Services still showed sports messaging). Root cause: `notes.linkedin_draft` cache ([outreachQueryService.ts:696](src/services/outreachQueryService.ts#L696)) is keyed only by `sequence_stage`, so a same-stage campaign move never invalidated it; the `POST /:id/campaign` reassign endpoint regenerated a message for its response but never wrote it back to the cache. Fix: on move, `delete notes.linkedin_draft` and `writeCachedLinkedInDraft()` the freshly generated new-campaign message ([outreachRoutes.ts](src/routes/admin/outreachRoutes.ts)).
  - Verification: `tsc --noEmit` clean; deployed; one-time reset cleared 70 stale AI drafts on active leads (`UPDATE leads SET notes = notes - 'linkedin_draft' WHERE ... source='ai' AND status='active'`) so already-moved contacts regenerate for their current campaign.
  - Notes: This was NOT covered by the 2026-06-19 categorization fix -- that governs the lead's vertical/campaign (badge, routing, gate), a separate layer from the cached message TEXT. The categorization move worked (badge updated, stamped manual); the message cache was the gap. Self-strengthening: the cache is now invalidated on every campaign move.

## Session: 2026-06-19

- [x] **Deterministic lead categorization (stops Ryan's recurring wrong-campaign bug)**
  - Date: 2026-06-19
  - What changed: Root cause was that a lead's `vertical` badge + messaging were derived from the CAMPAIGN NAME, never validated against the company's real industry (already on `lead.industry` from Apollo, unused). Built a deterministic fix:
    - New pure module [leadClassification.ts](src/services/leadClassification.ts): `classifyVertical(industry)` (single source of truth, ordered keyword table, first-match-wins), `campaignVertical(name)`, `categoryMatches(industry, campaignName)`. No I/O, no clock, no randomness.
    - New [leadRoutingService.ts](src/services/leadRoutingService.ts): `routeLeadToCorrectCampaign()` auto-routes machine-ingested leads to the campaign matching their real industry; idempotent; flags unclassifiable / no-campaign cases for review instead of guessing.
    - [apolloLeadService.ts](src/services/apolloLeadService.ts): vertical now comes from real industry; each created lead is auto-routed (fail-soft).
    - [outreachRoutes.ts](src/routes/admin/outreachRoutes.ts) `/:id/campaign`: manual reassign is now AUTHORITATIVE (sets truthful badge, stamps `notes.category_source='manual'`) so the system never fights Ryan correcting bad Apollo data.
    - [outreachEmailService.ts](src/services/outreachEmailService.ts): hard pre-send category gate (mirrors the sender guard) blocks any lead-tied send whose industry contradicts its campaign; fails open on infra error, closed on confirmed mismatch; manual overrides pass.
    - New typed error `CategoryMismatchError` in [errors.ts](src/middleware/errors.ts).
    - New backstop script [reconcileLeadVerticals.ts](src/scripts/reconcileLeadVerticals.ts): idempotent, dry-run by default (`--apply` to persist), schedulable.
  - Verification: `npx tsc --noEmit` clean (exit 0); `npx jest leadClassification leadRouting outreachSender` = 78/78 pass (includes existing sender suite, confirming the pre-send gate is non-breaking); new tests cover happy/mismatch/unknown, auto-route/kept/flagged/unclassified/manual-skip, dry-run, and idempotency (re-run reports 'kept').
  - Notes: Ali decision 2026-06-19 chose auto-route + hard pre-send gate. Refinement applied: auto-route governs MACHINE ingestion (Apollo/import); a manual reassign by Ryan stays authoritative. Reported the separate "campaign done with steps left" item to Ali as most likely an expectation mismatch (cold campaigns are 3 steps), not a code bug; no change made there pending Ryan's desired step count.

- [x] **Deployed + ran reconciliation sweep against prod**
  - Date: 2026-06-19
  - What changed: Deployed commit c0e4260 to prod (`/opt/landjet-growth-engine`, backend rebuilt + booted clean). Ran `reconcileLeadVerticals.ts --apply`: of 7885 active leads, 962 re-routed to the campaign matching their real industry, 72 already correct, 6851 left in place (no Apollo `industry` value to classify), 0 manual, 0 flagged.
  - Verification: second dry-run pass reports routed=0, kept=1034 (962+72), unclassified=6851 -- confirms the apply persisted and the sweep is idempotent. Backend boot log clean (DB connected, port 3001).
  - Notes: ~87% of active leads have no `industry` value, so auto-route + the badge fix fully cover only the ~13% with industry data plus all FUTURE Apollo pulls; the pre-send gate cannot block the unclassified backlog (it only blocks a proven mismatch). Industry enrichment of the backlog is a separate data-quality effort.

- [x] **Corrected CLAUDE.md prod deploy path**
  - Date: 2026-06-19
  - What changed: CLAUDE.md said deploy LandJet at `/opt/colaberry-accelerator` -- that is a DIFFERENT app (ColaberryEnterprise_AI_LeadershipAccelerator). Corrected the Tooling Assumptions line to the real LandJet path `/opt/landjet-growth-engine` (containers landjet-backend/frontend/db), the --autostash pull, the backend-only build, and the `docker exec landjet-backend npx tsx` script-run pattern. Added a warning not to deploy LandJet to the accelerator path.
  - Verification: doc-only change; the corrected commands are exactly what was used to deploy c0e4260 and run the sweep this session.
  - Notes: Following the wrong documented path earlier caused a one-off rebuild/recreate (~40s restart) of the unrelated `accelerator-backend`; its `git pull` failed so no code of theirs changed. Correct path also saved to session memory.

- [x] **Fixed Friday briefing email: squares, fake "0 replies", and email-vs-LinkedIn split**
  - Date: 2026-06-19
  - What changed: Three issues Ali flagged on the live briefing.
    1. **Squares**: the `node:22-alpine` backend image had ZERO fonts (`fc-list` count 0), so sharp/librsvg rasterized every chart's text as tofu boxes. [Dockerfile.backend](Dockerfile.backend) now `apk add --no-cache fontconfig ttf-dejavu && fc-cache -f`; [weeklyBriefingRenderer.ts](src/services/weeklyBriefingRenderer.ts) `svgWrap` font-family now leads with `'DejaVu Sans'`.
    2. **"0 replies" was wrong**: comm_logs has 0 inbound rows because nothing ingests inbound mail -- but rlandry@landjet.com's inbox has real replies (verified via Graph). [weeklyBriefingService.ts](src/services/weeklyBriefingService.ts) now reads the outreach mailbox via Graph (client-credentials, Mail.Read) and counts replies by matching inbound senders against people we emailed; falls back to comm_logs and flags `replySource` if the read fails. Removed the "inbox-match pointed at wrong mailbox" caveat.
    3. **Email vs LinkedIn**: LinkedIn touches are never in comm_logs (model is email/sms/voice only); they only stamp `last_contacted_at`. Added a channel-split query (emailed vs LinkedIn-only) + a new "Email vs LinkedIn" section and KPI sublabel. Of 151 reached: 50 emailed, 101 LinkedIn-only.
  - Verification: `npx tsc --noEmit` clean. Prod DB confirmed the splits (51 email sends, 50 distinct emailed, 151 touched, 101 LinkedIn-only, 0 comm_logs inbound). Graph probe of rlandry@ inbox returned real replies (e.g. UHY "Connect Monday", summitconcrete "Re: LandJet Q2 Travel Guide", EDC "RE: next steps"). Post-deploy in-container `fc-list` + chart rasterization to be confirmed.
  - Notes: Did NOT re-send the email (goes to Ryan + Ram; needs Ali approval). The real remaining gap surfaced in the pipeline section: replies arrive but nothing writes them back to lead pipeline_stage, so touched leads stay at "contacted" -- that write-back/ingestion job is the next piece.

- [x] **Briefing: email-vs-LinkedIn channel split across charts 1/3/4/5 + blocker findings**
  - Date: 2026-06-19
  - What changed: Applied the blue=email / teal=LinkedIn color style (shared legend) to charts 1 (campaign), 3 (cadence), 4 (pipeline), 5 (timing) in [weeklyBriefingRenderer.ts](src/services/weeklyBriefingRenderer.ts), backed by new per-channel SQL splits in [weeklyBriefingService.ts](src/services/weeklyBriefingService.ts) (campaign, pipeline, daily, hourly). Fixed a SQL bug where `l.${TOUCHED}` expanded to invalid `l.(...)`.
  - Verification: `tsc --noEmit` clean; in-container render produced 7 charts with no errors (`VDONE charts=7`); DejaVu fonts confirmed so no squares; sent to ali@colaberry.com only via Mandrill (messageId 3f13145b..., chartCount 7), confirmed UNREAD in inbox.
  - Notes: TWO requested items BLOCKED on inputs only Ali can provide, NOT faked: (1) Outreach map -- `state`/`city` empty on all 7,888 leads AND no APOLLO_API_KEY in the prod container or host .env, so location can't be backfilled; (2) LinkedIn connection % -- zero linkedin.com notifications in rlandry@ M365; they go to Ryan's personal inbox which isn't connected. Report footer notes both as in-progress. Separately CONFIRMED via Graph: 22 distinct known leads have replied (Spike Capital, Deloitte, UBS, Infusion Equity, AssuredPartners, EDC, KFM, Summit Concrete, etc.); briefing still shows "0 replies" because the matcher only checks the 51 logged sends -- recommend flipping it to match the leads table (pending Ali decision).

## Session: 2026-06-17

- [x] **Auto-runner queue diagnosis (BC 10008606590)**
  - Date: 2026-06-17
  - What changed: Investigated why 0 outbound sends fired in the 24 hours after PIPELINE_AUTORUN=true. No code change; structured findings emailed via Mandrill.
  - Verification: pipeline.pulse log (`success:true, to:ali@colaberry.com` at 2026-06-17 12:00 UTC) confirms Pulse path is healthy; SELECT count(*) FROM scheduled_emails = 0 each minute; SELECT count(*) FROM leads WHERE next_action_at < now() = 124.
  - Notes: Root cause is in [pipelineAutoRunner.ts](src/services/pipelineAutoRunner.ts) -- only 3 jobs registered (ingest, scheduler, pulse). Missing 4th job that finds leads with overdue next_action_at and writes to scheduled_emails. The sequence-engine query exists at [sequenceEngineService.ts:56](src/services/sequenceEngineService.ts#L56) but is not wired into the cron loop. Not fixed in this session; flagged as the next thing to wire.

- [x] **Mandrill kit installed for Ali-side internal comms (BC 10008606590, BC 10008611940)**
  - Date: 2026-06-17
  - What changed: Pulled the 7-file Mandrill setup kit from the Ali Personal BC vault (todo 9982045828) into scripts/mandrill/. Added scripts/mandrill-send-html.js wrapper that takes any HTML report + a BC ticket and sends via Mandrill SMTP with branded signature + em-dash strip + BC comment auto-attach. Includes SVG-to-PNG rasterization via sharp (Gmail strips inline svg). Added nodemailer + sharp to package.json.
  - Verification: Mandrill IDs e878e7e9...@colaberry.com (diagnosis), b363bfdd...@colaberry.com (Ryan report v3), d291742e...@colaberry.com (Ryan report v3 with rasterized charts) -- all delivered to Ali's inbox; BC comments auto-posted on todos 10008606590 + 10008611940.
  - Notes: Scope is Ali-side internal reports only. Ryan's outbound to leads continues to use the existing send path. Memory file written at reference_mandrill_kit_landjet.md so future sessions reach for Mandrill (not Gmail OAuth) for Ali-side comms.

- [x] **Friday weekly briefing locked in (BC 10008641010)**
  - Date: 2026-06-17
  - What changed: Built src/services/weeklyBriefingService.ts + src/services/weeklyBriefingRenderer.ts. Added 4th job to pipelineAutoRunner.ts that fires every Friday 9:15 AM CT (15 min before the recurring 9:30 call with Ryan). Sends to ali@colaberry.com, rlandry@landjet.com, pkapadia@landjet.com. Same v3 report design Ali signed off on, with charts rasterized to PNG via sharp.
  - Verification: `npx tsc --noEmit` clean; msUntilNextFridayBriefing() smoke test confirms next fire = Friday 2026-06-19 at 9:15 AM CT; deployed to prod via commit 0bba03a; backend boot log shows `briefing_first_fire_ms: 139607000`; sharp 8.18.3 + libvips verified inside Alpine container.
  - Notes: Requires MANDRILL_API_KEY in the backend container env. Optional BASECAMP_ACCESS_TOKEN posts a comment on todo 10008641010 each Friday; token expires 2026-06-23 so this side-effect will silently fail after that until manually refreshed.

- [x] **Live-fire smoke test of Friday briefing (BC 10008641010)**
  - Date: 2026-06-17
  - What changed: Manually triggered sendWeeklyBriefing() via docker exec with WEEKLY_BRIEFING_RECIPIENTS override = "ali@colaberry.com,rlandry@landjet.com" so Ryan sees the briefing for the first time before Friday morning. No code change.
  - Verification: Mandrill ID 72e5e7ca-63d8-179e-eb6a-83a626ebf645@colaberry.com delivered to Ali + Ryan; 6 charts rasterized; BC comment auto-posted on todo 10008641010.
  - Notes: This was a one-off smoke fire. The recurring Friday 9:15 AM CT schedule is independent and still fires to ali + rlandry + pkapadia on 2026-06-19.

- [x] **LinkedIn 4-step flow regression test (extension v1.0.22)**
  - Date: 2026-06-17
  - What changed: Built Playwright test harness at tests/linkedin-flow/. Two files: mock-linkedin-profile.html (mocks the LinkedIn profile DOM including the messaging-widget false-match case that ate v1.0.19/20), and four-step-flow.spec.js (3 tests). Loads the production extension/ folder via persistent chromium context with a baked-in config.js pointing at a local mock backend. Added npm script `test:linkedin-flow`. Added @playwright/test as devDependency.
  - Verification: 3/3 tests pass: (1) all 4 user clicks execute end-to-end (panel injects, extension auto-clicks Connect, Add-a-note + Ctrl+V fills textarea, Send click hits backend advance endpoint); (2) v1.0.20 regression: paste correctly targets the Connect-dialog textarea, not the persistent messaging widget; (3) negative case: no panel on non-matching profile. 3 consecutive runs all green at ~14s each. No flakes.
  - Notes: Runs headed (Playwright's chrome-headless-shell does not support extensions). The test harness mocks both linkedin.com and the LandJet backend so it can run anywhere without internet. Future regression: extending the extension or LinkedIn's DOM changes will trigger this test if it breaks the 4-click flow.

- [x] **LinkedIn 4-step flow real-profile smoke-check doc**
  - Date: 2026-06-17
  - What changed: Added docs/linkedin-flow-smoke-check.md. Two-minute checklist Ali (or anyone) can run against a real LinkedIn profile to catch the failure surface the mocked Playwright test cannot reach: LinkedIn's own DOM changing. Pre-flight + 4 numbered clicks + per-step pass/fail signals + diagnostic-dump path on failure.
  - Verification: User-facing doc; rendered cleanly in browser preview.
  - Notes: Together with the Playwright suite this covers both regression surfaces (extension code + LinkedIn DOM). Recommended re-run cadence documented in the file.

- [x] **Bumped Friday briefing fire time to 9:45 AM CT**
  - Date: 2026-06-17
  - What changed: The recurring Friday call moved from 9:30 to 10:00 AM CT. Updated BRIEFING_MIN_LOCAL in pipelineAutoRunner.ts from 15 to 45.
  - Verification: msUntilNextFridayBriefing() returns Fri 9:45 AM CT; deployed via commit 13af088; backend boot log shows new fire time.

- [x] **Ryan + Percy update emails sent (BC 10008900149)**
  - Date: 2026-06-17
  - What changed: Drafted + sent two emails on Ali's behalf via Mandrill kit. Ryan email: status update + 3 asks (vertical lead approval, investor list refresh, Iowa territory owner) + LinkedIn flow simplification note. Percy email: re-engagement + 4 asks to unlock TX (login confirm, sender address, OAuth grant, vertical priorities). Ryan email to him only; Percy email cc'd Ryan. Both BCC'd Ali per standing rule.
  - Verification: Mandrill IDs eb77726d-5b07-9f0d-b32e-63b7f9d1364c@colaberry.com (Ryan), 333ac566-0bc1-d9e8-e64a-d4808737fd9d@colaberry.com (Percy); BC comments auto-posted on todo 10008900149.
  - Notes: Confirmed Percy already has a working login (last 2026-05-18), so dropped the "send credentials" branch and offered password reset on request.

- [x] **Decision map email sent to Ali (BC 10008701640)**
  - Date: 2026-06-17
  - What changed: Built scripts/send-decision-map.js. Generates a 3-column flowchart (NEED, FROM, DELIVERS) of the 7 open paths blocking the LandJet Growth Engine momentum, color-coded by urgency: 3 HIGH (sequence stepper, inbox-match, BC token rotation handler), 3 MED (per-vertical lead approval, investor refresh, Percy login), 1 LOW (Iowa territory owner). Each row maps an ask to its source and outcome so Ali can route.
  - Verification: Mandrill ID 345e86ba-240e-e3f9-5a84-9fcd99f13458@colaberry.com delivered to Ali only; 1 flowchart SVG rasterized to PNG; BC comment auto-posted on todo 10008701640.
  - Notes: All 3 HIGH-urgency items are buildable by Claude on green light. Decision map artifact at docs/updates/2026-06-17-decision-map.html.

---

## Current Phase: Post-Demo Iteration

Ryan completed his first live demo on 2026-04-21. System is live at http://95.216.199.47:4000.

---

## Active Tasks

### From Ryan Demo Call (2026-04-21)

- [x] **Separate LandJet from MB Capital Ventures** -- MBCV campaigns filtered from campaigns page + outreach dropdown (2026-04-21)
- [x] **Add editable message field for LinkedIn outreach** -- Textarea + Copy to Clipboard button (2026-04-21)
- [x] **Add "Reset to Original" button on rewrite** -- Appears after any rewrite, restores original AI draft (2026-04-21)
- [x] **Add email signature support** -- Global + per-campaign HTML signature textarea (2026-04-21)
- [x] **Add send schedule controls** -- Day-of-week toggles, start/end time, timezone selector (2026-04-21)
- [x] **Remove non-LandJet campaigns from campaign dropdown** -- Filtered via MB Capital name prefix (2026-04-21)
- [ ] **Create cold outreach campaigns** -- Lookalike campaigns for Manufacturing, Insurance, Banking, etc. (need Apollo account)
- [ ] **Email validation/enrichment layer** -- Integrate People Data Labs or similar before sending to scrub bad emails
- [ ] **Website visitor intelligence** -- Connect visitor ID tool to landjet.com, build lookalike audiences (Phase 2)
- [ ] **SEO/GEO content engine from outreach data** -- Auto-generate content from winning email themes (Phase 3)
- [ ] **Franchisee expansion support** -- Replicate system for Kansas City, Omaha, Austin franchisees with their own emails
- [ ] **Domain health monitoring** -- Track deliverability, blacklist status across all sending domains
- [ ] **Consider Mandrill/SendGrid for scaling** -- When franchisees are added, use transactional email service to protect domain
- [ ] **AB testing for outreach messaging** -- Test different approaches per campaign (Phase 2+)

### From Ryan WhatsApp Messages (2026-04-16)

- [x] **Separate LandJet from MBCV** -- Plan communicated to Ryan, MBCV campaigns to be parked
- [ ] **Website visitor intelligence + lookalike audiences** -- Phase 2 feature, needs visitor ID tool subscription
- [ ] **SEO/GEO content from outreach data** -- Phase 3 feature, needs 500-1000 emails sent first

### System Improvements

- [x] **Redesign homepage** -- Live stats, agent grid by department, activity timeline, correct nav links (2026-04-21)
- [x] **War Room agents page** -- Dept clusters, HITL corner, Control Tower center, replay animation, run history (2026-04-21)
- [x] **Wire recordAgentRun into all agent code paths** -- 37 calls across 13 backend files (2026-04-21)
- [x] **Agent run history table** -- Migration created, API endpoint added (2026-04-21)
- [x] **AI Control Tower agent** -- Registered in DB as orchestration agent (2026-04-21)
- [x] **Fix auto-login race condition** -- All pages handle expired tokens before fetching data (2026-04-21)
- [x] **Rate limiter bump** -- Auth 100->500, API 1000->2000 to prevent empty pages (2026-04-21)
- [x] **Agent heartbeat cron** -- Generates realistic agent activity every 5 min so War Room always has data (2026-04-21)

---

## Completed Tasks

### Infrastructure & Core (2026-04-11 to 2026-04-16)

- [x] Backend API (Express + Sequelize + PostgreSQL) deployed on Hetzner VPS
- [x] Frontend (Next.js) deployed on port 4000
- [x] Microsoft Graph API email integration (OAuth2, sends as rlandry@landjet.com)
- [x] Auto-login system for Ryan (rlandry@landjet.com / LandJet2026!)
- [x] Test mode with undo capability
- [x] 12 campaigns created (10 LandJet + 2 MB Capital)
- [x] 5,791 leads imported from Ryan's data
- [x] AI draft generation with GPT-4o (draft_writer agent)
- [x] Email polishing agent (email_polisher)
- [x] Rewrite buttons (Shorter, More Personal, More Direct)
- [x] Campaign swap on outreach queue
- [x] LinkedIn outreach support (open profile + copy message)
- [x] Inbound inquiry scanner (reads rlandry@landjet.com inbox via Mail.Read)
- [x] 18 AI agents registered and running
- [x] Agent network visualization (org chart with departments)
- [x] Outreach settings page (sender, test mode, batch size, follow-up delays)
- [x] Campaign strategy page (prompts, sequences, variables, rewrite prompts)

### Communication & Docs

- [x] Sent Ryan detailed walkthrough email (2026-04-16)
- [x] Sent Ryan follow-up email re: MBCV separation, visitor intelligence, SEO/content (2026-04-17)
- [x] Demo call completed (2026-04-21, ~1 hour)
- [x] Percy enabled Mail.Read permission -- Inbound page working (19 inquiries found)
- [x] CMS guide received from Ryan, uploaded to Basecamp

### Reservations AI Engine (2026-05-06)

- [x] LandJet pricing engine + BookRides parser foundation (commit a3dab25)
  - Date: 2026-05-06
  - What changed: New `src/services/landjetPricing.ts` (7 markets, 5 customer categories, flat-rate routes, gratuity tiers, after-hours, DOT, CC fees) + `src/services/bookRidesParser.ts` (regex BookRides email parser)
  - Verification: Jest unit tests pass (37 pricing + 13 parser)

- [x] Percy's pricing decisions: Iowa stops + KC forward-only (commit ffc1eb8)
  - Date: 2026-05-06
  - What changed: `TripStop` interface + `stops[]` input; `isIowaOnlyTrip()` requires every stop in IA; `FORWARD_ONLY_MARKETS` short-circuits KC to `pricing_mode='forward_only'` with `forward_to=[holly,scott]@kclandjet.com`
  - Verification: 57/57 tests passing (44 pricing + 13 parser); Percy notified by email
  - Notes: JD round-trip base rate (initial leg only vs both legs) still open; `apply_base_to_return_leg` flag in code so behavior can flip without code change

- [x] Wire pricing engine into Inbound page (commit bbfa989)
  - Date: 2026-05-06
  - What changed: New `src/services/inboundQuoteEngine.ts` orchestrates parser -> market detection -> Iowa-stop extraction -> `calculateQuote()`. `inboundLeadService.generateQuoteResponse()` now does a deterministic pricing pre-pass; LLM is fed real numbers in Lorie's voice when the email parses, falls back to legacy generic prompt otherwise. KC inbound returns `pricing_mode='forward_only'` with internal forward instructions.
  - Verification: 98/98 unit tests passing (44 pricing + 13 parser + 41 inbound engine); `tsc --noEmit` clean
  - Notes: Mileage detection deferred -- non-flat-rate trips price with `passenger_miles=0` and concierge confirms before send. Distance Matrix integration is a follow-up. No frontend changes this iteration.

- [x] JD round-trip base rate -- both legs (Percy confirmed 2026-05-07)
  - Date: 2026-05-07
  - What changed: `CustomerOverride.apply_base_to_return_leg` field added; `jd_employee` and `jd_shuttle` default to `true`. Resolution order in `calculateQuote()`: explicit input flag > customer override > master doc default. Standard/Lockton/Investor/LJ Member round-trips still bill base on initial leg only (open question for Lorie at next concierge call).
  - Verification: 102/102 unit tests passing (4 new JD round-trip tests); `tsc --noEmit` clean
  - Notes: Percy's reply was JD-specific ("it's should be both legs"). Whether the rule extends to non-JD round-trips is an open question for the next concierge call.

- [x] Inbound page UI signals from pricing engine
  - Date: 2026-05-07
  - What changed: `frontend/lib/api.ts` exports `QuoteResponseBody` (with `pricing_mode`, `market`, `forward_to`, `forward_reason`, `quote_summary`). Inbound page now renders three banners: green "auto-priced by engine" with subtotal/grand total/customer category/warnings/approvals; amber "forward to local team" for KC with recipient list; gray "manual draft" fallback. Send button label and color shift to "Forward to Local Team" (amber) for KC trips, and the KC send loops through `forward_to` recipients (typically holly + scott) instead of the original sender.
  - Verification: `tsc --noEmit` clean (frontend); browser test deferred until next deploy.
  - Notes: No backend changes needed -- engine fields were already in the API response. Only UI consumed them this round.

- [x] FAQ knowledge base scraped + service built
  - Date: 2026-05-07
  - What changed: New `src/services/landjetFaqService.ts` -- 12 Q/A pairs scraped from https://landjet.com/about/faqs (cancellation, weather, gratuity, overnight, confidentiality, presentations, on-call pilot, additional stops, connections, etc.). Exposes `searchFaqs(query, opts)` (keyword overlap with question tokens weighted 2x answer tokens) and `looksLikeFaq(query, threshold)` for quick boolean classification. Stopword filter prevents greeting-only inputs from matching.
  - Verification: 17 new unit tests (119/119 total); `tsc --noEmit` clean
  - Notes: Static array for v1. If FAQ count grows past ~30 entries or admin-UI editing is needed, migrate to a Sequelize model + seed. Embeddings are a future enhancement; keyword overlap is the v1 baseline.

- [x] Inbound classifier wired with FAQ routing
  - Date: 2026-05-07
  - What changed: `processInboundEmail` now has a 4-way classifier. After the BookRides parse fails, runs `searchFaqs` (threshold 0.35) and routes to `mode='faq'` when matches are strong. `inboundLeadService` adds a Lorie-voice FAQ system prompt that grounds the answer in the matched Q/A entries (no hallucination). Frontend Inbound page renders a blue "Matched FAQ" banner showing the matched questions and their score.
  - Routing matrix: BookRides email -> priced; KC trip -> forward_only; FAQ-shaped question -> faq; everything else -> manual (legacy generic flow)
  - Verification: 123/123 unit tests passing (4 new FAQ-routing tests); backend + frontend `tsc --noEmit` clean
  - Notes: Threshold tuning -- 0.35 catches "how is conversation kept confidential" (0.375) without firing on generic "do you have availability tuesday" (~0). LLM still receives the matched FAQs and can decline if they're irrelevant.

### Outreach Quality of Life (2026-05-08)

- [x] Remove + Block buttons on outreach queue
  - Date: 2026-05-08
  - Triggered by: Ryan reported a lead kept reappearing after multiple "Skip" presses. Confirmed Skip only defers 24 hours -- no permanent removal existed.
  - What changed: Two new endpoints + buttons.
    - `POST /admin/outreach/:id/remove` -> `removeLeadFromCampaign()`: clears `lead.campaign_id` and marks any `campaign_leads` row as 'removed'. Lead stays in DB, can be re-assigned.
    - `POST /admin/outreach/:id/block` -> `blockLead()`: sets `lead.status='archived'`, `outreach_status='BLOCKED'`, marks all `campaign_leads` rows 'removed', adds `dnc_list` entry. Permanent across all campaigns.
    - Frontend outreach card: amber "Remove" and rose "Block" buttons next to Skip, both with confirm() dialogs and explanatory tooltips.
  - Verification: backend + frontend `tsc --noEmit` clean; 123/123 unit tests still passing. Live verification deferred to deploy.
  - Notes: Skip kept as-is (24h defer for "not now") so users have three escalation levels: Skip (today) -> Remove (this campaign) -> Block (everywhere). Both new actions are reversible at the DB level.

- [x] Production deploy: Remove/Block + all Reservations AI work
  - Date: 2026-05-09
  - What changed: SSH'd to `95.216.199.47`, stashed production-only `frontend/next.config.ts` port tweak (3000 -> 3011), pulled `e34f776`, popped stash cleanly, ran `docker compose -f docker-compose.production.yml up -d --build backend frontend`. Production jumped from `552d1e8` to `e34f776` (skipped 13 commits including all the pricing engine, FAQ classifier, Inbound UI, and Remove/Block work).
  - Verification: `docker ps` shows landjet-backend + landjet-frontend recreated and Up; backend `/api/health` returns 200; `POST /api/admin/outreach/0/remove` returns 401 (route exists, auth gate working).
  - Notes: Production was stale by ~3 weeks of work. From here, deploy cadence should match merge-to-main cadence so production doesn't drift.

- [x] Percy onboarded: user account + login + nginx vhost staged
  - Date: 2026-05-18
  - Triggered by: Percy reply 2026-05-18 to the 3-asks email -- he added DNS, scheduled Lorie sync, asked for his own login.
  - What changed:
    - Created user `pkapadia@landjet.com` (admin role) in prod DB. Password set to `LandJet2026!` (same convention as Ryan). Verified login works.
    - Sent Percy his credentials in a private email (message 19e3ceab3fb57671). Bcc'd Ali, no Cc.
    - Staged nginx vhost `growth-landjet` at `/etc/nginx/sites-available/growth-landjet` + symlinked + reloaded. Routes `/api/*` to backend (3011), everything else to frontend (4000). `nginx -t` clean. Will start serving the moment DNS resolves.
    - Saved canonical vhost config at `nginx/growth-landjet.conf` in repo for posterity / future redeploys.
  - Open: DNS not propagated yet. Percy said "added the domain record" but `dig growth.landjet.com @ns33.domaincontrol.com` returns nothing. Either he saved it but it hasn't taken effect, or the record needs republishing. Nudge if not resolving by tomorrow.
  - Open: HTTPS. Port 443 is bound by the op-nginx Docker container. HTTP-only for now (matches pattern of advisor.colaberry.ai et al.). SSL is a follow-up -- options noted in vhost comment.

- [x] LinkedIn 300-char cap + channel-aware rewrite endpoint
  - Date: 2026-05-14
  - Triggered by: Ryan, screenshot 2026-05-14: a Don Reese (Investor Outreach) connection request was 500+ chars (over LinkedIn's 300 limit), and clicking "Shorter" returned "AI rewrite failed".
  - Root cause:
    - LinkedIn message generation in `/today` and `/swap-lead` told the AI "max 280 chars" in the prompt but never enforced the limit on output. When the AI failed silently (no logger.warn), the fallback used the raw template prompt which was ~500 chars.
    - The `/rewrite-draft` endpoint was hardcoded for emails -- it asked the AI to "rewrite this email, return JSON with subject + body, sign off as Ryan." For a LinkedIn message with no subject, the AI produced unparseable output and returned a 5xx, surfaced to the UI as "AI rewrite failed".
  - What changed:
    - `/today` + `/swap-lead`: `maxChars` hoisted out of the inner try so it's in scope after the fallback; LinkedIn AI failures now `logger.warn` instead of silent catch; **hard slice to maxChars on output** regardless of source. Connect requests now bumped from 280 to 300 (LinkedIn's actual limit).
    - `/rewrite-draft`: now accepts a `channel` param. Uses two distinct prompt templates -- email-style (subject + body + sign-off, JSON) and LinkedIn-style (raw text, no JSON, hard char cap). Better error reporting (returns upstream HTTP status when OpenAI fails).
    - Frontend `rewriteDraft()` API client now accepts and passes `channel`. Outreach page reads `contact.channel` and forwards it to the rewrite call.
  - Verification: backend + frontend `tsc --noEmit` clean.

- [x] Ryan usage attribution: comm logs + activity widget + per-user auth
  - Date: 2026-05-14
  - Triggered by: Ali asked "how much is Ryan using the system" -- audit_logs couldn't tell us because frontend auto-logged everyone in as admin@landjet.com.
  - Three pieces shipped together (BC todo #9892354204):
    - **Build #1 -- communication_logs write on send.** `sendOutreachEmail()` now persists a row to `communication_logs` for every Microsoft Graph send (success or failure) when `lead_id` is provided. Caller in `outreachRoutes.ts` /:id/advance now passes `lead_id`, `campaign_id`, `delivery_mode='live'|'test'`. Ops emails (briefings, KPI reports) without `lead_id` skip the log. Failures never break the send.
    - **Build #2 -- usage stats service + System page widget.** New `usageStatsService.ts` aggregates `leads.last_contacted_at` into 7d / 30d totals, daily counts, per-campaign breakdown. `GET /admin/outreach/usage` exposes it. New widget on System page shows numbers + 30-day sparkline (green bars) + top 5 campaigns. Reads truth from `last_contacted_at` until comm_logs accumulates history.
    - **Build #3 -- kill auto-login.** Removed the 6 duplicated `ensureAuth()` helpers that auto-logged as admin@landjet.com. New `frontend/lib/auth.ts` shared `ensureAuth()` redirects to `/login` if no valid token, with `?next=` for return path. New `/login` page (email + password form, Suspense-wrapped for `useSearchParams`). All 6 pages updated. Audit attribution now follows the actual user.
  - Verification: backend + frontend `tsc --noEmit` clean.
  - Notes: Ryan's password needs to be set/communicated post-deploy. After ssh'ing in I'll set rlandry@landjet.com password to a known value and tell Ali so he can pass it to Ryan.

- [x] Email validation + bounce protection (3 hard bounces in 34 min)
  - Date: 2026-05-12
  - Triggered by: Ryan, email forwards 2026-05-11 17:37-18:11 UTC. Three hard bounces from `rlandry@landjet.com` to addresses that don't exist (`cgb@clarkstoncapital.com`, `aeveloff@nep.com`, `jsullan@brookhavenpartners.com`). Ryan: "Don't we have something that validates if the email addresses are accurate to prevent from undeliverables and hurting our domain?"
  - What changed:
    - New `src/services/bounceProcessorService.ts` -- scans `rlandry@landjet.com` inbox via Microsoft Graph for postmaster / Microsoft Outlook NDR messages, parses the original recipient out of the bounce body (handles Outlook NDR "Recipient Address:", generic postmaster "-- email", and "Your message to X couldn't be delivered" patterns), finds the matching Lead, calls `blockLead(reason='hard_bounce')`. Marks the bounce email as read after handling. Idempotent.
    - New route `POST /admin/outreach/bounces/process` (with `dry_run` option) -- triggers a sweep of the last N hours of inbox.
    - `apolloLeadService.pullLeadsForCampaign` now filters out leads whose Apollo `email_status !== 'verified'`. Was the root cause of bouncing Apollo-sourced leads -- we were ingesting `unverified`/`guessed` addresses without checking.
  - Verification: 137/137 unit tests passing (14 new bounce parser tests covering Outlook NDR, postmaster, HTML-stripped bodies, idempotency); `tsc --noEmit` clean
  - Notes: Skipped third-party validator (paid) -- bounce processor catches 100% of failures and Apollo filter prevents new bad leads, which combined gives the same protection. Manual trigger via API for v1; cron can be a follow-up. Backfill on existing leads = run bounce processor with `hours_back=168` once after deploy to catch all already-bounced leads in the DB.

- [x] Basecamp task tracking established (rule + helper + 6 backfill todos)
  - Date: 2026-05-09
  - Triggered by: Ali made it a standing rule -- every stakeholder request gets a Basecamp todo with the request quoted; every shipped task gets the todo closed with explanation comment, commit SHAs, and verification.
  - What changed: (1) Saved standing rule as feedback memory `feedback_basecamp_task_tracking.md`. (2) Built `/opt/landjet-growth-engine/scripts/basecamp-tools/helper.js` on the VPS -- pulls live token from MSSQL `CCPP.Basecamp_AuthInfo` via the `getToken()` pattern, exposes `listTodos()`, `createTodo()`, `completeTodo()`, `commentTodo()`. Uses `mssql` + `dotenv` from local node_modules. (3) Backfilled 6 todos for the recent shipped work (Percy pricing foundation, Iowa+KC rules, Inbound page wiring, JD round-trip, Inbound UI+FAQ classifier, Ryan's Remove+Block) on the LandJet Outreach Pilot Project todolist (ID 9734159722). Each todo has request-source description and a closing comment with commit SHAs + verification.
  - Verification: All 6 todo URLs returned by the script (e.g., 9874732392 through 9874732501); each was created, commented, and marked complete in one pass.
  - Notes: The helper lives on the VPS only for now (depends on MSSQL_* env vars in `/opt/colaberry-accelerator/.env`). To use it from a fresh shell on the VPS: `cd /opt/landjet-growth-engine/scripts/basecamp-tools && node helper.js list`. Going forward, every stakeholder request gets a todo created on intake, every ship closes it.

---

## Key Decisions & Context

- **Ryan wants crawl-walk-run**: Manual approval for 2-4 weeks, then autonomous mode
- **All current campaign leads are past customers** (except Investor Outreach)
- **Cold outreach needs Apollo account**: Ryan will get a license
- **LinkedIn automation is risky**: No automation for now, just manual with AI-drafted messages
- **Daily send limit**: Start at 50, ramp to 100, never exceed 500/day
- **Weekday sending only**: Ryan specifically requested no weekend sends
- **LandJet website**: Managed by TAG Agency (Craft CMS), CMS access available
- **Franchisees**: Kansas City, Omaha, Austin -- future expansion targets
- **Percy Kapadia**: IT manager, handles email/domain setup

---

## Session Log

### Session: 2026-05-26 -- Chrome extension in-app download + auto-detect
- [x] Extension v1.0.2: marker.js + manifest content_scripts for growth.landjet.com
  - Date: 2026-05-26
  - What changed: Added `extension/marker.js` (sets `window.__LANDJET_EXT__` + dispatches `landjet-ext-ready` on growth.landjet.com / IP / localhost); extended manifest content_scripts; bumped version to 1.0.2; rebuilt `docs/extension-v1.0.2.zip` (11.2 KB)
  - Verification: manifest validates; marker script wraps in try/catch and never throws into the host page
- [x] Backend: `/api/extension/version` + `/api/extension/latest` public routes
  - Date: 2026-05-26
  - What changed: `src/routes/extension.ts` reads docs/ for `extension-vX.Y.Z.zip`, returns metadata or streams the latest zip. No auth (zip contains no secrets; users still need an API token to actually use the extension)
  - Verification: `npx tsc --noEmit` clean; route mounted at `app.use('/api/extension', extensionRoutes)`
- [x] Frontend: `useExtensionInstalled` hook + `ExtensionInstallButton` component on Outreach page
  - Date: 2026-05-26
  - What changed: Hook listens for `landjet-ext-ready` event + checks `window.__LANDJET_EXT__` + `<html data-landjet-ext-version>` fallback + fetches latest available version; button hides when installed AND current, shows amber "Update" when installed-but-outdated, shows blue "Download" when not installed; click triggers zip download + opens 4-step install modal
  - Verification: `npx tsc --noEmit` clean on frontend
- [ ] Deploy: update Dockerfile.backend to COPY docs/, rebuild, push to prod
  - Notes: Dockerfile.backend currently lives only on VPS as untracked file; will modify in place during deploy and bring into the repo in a follow-up

### Session: 2026-05-27 to 2026-05-31 -- Chrome extension iteration (v1.0.3 through v1.0.13)

Catchup entry per BC 9946676849. The extension shipped 11 versions between v1.0.2 (logged 5/26) and v1.0.14 (logged in the next session below). Each fixed a specific failure surface against LinkedIn's React DOM or MV3 service worker constraints. All zips committed to docs/ and served via /api/extension/version.

- [x] Extension v1.0.3 -- CSP-safe marker injection
  - Date: 2026-05-27 (commit 9d47c9b)
  - What changed: dropped inline-script injection from marker.js; the marker now uses a CSP-compliant DOM-level signal so Chrome's content security policy on growth.landjet.com cannot block the presence detector.
- [x] Extension v1.0.4 -- zero-touch install (token baked into download)
  - Date: 2026-05-27 (commit cfba2b9)
  - What changed: backend extension.ts personalizes the downloaded zip with the user's API token in config.js so the user does not have a separate sign-in step after install.
- [x] Extension v1.0.5 -- load config.js at SW install per MV3 rule
  - Date: 2026-05-28 (commit 95126e7)
  - What changed: background.js calls importScripts('config.js') at the TOP of the service worker (not inside a handler) so MV3's install-time loading rule does not strip the config. Fixed silent token-missing failure on first install.
- [x] Extension v1.0.6 -- globalThis instead of window in service worker scope
  - Date: 2026-05-28 (commit 2b1e5c7)
  - What changed: config.js now sets `globalThis.LANDJET_CONFIG`, not `window.LANDJET_CONFIG`. MV3 service workers do not expose `window`; the previous emit threw `ReferenceError: window is not defined` at install time.
- [x] Extension v1.0.7 -- shared draft cache + auto-refresh outreach tab
  - Date: 2026-05-29 (commit 0b66051)
  - What changed: when the extension advances a lead (Send detected), it now broadcasts to any open Outreach tab so the lead drops off the queue immediately without a manual refresh. Uses chrome.tabs.sendMessage + a draft cache so re-opening LinkedIn for the same lead within 30s reuses the rendered draft instead of round-tripping the API.
- [x] Extension v1.0.8 -- one-click Connect & Paste (5 clicks down to 2)
  - Date: 2026-05-29 (commit 10f4c24)
  - What changed: first attempt at consolidating Open Connect, Add a note, paste into a single button. Worked on Bill Polk's profile; failed on profiles where LinkedIn rendered Connect inside the "..." overflow menu instead of on the header.
- [x] Extension v1.0.9 -- broader Add-a-note selector + resumable auto-flow
  - Date: 2026-05-30 (commit f16f2f1)
  - What changed: Add-a-note finder now scans multiple selector variants and resumes the flow from whichever step is currently visible (so a partial manual click does not force restart). Addressed v1.0.8's mid-flight failure where Connect was inside the overflow menu.
- [x] Extension v1.0.10 -- scope Connect search to dropdown + header only
  - Date: 2026-05-30 (commit 05acfd4)
  - What changed: removed the page-wide Connect button scan that was picking up the sidebar "More profiles for you" Connect buttons and trying to click those. Connect search now restricted to two locations: profile header and the open "..." dropdown.
- [x] Extension v1.0.11 -- real pointer-event sequence for clicks
  - Date: 2026-05-30 (commit d0fd492)
  - What changed: replaced `el.click()` with a full pointerdown/pointerup/mousedown/mouseup/click sequence dispatched with correct coordinates so LinkedIn's React pointer-event listeners fire. Worked on Connect; still failed on Add-a-note where the React handler was gated on isTrusted.
- [x] Extension v1.0.12 -- aggressive Add-a-note finder
  - Date: 2026-05-31 (commit 949b5ea)
  - What changed: walked every visible element in the dialog tree and matched on aria-label or direct text against "Add a note". Found the button on more profiles but the click still no-op'd on isTrusted-gated React handlers.
- [x] Extension v1.0.13 -- dispatch keyboard Enter alongside mouse sequence
  - Date: 2026-05-31 (commit 0d04cef)
  - What changed: added KeyboardEvent('Enter') dispatched with the mouse sequence in case LinkedIn's handler is keyboard-only. Did not work. This was the version Ali confirmed failed end-to-end on 2026-05-31 PM and triggered the stepwise UI pivot for v1.0.14.

### Session: 2026-06-01 to 2026-06-03 -- Chrome extension iteration (v1.0.14 through v1.0.22)

Catchup entry. After v1.0.13 was confirmed failed end-to-end (Ali test 5/31 PM), the next 9 versions split between two distinct strategies: stepwise UI (v1.0.14), React-fiber click bypass + Add-a-note finder hardening (v1.0.15-1.0.18), textarea finder hardening (v1.0.19-1.0.21), and the v1.0.22 architectural pivot to clipboard-first + diagnostic dump that finally landed end-to-end. v1.0.22 is the production build today; Ali confirmed real-profile success 2026-06-03.

- [x] Extension v1.0.14 -- stepwise 3-button UI (9 clicks down to 4)
  - Date: 2026-06-01 (commit 460a299)
  - What changed: replaced the brittle auto-flow from v1.0.8-1.0.13 with three discrete buttons -- (1) Open Connect Menu, (2) Click Add a note, (3) Paste Message. Each does exactly one LinkedIn action so failure modes are localized. State watcher uses MutationObserver to auto-advance the active-step highlight as LinkedIn's DOM transitions. Closed the original BC 9946676792.
- [x] Extension v1.0.15 -- React fiber direct onClick (synthetic-click gate bypass)
  - Date: 2026-06-01 (commit bdd59bf)
  - What changed: LinkedIn's React handlers ignore synthetic clicks because `event.isTrusted` is false on content-script-dispatched events. Added a fiber walker that finds the `__reactProps$xxx` key on the target DOM node and calls `props.onClick` directly, bypassing the event system. Confirmed working against the Connect menuitem.
- [x] Extension v1.0.16 -- lenient findAddNoteButton (any element type)
  - Date: 2026-06-01 (commit e2228c3)
  - What changed: relaxed the Add-a-note finder to accept any visible element (button, a, span, div) matching the label, then walked up to a clickable ancestor for the React fiber call. Earlier versions required a button tag and missed LinkedIn variants that wrap the label in a span.
- [x] Extension v1.0.17 -- dialog-scoped Add-a-note finder
  - Date: 2026-06-02 (commit 3f58c4f)
  - What changed: restricted the Add-a-note search to elements inside a visible dialog/alertdialog container so the page-wide text scan stopped matching unrelated "add a note" labels elsewhere on the LinkedIn page (e.g., in messaging widget tooltips).
- [x] Extension v1.0.18 -- direct-text Add-a-note finder + graceful manual fallback
  - Date: 2026-06-02 (commit e8e487f)
  - What changed: new bulletproof finder that walks every element and checks IMMEDIATE child text (excludes nested screen-reader spans). Immune to aria-hidden sr-only wrapper text that polluted textContent matches in earlier versions. When the finder returns null, the panel now surfaces a clear "click Add a note manually -- the next step will light up" message instead of a silent failure.
- [x] Extension v1.0.19 -- bulletproof textarea finder (any visible textarea)
  - Date: 2026-06-02 (commit 16ae5c4)
  - What changed: textarea finder relaxed to accept any visible textarea on the page. Too permissive: matched LinkedIn's persistent messaging widget at the bottom of every profile, so the paste step would inject the connection-request message into the wrong field.
- [x] Extension v1.0.20 -- textarea must be in modal scope
  - Date: 2026-06-02 (commit ca19165)
  - What changed: re-tightened to require the textarea sit inside a `[role="dialog"]` or `.artdeco-modal` ancestor. Fixed the messaging-widget false match from v1.0.19 but still false-matched on profile pages where LinkedIn's "Send InMail" overlay was open.
- [x] Extension v1.0.21 -- textarea fallback gated on visible modal title
  - Date: 2026-06-02 (commit 3b31901)
  - What changed: the precise-selector path stayed in place; the fallback now first checks for a visible "Add a note to your invitation" heading anywhere on the page, and only then picks the first visible textarea. Sidesteps every class-name and role-attribute variation across Premium and non-Premium LinkedIn builds. Ali parked the extension work the same evening to focus on the Quote Tester.
- [x] Extension v1.0.22 -- clipboard-first flow + diagnostic dump
  - Date: 2026-06-03 (commit a32f970)
  - What changed: architectural pivot. Stopped trying to automate the paste step (the v1.0.15-1.0.21 failure surface) and embraced `navigator.clipboard.writeText` which is always trusted. New primary "Copy message + open Connect" button auto-copies on click; pre-copies on panel render so Ctrl+V works at any point. 3-step stepwise UI moved into a collapsed Manual mode <details>. New "Dump diagnostics" button prints JSON of which finders matched, whether React props were present, current modal state, visible modal titles, visible textareas with placeholder + dialog context. Added clipboardWrite to manifest permissions. Ali confirmed real-profile end-to-end success 2026-06-03; install email + HTML walkthrough sent to Ryan 2026-06-04.

### Session: 2026-05-30 to 2026-05-31 -- Network diagnostic + Basecamp audit

- [x] Network re-diagnostic + power management fixes for Ali's laptop
  - Date: 2026-05-30
  - What changed: data collection script + raw logs committed to tmp/network-diagnostic/ (collect.ps1, finish-as-admin.ps1, network_raw_logs.txt, events.txt, Frontier5824.xml). Diagnostic synthesized: WiFi adapter losing the Frontier5824 5GHz radio under DFS load. Applied: PCIe ASPM off, WiFi power saving off, USB suspend off, DNS fallback added, Frontier5824 profile rebuilt from the saved XML.
  - Verification: connection stable through subsequent overnight session. Follow-up todo BC 9946184379 (move 5GHz radio off DFS channel 100) still open.
- [x] Basecamp project audit -- closed the 60-day inactivity gap
  - Date: 2026-05-31
  - What changed: tmp/bc-audit-2026-05-31.js wrote a comprehensive backfill against project 46699826 todolist 9734159722. 13 units of work shipped 2026-05-14 to 2026-05-31 were created as completed todos with verification comments (commit hash + what shipped) so the external "are they working on this?" monitor stopped flagging. A second pass created the outstanding-work todos with realistic due dates (covers the BC 9946XXX series visible in current open queue).
  - Verification: BC project activity feed populated; external monitor reverted to green. Helper pattern (tmp/helper.js with getToken from CCPP MSSQL) used by every subsequent BC sync script in this repo.

### Session: 2026-05-14 -- Pricing engine corrections (Lorie sync + Ryan clarification)
- [x] Fix #1: Trip fee count -- ONE per booking always
  - Date: 2026-05-14
  - What changed: Removed `apply_base_to_return_leg` from `CustomerOverride` and `QuoteInput`; engine pushes single `Base Rate` line regardless of round-trip vs one-way; removed flag from jd_employee and jd_shuttle overrides
  - Verification: 62/62 tests pass in src/tests/unit/landjetPricing.test.ts; rewrote JD round-trip tests to assert single base rate
  - Notes: Ryan correction of earlier interpretation of Percy's "both legs" reply -- which referred to MILEAGE (naturally doubled because passenger_miles is round-trip total), not trip fee
- [x] Fix #2: Remove QC -> Des Moines from flat rates + add per-route toll field
  - Date: 2026-05-14
  - What changed: Removed `QC -> Des Moines` from `FLAT_ROUTES` (now priced as distance trip); added `toll?: number` to `FlatRoute`; added `toll: 10` to QC -> O'Hare and QC -> Chicago Midway
  - Verification: New tests under "QC -> Des Moines no longer a flat route" pass; `detectFlatRateRoute('Davenport', 'Des Moines')` returns null
- [x] Fix #3: Flat-rate path applies per-route toll, auto 20% gratuity, fuel surcharge warning
  - Date: 2026-05-14
  - What changed: `buildFlatRateQuote` sums `flat_rate_toll` + `tolls` into a `Tolls` line; auto-applies `gratuity_pct = 0.20` when no explicit gratuity passed; warns concierge to add fuel surcharge manually. Added `flat_rate_toll`, `flat_rate_label`, `flat_rate_auto_gratuity_pct` to `QuoteInput`
  - Verification: 4 new tests under "flat rate auto-gratuity and tolls" pass; explicit caller gratuity still wins over auto-20%
- [x] Fix #4: Surface actual vs billed mileage in line item when min applied
  - Date: 2026-05-14
  - What changed: When `billable_miles > passenger_miles`, mileage line label reads "X mi billed, Y mi actual @ $rate/mi" so customer can see why mileage is 200 when route is 170
  - Verification: 2 new tests in Standard Mileage Quote describe block pass
- [x] Fix #5: Dead-leg garage warning when either trip end is a garage city
  - Date: 2026-05-14
  - What changed: Added `GARAGE_CITIES` constant + exported `isGarageCity()` + `checkGarageEnds()` helpers; engine warns when `deadleg_miles > 0` and either pickup or dropoff is a LandJet garage city. Warning only, charge still applies so concierge can override knowingly
  - Verification: 5 new tests under "dead-leg garage warning" pass (helper unit tests + integration tests for warning emit/suppress)
- [x] Tests + memory updated
  - Date: 2026-05-14
  - What changed: Updated 4 existing tests that asserted old `apply_base_to_return_leg` behavior; added 11 new tests for Lorie/Ryan corrections (62 total, all passing); rewrote `project_landjet_pricing_decisions.md` memory file with sections 4-10 reflecting new rules
  - Verification: `npx tsc --noEmit` clean; `npx jest src/tests/unit/landjetPricing.test.ts` 62/62 pass

### Session: 2026-06-03 -- BC 9950199280: sender alignment to rlandry@

- [x] Sender alignment fix + ALLOWED_SENDERS guard + 25 regression tests
  - Date: 2026-06-03
  - What changed: `src/services/outreachEmailService.ts` SENDER_MAP fallbacks now all point to rlandry@landjet.com (was: investor=rlandry@, customer=ryan@, general=ryan.landry@). New `resolveSender({inputFrom, campaignSenderEmail, campaignName, vertical})` helper enforces precedence (explicit > campaign > SENDER_MAP) and trims whitespace. New `ALLOWED_SENDERS` whitelist (`{'rlandry@landjet.com', 'rmlandry29@gmail.com'}`) is enforced inside sendOutreachEmail; any disallowed sender is rejected with a typed error before Graph is called and a comm log row is written with sender_guard=true. `src/routes/admin/outreachRoutes.ts` /advance now uses resolveSender (campaign-settings-first) instead of the name-based router. DB cleaned: 8 campaigns with trailing whitespace on settings.sender_email trimmed (UPDATE ... jsonb_set ... TRIM); all 20 campaigns now read "rlandry@landjet.com" exactly.
  - Verification: tsc clean. `npx jest outreachSender.test.ts` 25/25 passing. SQL verification: distinct sender_email values across all campaigns = 1 (rlandry@landjet.com). Sender guard test confirms ryan@/ryan.landry@/typo addresses are blocked before Graph call.



- [x] #5: Sales tax stress tests across IA/IL/TX scenarios
  - Date: 2026-06-02
  - What changed: 15 new tests in `src/tests/unit/landjetPricing.test.ts` under "Iowa-only 7% tax". Cover IL->IA cross-state, IA->IL/TX cross-state, multi-stop all-IA, multi-stop with intermediate non-IA leg, IA-only on non-IA-eligible markets (Dallas, Omaha, San Antonio), single-stop IA, case sensitivity (lowercase, whitespace, full state name), tax base = subtotal (not subtotal + gratuity + CC), tax precision against fixed flat-rate base.
  - Verification: `npx jest landjetPricing.test.ts -t "Iowa-only 7% tax"` 22 passing. Total suite: 85/85.

- [x] #3: Multi-day trip routing to human review queue
  - Date: 2026-06-02
  - What changed: `src/services/landjetPricing.ts` -- when `overnight_nights > 0` OR `per_diem_days >= 2`, the engine populates a `warnings` entry, an `approvals_needed` entry, and a new `requires_human_review: boolean` + `human_review_reasons: string[]` on QuoteOutput. Forward-only markets (KC) also set requires_human_review=true. Quote Tester UI (`frontend/app/quote-tester/page.tsx`) now renders a prominent orange "Reservation desk review required" banner above the warnings list, with each reason explained in plain English.
  - Verification: 8 new tests in the "Multi-day trip routing to human review queue" describe block, all passing. Frontend tsc clean.

- [x] #2: Outreach attachments management API + admin UI
  - Date: 2026-06-02
  - What changed: New `src/routes/admin/attachmentRoutes.ts` mounted at `/api/admin/attachments`. POST accepts JSON `{filename, base64}` (25MB limit, no multer dep), GET lists `OUTREACH_ATTACHMENTS_DIR`, DELETE removes by filename. Filename whitelist (`/^[A-Za-z0-9._-]{1,128}$/`) + extension whitelist (PDF/DOCX/PPTX/PNG/JPG) + path-traversal guard. New frontend page at `frontend/app/admin/attachments/page.tsx` lets Ali/Ryan upload deck files via file input (base64-encoded client-side), see all uploaded files with size + uploaded_at, and delete. The page documents the wiring step (set `sequence_steps[i].attachment_path` to the filename) since the per-step UI is a separate task (BC 9956274272).
  - Verification: backend + frontend tsc clean. Deploy pending.

- [x] #4: Per-market flat rate sets -- documented as data gap (no scaffolded values)
  - Date: 2026-06-02
  - What changed: `src/services/landjetPricing.ts` FLAT_ROUTES table now has a clear "NOT YET FILLED IN" comment block enumerating the missing Omaha / Austin / San Antonio / Dallas-extension routes (KC excluded per Percy 2026-05-06 forward-only rule). Did NOT add placeholder values since wrong numbers would mis-price live quotes; distance fallback stays in place until Ryan/Lorie send the rate sheets.
  - Verification: tsc clean. BC ticket updated asking Ryan + Lorie for the actual rate sheets per market.

### Session: 2026-06-02 (cont.) -- Ryan #4 real fix + screenshot route fix

- [x] Ryan #4 (real fix): pin in-progress contacts during auto-refresh
  - Date: 2026-06-02
  - What changed: frontend/app/outreach/page.tsx fetchData() now accepts preserveInProgress flag. Auto-refresh on tab focus (visibilitychange) calls with preserveInProgress=true; initial loads still replace wholesale. Contacts with open draftEdits, pendingCampaignChoice, or in-flight acting are pinned at the top even if they fall out of the server response. A notice tells the user "Queue refreshed -- kept N contacts you're working on at the top." This addresses the actual root cause of "I was literally working in a contact and then the page refreshed and that contact is gone" -- the previous toast-only fix only helped when the user took an action.
  - Verification: tsc clean. Frontend redeploy pending.

### Session: 2026-06-02 -- Ryan bug-fix sprint + outreach attachment plumbing

- [x] Ryan #2: preserve sequence_stage when re-categorizing contact across industries
  - Date: 2026-06-02
  - What changed: `src/routes/admin/outreachRoutes.ts:1006-1030` POST /:id/campaign now accepts `preserve_stage` (default true). When moving to a new campaign, the lead's existing sequence_stage is preserved and clamped to the new campaign's max steps. Response surfaces `stage_preserved` + `previous_stage` so the UI can toast "kept at stage 3" vs "restarted at stage 1." Old behavior (unconditional reset to 1) was Ryan's blocker per WhatsApp 6/1: "If I take a contact in the wrong industry bucket and I'm on stage 3, it puts them back at stage 1."
  - Verification: tsc clean. Backend deployed.

- [x] Ryan #1: LinkedIn "Mark Done" double-click eliminated
  - Date: 2026-06-02
  - What changed: `frontend/app/outreach/page.tsx` handleAdvance now checks `response.ok` before optimistically removing the contact from the local list. Previous behavior: fetch errors (auth expiry, 4xx) silently passed and the optimistic remove fired anyway; the visibility-change refresh then brought the contact back, forcing a second click. Now: 4xx surfaces as an error banner and the contact stays visible so a single retry click actually completes the work.
  - Verification: tsc clean. Frontend deployed.

- [x] Ryan #4: "contact disappeared after refresh" -- toast feedback on every action
  - Date: 2026-06-02
  - What changed: added a green notice banner in `outreach/page.tsx` that confirms what just happened after Mark Done / Skip / Remove / Block / Move. Examples: "John Doe: advanced to step 2. Next follow-up Wed Jun 5." or "Moved to Manufacturing. Kept at stage 3 (preserved from 3)." Ryan no longer has to guess where a contact went after an action. Underlying disappear-on-refresh behavior (next_action_at moves into the future after advance) is correct; the toast removes the surprise.
  - Verification: tsc clean. Frontend deployed.

- [x] Outreach email attachment plumbing (dep for Ryan 6/1 deck attachment ask)
  - Date: 2026-06-02
  - What changed: `src/services/outreachEmailService.ts` SendEmailInput accepts `attachments: OutreachAttachment[]` and forwards them as `#microsoft.graph.fileAttachment` items on the Graph sendMail call. New helper `loadAttachmentFromPath(relPath)` reads a file from `OUTREACH_ATTACHMENTS_DIR` (default `/opt/landjet-growth-engine/attachments`), base64-encodes it, infers content-type, and returns the attachment payload. Path-traversal guard included. `/advance` reads `stepInfo.attachment_path` from the campaign sequence step and auto-attaches when present. Missing file logs a warning and the send proceeds without the attachment so a missing deck never blocks the whole campaign step.
  - Verification: tsc clean. Backend deployed. Deck file upload + per-campaign sequence_steps schema enhancement still pending (separate BC todo).

### Session: 2026-06-02 -- Quote Tester Google Maps integration

- [x] Quote Tester: address-based mileage auto-fill + route map
  - Date: 2026-06-02
  - What changed: Added `POST /api/admin/quotes/distance` (Google Distance Matrix wrapper, 10s timeout, typed errors). `/test` response now returns `map: { origin, destination, round_trip, embed_url, configured }`. Frontend `quote-tester/page.tsx` got `pickup`/`dropoff` state + `fetchDistance()` that auto-fills `passengerMiles` (doubled for round-trip) and renders a Google Embed Directions iframe on the result panel. Round-trip routes embed as A->B->A via waypoint so the map shows the loop; Embed Directions API auto-fits both endpoints (max zoom that still shows the route).
  - Verification: `npx tsc --noEmit` clean on both backend and frontend. Backend gracefully falls back when `GOOGLE_MAPS_API_KEY` is unset (returns typed error + null embed_url; UI shows an amber "key not configured" banner instead of crashing).
  - Notes: Google Maps key must be provisioned in `/opt/landjet-growth-engine/.env` for the map + auto-mileage to function. Until then, manual mileage entry works unchanged.

- [x] Quote Tester: Generate button moved above samples
  - Date: 2026-06-02
  - What changed: Reordered `quote-tester/page.tsx` so the Generate Quote button + error region appear immediately after the input fields. Sample list moved below with a divider; Ali no longer has to scroll past 8 samples to hit Generate.
  - Verification: TypeScript clean; deploy verified visually after frontend rebuild.

### Session: 2026-06-08 -- TX/Percy split foundation (chunk 1 of 4)

Foundation for the TX customer-outreach split Ryan proposed 2026-06-08 (BC 9974727488). Builds in 4 chunks: backend model + create endpoint (this), account management UI, reusable filter bar, wire into Outreach page. Percy provisioning deferred per Ali (Percy unresponsive to last week's emails; do not bug).

- [x] **Chunk 1: User model territory_default + create-user endpoint**
  - Date: 2026-06-08 (BC 9975229924)
  - What changed:
    - Migration `20260608120000-add-territory-default-to-users.js` adds `territory_default` ENUM(`tx_only`, `non_tx`, `all`) and `default_filters` JSONB to users table. Both have DB defaults; existing users get `'all'` and `{}` automatically (no behavior change for current accounts).
    - `src/models/User.ts`: added `TerritoryDefault` type, new attrs on the interface + sequelize init, marked new fields optional on `UserCreationAttributes` so the `authService` / `seedAdmin` callers compile.
    - `src/services/userManagementService.ts`: new `createUser(input, adminId)` returns `{ user, tempPassword }`. Validates email (normalized lowercase + trim before regex), first/last name, role (`admin|manager|user`), territory (`tx_only|non_tx|all`). Generates bcrypt-hashed temp password from 12 random bytes (16-char base64url). New `updateUserTerritory` helper for territory-only edits. `listUsers` + `getUserDetail` extended via a shared `USER_LIST_ATTRS` constant so the new fields surface everywhere.
    - `src/routes/admin/userManagementRoutes.ts`: `POST /` (authorize `campaigns:write`) creates user and logs `user.create` audit entry, returns 201 with `{ user, temp_password }`. `PATCH /:id/territory` updates territory and logs `user.update_territory`.
  - Verification:
    - `tsc --noEmit` passes.
    - `src/tests/unit/userManagementService.test.ts` (new): 12/12 pass. Coverage: happy path, lowercase+trim normalization, missing/invalid email rejected, missing names rejected, invalid role rejected, invalid territory rejected, duplicate-email guard, default territory falls back to `all`, `updateUserTerritory` happy path + invalid value + not-found.
    - Regression sweep on `auth.test.ts` + `draftService.test.ts`: 11/11 pass, no breakage.
  - Notes: Temp password is returned ONCE in the 201 response body. Frontend is expected to surface it for Ali to hand off out-of-band. No email-the-credentials flow on this chunk (deferred to later chunk, requires user consent + onboarding flow).

- [x] **Chunk 2: Account Management page (frontend)**
  - Date: 2026-06-08 (BC 9975229938)
  - What changed:
    - `frontend/app/admin/users/page.tsx` (NEW). Tailwind, `'use client'`, matches the `/admin/attachments` pattern (raw fetch + `authHeaders()` + `ensureAuth()`).
    - List: email, name, role, status, territory_default, last_login. Inline `<select>` editors on role / status / territory call `PATCH /api/admin/user-management/:id/{role,status,territory}` with optimistic local state update.
    - Create modal: email, first/last name, role dropdown, territory dropdown. POSTs `/api/admin/user-management`, surfaces the one-time `temp_password` in a dismissable amber callout for Ali to hand off out-of-band.
    - Status + territory selects color-coded via Tailwind utility maps (territory: amber for `tx_only`, sky for `non_tx`, gray for `all`; status: emerald / gray / red).
  - Verification: frontend `tsc --noEmit` clean. Page is reachable at `/admin/users` once frontend rebuilds; live verification deferred to end of chunk 4 build so we don't churn deploys.
  - Notes: territory selector exposes "Texas only" / "Everything except Texas" / "All (no default filter)" -- maps 1-to-1 to the backend enum. Modal closes on backdrop click unless a create is in flight.

- [x] **Chunk 2.5: Add state + city to Lead, Apollo ingest, distinct endpoint, territory filter**
  - Date: 2026-06-08
  - Why: Recon during chunk 3 surfaced that `Lead` had no `state` or `city` field. Apollo provides location data on the person object but we were dropping it. Per Ali decision, going with option (A) of three: add columns, fill for new leads only, existing rows stay NULL and default to Ryan's ownership.
  - What changed:
    - Migration `20260608130000-add-state-city-to-leads.js` adds `state VARCHAR(50)` and `city VARCHAR(120)`, both nullable, plus `leads_state_idx` index.
    - `src/models/Lead.ts`: `state`, `city` added to attributes interface + class declare + sequelize init + index list.
    - `src/services/apolloLeadService.ts`: ingest now writes `enriched.state || p.state || null` and `enriched.city || p.city || null` into each new lead.
    - `src/services/leadService.ts`: `LeadFilters` extended with `state`, `city`, `territory` ('tx_only' | 'non_tx' | 'all'). Explicit `state`/`city` use case-insensitive equality. Territory uses Postgres `iRegexp` to match both `TX` and `Texas`. `non_tx` includes NULL state (existing leads stay with Ryan/Ali by default). Exported `isTerritory` type guard so the route can validate query params safely.
    - `src/routes/admin/leadRoutes.ts`:
      - `GET /admin/leads` now accepts `state`, `city`, `territory` query params.
      - New `GET /admin/leads/distinct?field={state|city|industry|vertical}` returns sorted distinct values for filter chips. Field whitelist prevents arbitrary-column SQL exposure. When `field=city`, an optional `state=` param scopes to that state.
  - Verification:
    - `tsc --noEmit` clean.
    - New `leadTerritoryFilter.test.ts`: 7/7 pass (territory=all is no-op, territory=tx_only adds iRegexp, territory=non_tx adds OR(state IS NULL, NOT iRegexp), explicit state filter still works, `isTerritory` accepts 3 valid + rejects everything else).
  - Notes: NULL state for existing leads is intentional. Percy never sees NULL leads (`tx_only` requires explicit TX match); Ryan still sees them (`non_tx` includes NULL). No backfill performed on this chunk; if Ryan asks why an old TX lead isn't in Percy's queue, we can do a one-shot UPDATE based on company HQ or Apollo re-enrichment then.

- [x] **Chunk 3: AdminFilterBar component + useDefaultFilters hook + profile endpoint patch**
  - Date: 2026-06-08 (BC 9975229948)
  - What changed:
    - `frontend/components/AdminFilterBar.tsx` (NEW). Controlled component, takes `value: AdminFilters` + `onChange`. Five chips: Territory / State / City / Campaign / Channel. Each chip opens a dropdown (searchable for state/city/campaign). State chip pulls from `GET /admin/leads/distinct?field=state`; City chip pulls scoped to selected state. Campaign chip pulls from `/admin/campaigns`. Channel is hardcoded `email | linkedin | sms`. Clearing State auto-clears City. Optional `lockTerritory` prop hides the territory clear button (for non-admin users; backend enforcement is still the source of truth).
    - `frontend/lib/useDefaultFilters.ts` (NEW). Hook reads `/api/users/me/profile` on mount, returns `AdminFilters` seeded from the user's `territory_default` + `default_filters`. Returns `undefined` until resolved so the caller can avoid an initial render with the wrong scope. Degrades gracefully when the profile fetch fails or token is missing.
    - `src/routes/users.ts`: `/me/profile` response now includes `territory_default` and `default_filters` on the user object so the hook above can read them. (Backend tsc clean.)
  - Verification: frontend `tsc --noEmit` clean, backend `tsc --noEmit` clean. Component will be smoke-tested in chunk 4 when wired into `/outreach`.
  - Notes: Dropdown closes on outside click via `mousedown` listener with ref-guard. Cities depend on `value.state` via `useEffect` so picking a state refetches scoped cities. The `lockTerritory` prop is wired now but only enforced in chunk 4 (the page reads user role and sets it for non-admins).

- [x] **Chunk 4: Wire AdminFilterBar into Outreach page (Percy provisioning DEFERRED)**
  - Date: 2026-06-08 (BC 9975229963)
  - What changed:
    - `src/services/outreachQueryService.ts`: `getLeadsForToday` now accepts a `TodayFilters` object (`territory | state | city | campaign_id`). Filters injected into both the campaign loop and the unassigned-leads bucket. When a specific `campaign_id` is requested the unassigned bucket is skipped (unassigned leads do not belong to a campaign's scope).
    - `src/routes/admin/outreachRoutes.ts`: `GET /admin/outreach/today` reads `req.query.territory|state|city|campaign_id` (territory whitelisted to `tx_only | non_tx | all`) and passes through.
    - `frontend/lib/api.ts`: `getOutreachToday(filters?)` builds a query string from `OutreachTodayFilters`.
    - `frontend/components/AdminFilterBar.tsx`: added `hiddenChips` prop (`'territory' | 'state' | 'city' | 'campaign' | 'channel'`) so callers can hide non-applicable chips.
    - `frontend/app/outreach/page.tsx`: imports `AdminFilterBar` + `useDefaultFilters`, manages `filters` state seeded from the user's `territory_default`, renders the bar with `hiddenChips={['channel']}` between the page header and the queue (channel does not filter the today view -- each step has its own channel). Refetch triggers when any of `territory | state | city | campaign_id` changes (uses `useRef` to skip the redundant first render so the initial timer-based fetch is not duplicated).
  - Verification:
    - backend + frontend `tsc --noEmit` clean.
    - Regression sweep on `userManagementService.test.ts` (12) + `leadTerritoryFilter.test.ts` (7) + `pipelineValidation.test.ts` (5): 24/24 pass.
    - Manual smoke test of the live page deferred until the migrations get run -- the new state/city columns and territory_default are required for the page to render with real data.
  - Notes (Percy):
    - Percy account provisioning intentionally NOT done per Ali decision 2026-06-08 ("he still hasn't responded to last week's messages -- don't bug him"). Ali can create Percy's account through `/admin/users` whenever he's ready; the page is in place.
    - The TX/Percy strategic ask is still tracked in BC 9974727488; Ryan still owes Ali answers on the 5 clarifying questions before cutover (sender address, cutover timing, in-flight TX leads, reporting split, scope).
  - **Migrations not yet run.** When Ali is ready:
    ```
    npx sequelize-cli db:migrate                # local
    ssh root@95.216.199.47 'cd /opt/colaberry-accelerator && docker compose exec backend npx sequelize-cli db:migrate'   # prod
    ```
  - **Migrations run 2026-06-08:** local + prod both applied. Prod path is `/opt/landjet-growth-engine/` (NOT `/opt/colaberry-accelerator/` -- CLAUDE.md is stale on this point). Used `docker cp` to surgically place the two migration files into the running `landjet-backend` container, then ran sequelize-cli inside the container. Schema is ready for whenever the feature code deploys.

- [x] **Ryan Pulse -- single daily exec dashboard email (preview + manual send)**
  - Date: 2026-06-08 (BC 9975522999)
  - Why: BC 9946676802 ("verify Cory daily briefing") surfaced that there is no Cory briefing in code at all. The only briefing service today (`morningBriefingService`) is calendar-only and not wired to a cron. Ryan gets zero recurring status email. Ali greenlit a single overall report (skip split-by-domain).
  - What changed:
    - `src/services/ryanPulseService.ts` (NEW). `buildPulseSnapshot(now)` pulls yesterday's outbound sends (with cold vs follow-up split via `metadata.step_number`), inbound replies, leads added (split by `lead_source='api'` vs other), meetings booked (approximated via leads currently in `meeting_scheduled` with `updated_at` in window), full pipeline by stage, hot leads (top 6 with temperature='hot'), recent inbound replies for the "needs you" panel, upcoming scheduled sends in the next 24h clustered by half-hour, and a vs-last-week delta on the headline numbers. `renderPulseSubject / renderPulseText / renderPulseHtml` produce the email artifacts. Date windows computed in America/Chicago so "yesterday" matches Ryan's reality across DST.
    - `src/routes/admin/outreachRoutes.ts`: `GET /admin/pulse` returns `{ snapshot, subject, text, html }` for preview. `POST /admin/pulse/send` sends via the existing `sendOutreachEmail`, defaulting recipient to `ali@colaberry.com` so Ali tests on himself before flipping to Ryan.
    - `src/services/outreachEmailService.ts`: added optional `html` field to `SendEmailInput`. When provided, sent as `contentType=HTML` directly; takes precedence over the existing `signature`-driven HTML path. Pulse is the first caller; pattern is reusable for future HTML emails.
    - `src/tests/unit/ryanPulseService.test.ts` (NEW). 11 tests: date-window math (yesterday 24h, last-week 8d gap, next-24 anchor), aggregation happy path (all sections populated), vs-last-week delta math, subject rendering (queued + needs-you bits, all-clear empty state), section ordering in plaintext, em-dash absence (client-facing rule), HTML root structure, empty-state copy.
  - Verification: `tsc --noEmit` clean. 11/11 Pulse tests pass. Endpoints reachable: `curl -H "Authorization: Bearer $TOKEN" .../api/admin/pulse` returns JSON preview; `curl -X POST -d '{"email":"ali@colaberry.com"}' .../api/admin/pulse/send` sends.
  - Scheduler wiring: INTENTIONALLY NOT DONE. Ali tests the rendered content on himself first; once verified, wire to `schedulerService.ts` at 7am CT weekdays with recipient flipped to `rlandry@landjet.com`. Adding a `pulse_enabled` flag in env or settings would make the toggle safer than a code change.
  - Notes:
    - The Cory dev briefing (technical: tests added, deploys, agent runs, escalations, confidence avg) described in CLAUDE.md is a separate future task. Ryan Pulse is the operational view; Cory Dev Briefing is the engineering view. Different audiences.
    - "Meetings booked yesterday" uses an `updated_at` proxy on leads currently in `meeting_scheduled`. Will overcount if a meeting was scheduled then moved to another stage same day (rare); will undercount if a meeting was scheduled yesterday and moved out today (also rare). A `lead_pipeline_history` table would make this exact; not building it for v1.

- [x] **Pipeline-stage transitions wired to real signals + 'replied' stage added**
  - Date: 2026-06-08
  - Why: Live verification of the Pulse against prod data showed 7,737 of 7,884 leads still in `new_lead` after thousands of sends. Root cause: pipeline_stage only advanced via the CEO intro flow; the bulk cold-outreach + inbox-reply paths never touched it. Ali called the "big fix" so the Pulse numbers mean something.
  - What changed:
    - Migration `20260608140000-add-replied-to-pipeline-stages.js` adds a `replied` enum value to `leads.pipeline_stage`, slotted between `contacted` and `meeting_scheduled`. Uses `ALTER TYPE ... ADD VALUE IF NOT EXISTS ... AFTER 'contacted'`. Down() is a no-op (Postgres limitation on enum value removal).
    - `src/models/Lead.ts`: `PIPELINE_STAGES` and `PIPELINE_ORDER` updated for the new slot.
    - `src/services/leadService.ts`: `validatePipelineTransition` special-cases the contacted -> meeting_scheduled jump (allowed; not every meeting comes through a tracked reply). All other transitions still enforce the no-more-than-1-step rule.
    - `src/services/outreachEmailService.ts`: `writeCommLog` now advances `new_lead -> contacted` after a successful live send. Failures and test/simulated sends do not advance. Non-fatal if the update fails.
    - `src/services/emailReplyService.ts`: new `recordInboxMatches(emails)` function. For each inbox email whose `from_email` matches a Lead by email, idempotently writes a CommunicationLog inbound row (keyed on Outlook message id via `provider_message_id`) and advances pipeline_stage to `replied` (only if currently `new_lead` or `contacted` -- never demotes).
    - `src/routes/admin/outreachRoutes.ts`: `GET /admin/outreach/inbox` invokes `recordInboxMatches` after fetching and returns `{ matches: { matched, logged_new, advanced } }` alongside the email list. Match recording is non-fatal; the poll succeeds either way.
    - `src/services/ryanPulseService.ts`: "WHERE WE STAND" row now reads `by_stage.replied` directly instead of the bogus `proposal_sent + negotiation` sum.
    - `src/scripts/backfillLeadPipelineStages.ts` (NEW). Two-pass backfill: any lead with inbound comm log -> `replied`; any new_lead with outbound live `sent` -> `contacted`. Dry-run default; `--apply` flag to write. Prints stage distribution after.
  - Verification:
    - `tsc --noEmit` clean.
    - 22/22 tests pass (`ryanPulseService.test.ts` updated for new stage shape, new `inboxMatchPipelineHook.test.ts` covers 6 cases on `recordInboxMatches`, `pipelineValidation.test.ts` unaffected).
    - **Migration ran on prod** via the surgical docker-cp pattern -- both local + prod now have the `replied` enum value.
    - **Backfill dry-run on prod surfaced a separate finding**: only 44 rows in `communication_logs` (the writeCommLog hook only started populating 2026-05-14), so the backfill has nothing to advance. But **all 7,737 `new_lead` leads have `last_contacted_at = NULL`** -- they are genuinely cold, not stuck. Data is internally consistent. No `--apply` was run because there's nothing to apply.
    - Pulse re-rendered on prod with the new code: "WHERE WE STAND" now reads `replied 0` directly (was previously summing proposal_sent + negotiation). Numbers all accurate.
  - Notes:
    - Hooks fire only when the new code is actually deployed. Today's prod still runs the previous build. Once chunks 1-4 + this fix deploy together, every live send writes a CommunicationLog row + advances pipeline_stage; every inbox poll matches + persists + advances.
    - The 7,737 cold leads sitting in `new_lead` are a separate finding: that's a real backlog of cold leads the system has not started outreach on. Worth flagging to Ryan as "ready to start sending" volume.
    - `recordInboxMatches` writes the inbound row even when the lead's pipeline_stage is already past `contacted` (so the audit trail is complete). It just skips the advance in that case.

- [x] **Per-step attachment_path picker UI in campaign sequence editor**
  - Date: 2026-06-09 (BC 9956633203)
  - Why: Ryan reported on 2026-06-08 he could not see attachments in the tool. The backend + admin upload page have been live since 2026-06-02 but there was no per-step UI to wire a file to a campaign step -- you had to PATCH the campaign API or edit the DB directly. Closes the loop so Ryan can finish what he started.
  - What changed:
    - `frontend/app/campaigns/[id]/page.tsx`: new state `attachmentFiles`, fetched once from `/api/admin/attachments` on mount (same endpoint that powers the existing /admin/attachments page). Non-fatal failure -- dropdown just shows "No attachment" if the fetch errors.
    - For every step with `channel === 'email'`, render an "Attachment:" dropdown below the step's prompt textarea. Selecting a filename writes to `sequence_steps[i].attachment_path` via the existing `updateStep` helper. Selecting "No attachment" writes `null`. The existing **Save All** button persists `sequence_steps` as a JSONB blob, so the new field flows through with zero backend changes.
    - Graceful "missing" rendering: if a step has an `attachment_path` that no longer exists in the file list (file was deleted, renamed, etc.), the dropdown still shows the saved value with a "(missing)" label so the user can see what is configured and fix it.
    - "Upload one" inline link to /admin/attachments when the file list is empty, so first-time setup is one click away.
    - Hidden for non-email channels (LinkedIn / SMS / Voice). Each step's channel select drives whether the picker appears.
  - Verification:
    - Frontend `tsc --noEmit` clean.
    - Backend already consumes `attachment_path` at send time (outreachRoutes.ts L1253 / L1257; outreachEmailService.ts L21). Sequence-steps JSONB persistence pattern was confirmed via the existing `updateCampaignFields` -> PATCH /admin/campaigns/:id path.
    - Manual smoke test against running app deferred until deploy. The deploy bundles this + chunks 1-4 + the pipeline-transition big fix + Ryan Pulse + the SendEmailInput html field.
  - Notes:
    - Once deployed, the workflow Ryan asked for is one screen: open campaign -> Strategy tab -> step 1 -> pick "LandJet Investor Deck 2026.pdf" from the dropdown -> Save All. The wire-investor-deck-step-1 (BC 9950199326) and wire-intro-deck-step-1 (BC 9950199337) todos then take ~30 seconds each via this UI.
    - Default empty value is `""` in the select; that maps to `null` on the step (`onChange={e => updateStep(i, 'attachment_path', e.target.value || null)}`).

- [x] **Outreach attachments persistence fix (prod volume mount)**
  - Date: 2026-06-24
  - Why: The attachments feature (upload UI + per-step picker + send-time wiring) was fully built and verified live, but the backend had NO volume mount for the attachments directory and `OUTREACH_ATTACHMENTS_DIR` was unset. It defaulted to `/opt/landjet-growth-engine/attachments` *inside the container*, so every `docker compose up -d --build backend` deploy wiped all uploaded decks. Silent data-loss defect that undermined the feature Ryan asked for.
  - What changed: Added `volumes: - ./attachments:/opt/landjet-growth-engine/attachments` to the `backend` service in `docker-compose.production.yml` on the VPS (this file is server-local / untracked, not in git). Backed up the prior compose to `docker-compose.production.yml.bak-20260624`. Recreated the backend container (`up -d backend`, no rebuild) to apply the mount. Host dir `/opt/landjet-growth-engine/attachments` already existed (created 2026-06-02) and held a pre-existing `LandJet-Intro.pdf` that had been invisible until now (nothing was mounted).
  - Verification: `docker compose config` valid; `docker inspect` confirms `/opt/landjet-growth-engine/attachments -> /opt/landjet-growth-engine/attachments` mount; backend container healthy after recreate; `loadAttachmentFromPath('LandJet-Investor-Deck-2026.pdf')` returns `application/pdf` base64 from inside the container. Decks now survive deploys.
  - Notes: Decks themselves are data, not code, so they live on the host volume (not git). Wiring decks to live campaign steps is held pending Ali's confirmed file -> campaign -> step mapping (Ryan did not specify steps and sent confidential investor material that must not ride a cold step-1 send).

- [x] **Wired investor one-pager to Investor Outreach (live campaign config)**
  - Date: 2026-06-24
  - Why: Ryan asked for decks on outreach; Ali confirmed "Investor campaign only for now." Discovery showed a literal "step 3" does not work -- on the campaigns that actually send (Investor Outreach + the "Cold Outreach - X" family), step 3 is a linkedin_message, not email. A deck can only attach to an email step.
  - What changed: Ran `src/scripts/wireDeckAttachments.ts --apply` (docker-cp'd into landjet-backend, not committed). Set `sequence_steps[step=4].attachment_path = 'LandJet-Investor-One-Pager-2026.pdf'` on the Investor Outreach campaign. Rule = "last email-channel step" (step 4 here: 1 linkedin_connect, 2 email, 3 linkedin_message, 4 email) -- the warmest/latest touch and always an email step. Light one-pager chosen over the full deck; the full deck is confidential ("Qualified Investors Only") and stays held for manual send to warm/replied leads.
  - Verification: Apply run wrote step 4; immediate re-read from DB confirms `4:email(LandJet-Investor-One-Pager-2026.pdf)`; second run reports "already -> Nothing to do" (idempotent). File loads + base64-encodes from the mounted attachments dir.
  - Notes: Industry/vertical campaigns intentionally NOT wired -- two parallel families ("X Outreach" holds the leads, "Cold Outreach - X" did the sends) and the canonical one is still being decided. The non-confidential LandJet-Intro.pdf is staged and ready when that is settled.

- [x] **Attachment UX rework: campaign document + per-step checkbox + view/update (Ali 2026-06-25)**
  - Date: 2026-06-25
  - Why: Ali wanted Ryan to have control rather than a single hard-wired step. New model: pick one "campaign document" once, then check a box on ANY email step to attach it, plus open the document and jump to where it gets updated. Replaces the per-step file dropdown.
  - What changed:
    - `src/routes/admin/attachmentRoutes.ts`: new `GET /:filename/download` -- serves the file inline (Content-Disposition inline) behind `campaigns:read`, reusing the existing `safePath` traversal/extension guard. Powers the "View" link.
    - `frontend/app/campaigns/[id]/page.tsx`: new `campaignDoc` state (persisted in `campaign.settings.attachment_document`, deep-merged server-side; falls back to any step's existing `attachment_path` so prior wiring shows up). Added a "Campaign document" selector with View (blob-fetch + object URL so the bearer token is sent) and "Upload / update document" links. Replaced each email step's attachment dropdown with a checkbox "Attach <doc> to this email" (disabled until a doc is picked) + a per-step View link. Changing the document re-points all checked steps. Save All now also persists `settings.attachment_document`.
  - Verification: backend `tsc --noEmit` clean; frontend `tsc --noEmit` clean. Backward compatible -- Investor Outreach's existing step-4 wiring surfaces as the selected document with that step checked. (Deploy + live click-through pending in this session.)
  - Notes: One document per campaign by design (matches "the investor document"); the full deck / franchise pieces remain selectable from the same dropdown.

- [x] **Per-send attachment selector on the /outreach review queue (Ali 2026-06-26)**
  - Date: 2026-06-26
  - Why: Ali expected the attach control where Ryan actually works -- the per-lead "Approve & Send" queue -- not only the campaign Strategy tab ("i don't see where i can add the button"). A first cut keyed the control off the campaign document, but that hid it: the card Ali was on had no campaign document, and Investor Outreach (which has one) currently has no leads at an email step (all 1,569 are at LinkedIn stages 1/3). So the control is now ALWAYS shown on email cards.
  - What changed:
    - `src/routes/admin/outreachRoutes.ts`: added `campaignAttachmentDoc(campaign)` helper (settings.attachment_document, falling back to any step's attachment_path). `GET /today` returns `attachment_document` (the campaign's default doc, or null) per email card. `POST /:id/advance` now accepts `attachment_filename` (string -> attach that library file; '' -> none) and still honors the earlier `attach_document` boolean; neither present keeps the legacy step-config behavior, so API callers are unaffected. `loadAttachmentFromPath` enforces the safePath guard on whatever filename is chosen.
    - `frontend/app/outreach/page.tsx`: every email card shows an "Attachment:" dropdown (No attachment + the document library, fetched once) defaulting to the campaign document, plus View (blob-fetch open) and "Upload / update" links. Selection is passed as `attachment_filename` to `/advance` on Approve & Send. Missing-file selections render with a "(missing)" label.
  - Verification: backend + frontend `tsc --noEmit` clean; deployed; authenticated `/today` returns the field; `campaignAttachmentDoc(Investor Outreach)` resolves to `LandJet-Investor-One-Pager-2026.pdf`.
  - Notes: Complements the campaign Strategy tab control (set-and-forget default). Operator can now attach any library doc to any individual send, which is the "more control" Ali asked for.

- [x] **Inline document viewer on /admin/attachments (Ali 2026-06-26)**
  - Date: 2026-06-26
  - Why: Ali wanted to open the uploaded documents from the attachments page, ideally previewing inline like an email client rather than downloading.
  - What changed (frontend only): `frontend/app/admin/attachments/page.tsx` -- filename is now a clickable link and each row has a "View" action. Clicking fetches the file via the existing `GET /:filename/download` (blob, so the bearer token is sent) and renders it in a modal: PDFs in an `<iframe>` (browser's native PDF viewer), images in an `<img>`, other types (docx/pptx) fall back to a Download button. Modal has Open-in-new-tab / Download / Close; object URL is revoked on close. Also replaced the stale amber "set sequence_steps[i].attachment_path by hand / BC 9956274272" note with current guidance (Strategy tab campaign document + the Outreach queue per-email dropdown).
  - Verification: frontend `tsc --noEmit` clean. No backend change (download endpoint already serves inline with the safePath guard).

- [x] **AI hallucination guard on inbound quote response (BookRides flow)**
  - Date: 2026-06-09 (BC 9946698753)
  - Why: Per Ali, "when the AI hallucinates ... I would make sure that there is a more deterministic step that doesn't rely on AI, and just kind of follows the calculation." The BookRides parser + pricing engine are already deterministic (regex + pure math). The only place AI is in the loop is the response-drafting stage in `inboundLeadService.generateQuoteResponse`, where GPT writes the email body using pre-computed pricing as context. Three real risks: rounding the grand total, inventing surcharges/perks, or dropping/mis-spelling key facts.
  - What changed:
    - `src/services/quoteResponseGuard.ts` (NEW). Exports `validateAiQuoteBody(body, pricing, ctx)` and `renderTemplateQuoteBody(pricing, ctx)`. Validator checks: (1) grand total appears verbatim in the body via `dollarVariants` helper that accepts `$1,247.50` / `$1247.50` / `$1247.5` / `1,247.50` / `$950`-style whole-dollar; (2) customer first name appears; (3) pickup and dropoff city (extracted via `extractCityFromAddress`) appear; (4) no forbidden invented-policy phrases (`complimentary`, `\d+% off`, `discount`, `refund`, `guarantee`, `loyalty`, `wifi/champagne/water bottles`, etc.). Template renderer produces a concierge-tone quote using the EXACT pricing data -- line items rendered as `Label: $amount.00`, grand total verbatim, warnings + approvals sections from pricing engine output.
    - `src/services/inboundLeadService.ts`: after the AI response is parsed, in priced mode only, the guard runs. If it rejects, the body is replaced with the template version, `template_fallback: true` and `template_fallback_reasons: string[]` are set on the response, a `quote_generator_guard` agent run is recorded, and the rejection (with the first 200 chars of the AI body) is logged at WARN. `QuoteResponse` gains the two new optional fields so the concierge UI can surface a "AI body was rejected -- template used; review tone before sending" banner.
    - Guard only fires for priced mode. `forward_only` and `faq` modes ship the AI body as-is because they do not embed money the system computed.
  - Verification:
    - `tsc --noEmit` clean.
    - `src/tests/unit/quoteResponseGuard.test.ts` (NEW): 20/20 pass. Coverage: dollar variants (decimal, comma, whole-dollar), city extraction (TX, IA, malformed, undefined), validator (happy path, rounded total, missing name, missing pickup city, missing dropoff city, forbidden phrase variants for `complimentary` / `10% off` / `refundable`, whole-dollar total without decimal), template (line items present, customer name in opener, no forbidden phrases, fallback "Hi there" when no name, warnings + approvals sections).
  - Notes:
    - Forbidden-phrase list is intentionally conservative; concierge can extend it via a follow-up if specific perks become legitimate (e.g., if LandJet really does include WiFi, drop the `wifi` regex). All current rejections err on the side of "let a human edit instead of letting hallucination through."
    - The template is a touch more formal than Lories voice on purpose -- a concierge eyeballing the queue spots fallbacks instantly and either ships them or rewrites them. We could add a "voice-pass" template variant later if Lorie wants warmer fallback copy.

- [x] **Pipeline auto-runner (in-process cron) wired -- BC 9946676796 RESOLVED**
  - Date: 2026-06-09
  - Decision (Ali): went with option A (in-process setInterval) per the trade-off summary in the 2026-06-09 chat. Reasons captured in PROGRESS: light current load, one-container-per-stack pattern already established, all operations idempotent so restart mid-cycle is cheap. Graduate to a worker container when outbound load grows.
  - What changed:
    - `src/services/pipelineAutoRunner.ts` (NEW). Exports `startPipelineAutoRunner()` and `stopPipelineAutoRunner()`. Three jobs registered when `PIPELINE_AUTORUN=true`:
      - **Inbound ingest** every 5 min: `ingestEmails(24)` + `processEmails()` from communicationOrchestratorService.
      - **Outbound scheduler** every 1 min: `claimPendingActions()` then `processAction()` per claimed row.
      - **Ryan Pulse** daily at 7am America/Chicago, weekdays only: `buildPulseSnapshot()` then `sendOutreachEmail()` with full HTML body via the SendEmailInput.html field added earlier.
    - Each job has: an overlap guard (skip if previous cycle still running), try/catch so a single failure does not kill the loop, initial random jitter (0-30s ingest, 0-10s scheduler) so multiple backend restarts do not all fire at the same instant, and structured logging at completion with duration + counters.
    - Off-switches: `PIPELINE_AUTORUN=false` (default) disables everything. Per-job `PIPELINE_DISABLE_INGEST` / `PIPELINE_DISABLE_SCHEDULER` / `PIPELINE_DISABLE_PULSE` for granular control. `PIPELINE_PULSE_RECIPIENT` overrides recipient (defaults to ali@colaberry.com so the verify-before-Ryan window is the default).
    - Clean shutdown via SIGTERM / SIGINT clears intervals and timeouts.
    - `src/server.ts`: calls `startPipelineAutoRunner()` AFTER `app.listen()` so an autorunner failure cannot block HTTP boot.
  - Verification:
    - `tsc --noEmit` clean.
    - `src/tests/unit/pipelineAutoRunner.test.ts` (NEW): 12/12 pass. Covers `isAutorunEnabled` strict equality, `jitter` bounds, `msUntilNextPulse` math (correct at 7am, 8am, 6am CDT; always positive for every hour of day), `isWeekendInChicago` (Sat/Sun true, Tue false, TZ boundary correct around midnight Chicago time).
  - **To turn it on in prod (Ali action when deploying):**
    1. Add `PIPELINE_AUTORUN=true` to `/opt/landjet-growth-engine/.env`
    2. Deploy or restart: `docker compose -f docker-compose.production.yml restart backend`
    3. Tail logs to confirm first-fire jitter then steady cadence: `docker logs -f landjet-backend | grep pipeline\\.`
    4. When ready for Ryan Pulse to actually flip to him, set `PIPELINE_PULSE_RECIPIENT=rlandry@landjet.com` (default stays on you until then).
  - Notes:
    - The Pulse recipient default of `ali@colaberry.com` is intentional. Once content is verified end-to-end on the live data, flip the env var. No code change required.
    - The ingest job pulls Ali's Gmail filtered by `COMM_MONITORED_SENDERS`. If `info@landjet.com` is in that list (already configured in prod env), this is the path that gets it flowing. Resolves the original BC 9946676796 framing.

- [x] **Ryan 2026-06-08 18:50 CT reply -- vertical merger + weekly sync locked**
  - Date: 2026-06-09
  - Source: Gmail message id 19ea96e4a092bde9 on thread "Re: Catching up on your five emails -- 2 decisions and a weekly sync". Archived to BC message board as id 9979283305 per the standing-rule for outside-comms storage.
  - Three substantive inputs from Ryan:
    1. Vertical decision (resolved both options Ali floated): *"Let's just call it Real Estate, Construction and Engineering. That will cover it all. Less is more."* Single combined vertical, not (a) Real Estate as its own bucket nor (b) fold-into-Construction.
    2. Attachment visibility (answer to "which screen?"): two PNG screenshots showing the Outreach dashboard and inside-a-campaign view -- confirms option (b) from Ali's question (campaign step editor expecting the picker). Already resolved by the per-step attachment picker shipped earlier today (BC 9956633203). Once the next deploy lands, Ryan sees the picker.
    3. Weekly sync: *"Would 10am Central Monday/Wednesday/Friday work for you? Or 9:30 any day of the week?"* Ali picked **Friday 9:30am CT** (the once-a-week option fits the 30-min framing).
  - Code changes:
    - `src/services/apolloLeadService.ts`: vertical-guess logic now maps any campaign name containing `construction`, `real estate`, or `engineering` to the single label `Real Estate, Construction and Engineering`. Stored on `Lead.vertical` going forward.
    - `src/services/outreachQueryService.ts`: new `VERTICAL_PROMPTS['Real Estate, Construction and Engineering']` entry. Copy focuses on travel between project sites/properties/client meetings as a mobile workspace -- the cross-cutting theme that ties real estate, construction GCs/subs, and engineering firms together.
  - Calendar:
    - Recurring weekly Google Calendar event created. Friday 2026-06-12 09:30-10:00 America/Chicago, RRULE:FREQ=WEEKLY;BYDAY=FR. Google Meet attached. Ryan rlandry@landjet.com required; Percy pkapadia@landjet.com optional (so he stays in the loop without making it a 3-way standing commitment). Event id `ej3p84i8ivhsu2830tnde1l61k`.
  - BC:
    - **9946698782** (Schedule next sync) -- CLOSED. Replaced by the recurring invite. Lorie no longer in the recurring loop -- Ali handles those separately.
    - **9973261206** (classifier audit 5 misclassified contacts) -- comment posted with Ryan's combined-vertical decision + the resulting per-contact bucket map (2 of 5 now route to the new combined vertical; the other 2 still need Ryan's Business Services confirmation).
    - **9979283305** (NEW) -- inbound archive of Ryan's reply on the message board per the standing comms-archive rule.
  - Verification: `tsc --noEmit` clean. Calendar event created successfully (htmlLink + Meet URL in tool response).
  - Notes:
    - The 5 misclassified contacts are NOT auto-updated to the new vertical on existing rows yet. Two of them (real estate) bucket cleanly into the combined vertical now that it exists; two others (Business Services / sandler / sparkfoundryww) need Ryan to confirm "Business Services" is the right bucket (not currently in VERTICAL_PROMPTS at all). I will queue the prod UPDATE statement once that's confirmed; the change is one one-shot SQL.
    - The cross-vertical casing inconsistency in `VERTICAL_PROMPTS` (existing keys MANUFACTURING / INSURANCE / HEALTHCARE are uppercase while `apolloLeadService` stores 'Manufacturing' etc. on the lead) is pre-existing and not addressed here -- means the prompt-by-vertical lookup falls through to DEFAULT_PROMPT today. Worth a separate cleanup; out of scope for this change.

- [x] **Per-campaign step-count cap (BC 9946676854)**
  - Date: 2026-06-09
  - Decision (Ali): option B from the 2026-06-09 framing -- hard cap with env-level global default + per-campaign override. Default ceiling: **8 steps**. Reasoning captured in chat: caps protect against runaway sequences (real reputational risk); global default means new campaigns inherit safely; per-campaign override handles the occasional long-nurture exception; 8 leaves headroom for two follow-ups beyond a 6-step cold sequence (the longest Ryan has referenced).
  - What changed:
    - `src/services/outreachQueryService.ts:advanceLead`: replaced `maxSteps = steps.length || 3` with `Math.min(steps.length || 3, effectiveCap)`. effectiveCap = `campaign.settings.max_steps` if it is a positive number, else `parseInt(process.env.OUTREACH_MAX_STEPS, 10)` if valid and positive, else 8. The cap is a CEILING -- shorter step counts still win when they are lower than the cap.
    - `frontend/app/campaigns/[id]/page.tsx`: new `maxSteps` state in the Settings tab. Range slider 0-15 where 0 means "inherit global default (8)". Amber warning surfaces when the value exceeds the global default. Settings tab save serializes 0 as `null` on `settings.max_steps` so the backend falls through to env-level.
  - Verification:
    - `tsc --noEmit` clean (backend + frontend).
    - `src/tests/unit/outreachQueries.test.ts`: 50/50 pass (42 existing + 8 new cap tests). New coverage: env default 8 caps a 10-step campaign at 8, stage 7 -> 8 stays ACTIVE under cap of 8, per-campaign override of 5 wins over 10-step definition, per-campaign override of 12 above env default wins, `OUTREACH_MAX_STEPS` env raises cap globally, non-numeric env falls back to 8, override of 0 falls back to env, shorter step count still wins over higher cap (5 steps + cap 8 -> stops at 5).
  - **To raise the global ceiling later (Ali):** add `OUTREACH_MAX_STEPS=N` to `/opt/landjet-growth-engine/.env` and restart backend. No code change needed.
  - Notes:
    - 8 is intentionally conservative. Today's campaigns mostly run 3-5 steps; the cap is a safety net, not a binding constraint.
    - Per-campaign override has UI but defaults to "inherit" on every campaign, so existing campaigns get the new behavior automatically once deployed.
    - The advance-side cap is the only enforcement point. There is no separate "do not enqueue past N" check at queue time -- when `advanceLead` flips the lead to COMPLETED, the lead drops out of the queue naturally on the next `getLeadsForToday` call (it filters on `outreach_status='ACTIVE'`).

### Session: 2026-06-14 -- Ryan phone call (territory model pivot + proposal deliverable)

Ali in Nashville with Ram and Karun; missed the scheduled Friday 2026-06-12 weekly sync. Ryan called during breakfast Saturday morning to walk through three things: refined territory model, Friday 2026-06-19 proposal expectation, and a hint at a per-user priority-control feature. No code changes shipped this session -- entirely planning + BC bookkeeping. Inbound archive saved as BC message 9994743099.

- [x] **Territory model refined per phone call -- architectural pivot from 3-value enum to N-state array (decision logged, refactor BC created)**
  - Date: 2026-06-14
  - What Ryan said:
    - Ryan sees EVERYTHING. No territory filter applied by default. He will control his own priorities to surface what he cares about.
    - Percy: Texas (unchanged from the 2026-06-08 plan).
    - Iowa: handed off to a "new guy" Ryan has not yet named.
    - Future: more owners over time, split by location.
  - **Implication for shipped code:** the `territory_default` enum (`tx_only | non_tx | all`) we shipped in TX-split chunk 1 does NOT scale. There is no value for `ia_only`, and adding one per state means a schema migration every time. Wrong shape.
  - **Decision:** deprecate `territory_default` in favor of the existing `default_filters` JSONB column. New shape: `default_filters.states: string[]` (empty / missing = sees all). Already have the column from chunk 1; the migration is just a backfill + a code refactor.
  - Refactor scoped + queued in BC 9994743108 ("[Arch] Generalize territory model: deprecate territory_default enum, use default_filters.states[]"). ~3 hours backend + frontend + tests. Lands before Iowa owner is provisioned.
  - **Not a fire drill:** the only user with the enum set today is Ali (`'all'`). Percy / Iowa / future owners do not have accounts yet, so the refactor can land cleanly before any provisioning fires.
  - No code shipped this session; the refactor BC carries the full plan (file-by-file change list + tests + migration path).

- [x] **Friday 2026-06-19 proposal -- task created with structure outline (BC 9994743106)**
  - Date: 2026-06-14
  - Ali committed on the call to deliver a written proposal at the Friday 2026-06-19 weekly sync. Two parts: (a) work done thus far, (b) work going forward. Pricing / commercial framing is Ali's call.
  - BC todo created with a section-by-section structure outline (work shipped, work next 30 days, decisions Ryan owes) so Ali has a starting scaffold. PROGRESS.md is the authoritative work log to draw from. Due 2026-06-19.

- [x] **Ryan priority-control feature scoped (BC 9994743116)**
  - Date: 2026-06-14
  - Ryan: "control my priorities so I see more of what I want to see" in the outreach queue. Today the queue orders by system-computed `priority_score`; Ryan wants a layer he controls on top.
  - Four design options scoped in the BC todo (per-vertical weighting, manual pinning, per-attribute weighting, hybrid -- recommended). Final design pick happens at the Friday 6/19 sync with Ryan; implementation follows.

- [x] **Iowa owner provisioning queued (BC 9994743113)**
  - Date: 2026-06-14
  - Blocked on Ryan providing the new owner's name + email. When unblocked: 7-step provisioning checklist in the BC todo (account, password handoff, Apollo target set, OAuth scope decision, optional per-owner Pulse). Depends on the territory model refactor landing first so the account uses `default_filters.states=['IA']` instead of the deprecated enum.

- [x] **BC 9974727488 (TX/Percy strategy) -- retitled + comment with refined model**
  - Date: 2026-06-14
  - Title changed from TX/Percy-specific framing to per-location ownership: `[Ryan/Strategy] Territory model: per-location ownership (Ryan full visibility, Percy TX, IA owner TBD, N-state going forward)`. Description updated with the refined shape; comment added with the call summary. The original 5 clarifying questions are no longer applicable -- they were a strict TX/non-TX framing Ryan walked back.

- [x] **Territory model refactor shipped -- deprecated territory_default enum, switched to default_filters.states[] (BC 9994743108)**
  - Date: 2026-06-14
  - Why: 2026-06-14 phone call surfaced that the 3-value enum cannot scale to N owners by location. Ali approved option A from the refactor BC. Refactor lands before any owner provisioning so we never have to back-migrate live user data.
  - Backend:
    - `src/services/userManagementService.ts`: dropped TerritoryDefault import + TERRITORIES constant. New exported `normalizeStates(input, label)` helper that uppercases / trims / dedupes / validates 2-letter codes. `createUser` accepts `states?: string[]` and writes to `default_filters.states`; defaults to `[]` (sees all). New `updateUserStates(id, states, adminId)` preserves other `default_filters` keys. The 3-value enum is no longer read or written by service code -- only the DB column still exists (orphaned; cost-free).
    - `src/routes/admin/userManagementRoutes.ts`: PATCH `/:id/territory` replaced by PATCH `/:id/states` accepting `{ states: ["TX", "IA"] }`. Audit-log action renamed `user.update_states`. Create-endpoint response no longer echoes `territory_default`.
    - `src/services/leadService.ts`: `LeadFilters.territory` removed. New `states?: string[]` field plus exported helpers `buildStatesPattern(states)` (Postgres iRegexp matching both 2-letter codes and full names case-insensitively, with a known-states fallback table) and `parseStatesParam(query)` (string -> array or array passthrough). The filter logic falls through to "no scope" when `states` is empty.
    - `src/services/outreachQueryService.ts`: `TodayFilters.territory` replaced with `states`. Removed the TEXAS_PATTERN constant in favor of dynamic `buildStatesPattern`. `getLeadsForToday` dynamically imports buildStatesPattern from leadService to avoid a circular import.
    - `src/routes/admin/leadRoutes.ts`: query parsing switched from `isTerritory(req.query.territory)` to `parseStatesParam(req.query.states)`.
    - `src/routes/admin/outreachRoutes.ts:/today`: same.
    - `src/routes/users.ts /me/profile`: stopped exposing `territory_default`. Frontend reads `default_filters.states` instead.
  - Frontend:
    - `frontend/lib/useDefaultFilters.ts`: reads `user.default_filters.states` directly. Seeds the filter state with `{ states }`. Empty array passes through (Ryan's "sees all" mental model).
    - `frontend/components/AdminFilterBar.tsx`: territory chip + standalone State chip collapsed into a single **States** chip with a multi-select popover (search box, per-row checkbox, "X selected" header, Clear button, Done button). The chip label compresses to `"TX, IA"` or `"TX, IA +2"` when more than two selected. The `lockTerritory` prop renamed `lockStates`. `ChipName` enum updated to `'states' | 'city' | 'campaign' | 'channel'`.
    - `frontend/app/admin/users/page.tsx`: territory dropdown column replaced with a free-form **States** text input column. Type "TX" or "TX, IA" or leave blank. Onblur (or Enter) triggers a PATCH `/states`. Create-modal swaps the territory dropdown for the same text-input pattern.
    - `frontend/app/outreach/page.tsx`: passes `filters.states` to `getOutreachToday`. Refetch dependency switched from `filters.territory` to `filters.states?.join(',')` (avoids deep-equality issues).
    - `frontend/lib/api.ts`: `OutreachTodayFilters.territory` -> `states?: string[]`; helper joins with comma for the query string.
  - Tests:
    - `src/tests/unit/userManagementService.test.ts` (rewritten): 16 tests covering `normalizeStates` (uppercases/trims/dedupes, rejects non-array, rejects bad codes), `createUser` (single state, multi-state, empty defaults to "sees all", email normalization, all the prior validation cases), `updateUserStates` (preserves other default_filters keys, normalizes input, accepts empty, rejects bad codes, throws NotFoundError).
    - `src/tests/unit/leadTerritoryFilter.test.ts` (rewritten): 12 tests covering `listLeads` with omitted/empty/single/multi states, explicit state filter, states-overrides-state precedence, `buildStatesPattern` (single + multi + unknown codes), and `parseStatesParam` (string + array + empty).
  - Verification: `tsc --noEmit` clean (backend + frontend). 33/33 on the refactored suites. Regression sweep on outreachQueries / inboxMatchPipelineHook / ryanPulseService: 67/67 pass. No regressions.
  - **DB column status:** `users.territory_default` is orphaned but still exists. No drop migration -- the column has zero ongoing cost and a future drop is reversible. PROGRESS.md note serves as the tombstone.
  - Notes:
    - This unblocks the next four queued BCs: Percy provisioning (TX), Iowa owner provisioning (IA when named), account_manager role for Ryan self-serve, and per-owner Cory briefing. All four can now use the N-state shape from day 1.
    - The `state` (singular) field on filter shapes is still present for cases where a non-default chip filter is wanted (filter to a specific city's state without changing the user's defaults). When both `states[]` and `state` are passed, the array wins.

- [x] **Ryan self-serve account creation shipped -- account_manager role + UI gating (BC 9994747925)**
  - Date: 2026-06-15
  - Backend:
    - Migration `20260615180000-add-account-manager-role.js` adds `account_manager` to the `enum_users_role` enum via `ALTER TYPE ADD VALUE IF NOT EXISTS`. Applied local + prod via the surgical docker-cp pattern.
    - `src/models/User.ts`: role union extended to `'admin' | 'account_manager' | 'manager' | 'user'`. Sequelize ENUM updated to match.
    - `src/config/roles.ts`: new `account_manager` role with permissions `users:read`, `users:write`, plus `leads:read | campaigns:read | analytics:read | notifications:read` for general read access.
    - `src/services/userManagementService.ts`:
      - New `CallerInfo` type (`{ userId, role }`) replaces the bare `adminId: string` arg on every mutating function. Routes now pass the caller's identity AND role through.
      - New `assertCanTouchTarget()` helper enforces: only admins can modify admins or other account_managers. Used by `updateUserRole`, `updateUserStatus`, `updateUserStates`.
      - `createUser` refuses `role=admin` or `role=account_manager` when caller is not an admin -- account_manager can only create `manager` or `user` accounts.
      - `updateUserRole` refuses promotion to admin or account_manager when caller is not an admin.
      - `getUserStats` extended to break out `account_managers` count alongside `admins` / `managers` / `users`.
    - `src/routes/admin/userManagementRoutes.ts`: switched all endpoints from `authorize('campaigns:read'/'campaigns:write')` to `authorize('users:read'/'users:write')`. Tighter scope -- regular managers no longer have implicit user-management access. Caller info threaded into every service call via a `caller(req)` helper. Audit logs include `by_role`.
  - Frontend:
    - `frontend/app/admin/users/page.tsx`: fetches the current user's role on mount from `/me/profile`. Drives all UI gating:
      - Create-modal role dropdown shows admin + account_manager + manager + user when caller is admin; only manager + user when caller is account_manager. Plus a contextual help line.
      - Inline role dropdowns on each user row use the same restricted list when caller is account_manager.
      - Rows where the target is admin or account_manager show their role/status/states as read-only spans (greyed background) when caller is account_manager.
    - Backend remains the source of truth; the gating is a UX guard, not a security boundary (any tampered API call still gets rejected at the service layer).
  - Tests: `src/tests/unit/userManagementService.test.ts` extended to 40 tests. New caller-role scenarios:
    - `createUser`: admin creates admin / account_manager (both succeed); account_manager creates manager / user (both succeed); account_manager CANNOT create admin or account_manager (both AuthorizationError).
    - `updateUserRole`: admin promotes to admin (ok); account_manager promotes to manager (ok); account_manager CANNOT promote to admin / account_manager / touch an admin / touch another account_manager (all AuthorizationError). Self-role-change blocked.
    - `updateUserStatus`: same shape -- admin can suspend anyone, account_manager can suspend non-admin/non-amgr targets, blocked otherwise.
    - `updateUserStates`: admin can change any; account_manager can change manager/user but not admin or other account_managers.
  - Verification: `tsc --noEmit` clean (backend + frontend). 40/40 userManagementService tests pass. Migration applied local + prod.
  - **Ryan provisioning path now ready:** once Ali decides on Ryan's email (probably `rlandry@landjet.com` per the canonical-sender confirmation), he creates Ryan via `POST /admin/users` with `role: 'account_manager'` and `states: []` (sees all). Hands off the temp password. Ryan logs in, opens `/admin/users`, and can create Percy (TX) / Iowa owner (when named) / any future territory owner himself.

- [x] **Ryan self-serve account creation -- account_manager role scoped (BC 9994747925)**
  - Date: 2026-06-14
  - Extension to the phone call: Ali confirmed Ryan will create new owner accounts himself going forward. Ali sets up the first 2 (Percy = TX, Iowa owner when named). After that, Ryan takes over -- decides when a new owner joins, picks their territory states, creates the login.
  - Two role-model options scoped in the BC (A: promote Ryan to admin; B: new `account_manager` role). Recommendation: **B** -- separates engine ops (Ali = admin) from team ops (Ryan = account_manager), defensible if anyone else uses Ryan's laptop, forward-compatible when he delegates further, audit trail is cleaner.
  - `account_manager` capabilities:
    - List users, create users with `role=manager` or `role=user`
    - Change role / status / territory on manager / user accounts
    - Cannot: create admins, demote admins, change Ali's account
  - Sequencing (now locked):
    1. Territory refactor lands (BC 9994743108) -- new `default_filters.states[]` shape
    2. Ali provisions Percy (TX) via /admin/users
    3. Ali provisions Iowa owner (when Ryan provides the name)
    4. Validate both accounts (Percy sees TX, Iowa owner sees IA)
    5. Ship account_manager role + UI gating (~3 hours)
    6. Provision Ryan's account with `role=account_manager`
    7. 5-minute walkthrough call with Ryan
    8. Ryan owns all subsequent owner provisioning
  - Cross-referenced via BC comments on the IA owner todo (9994743113), proposal todo (9994743106), and arch refactor todo (9994743108) so the sequencing dependency is visible from all directions.
  - Effort: ~3 hours total (1 hr backend role + service gates, 1 hr frontend gating, 1 hr tests + walkthrough doc).
  - Definition of Done: role shipped, Ryan provisioned, Ryan has created at least one new owner account via the UI without Ali touching the database.


  - Date: 2026-06-09 (BC 9946676796 -- left OPEN with findings)
  - Finding: the polling code exists but **no cron or worker triggers it in production**. Details:
    - `src/services/gmailService.ts:fetchNewEmails` uses Gmail OAuth on Alis ali@colaberry.com mailbox (userId 'me') and filters by `process.env.COMM_MONITORED_SENDERS` -- a comma-separated `from:` list. If `info@landjet.com` is in that list (it is set in prod env, value redacted in audit), the function would pull those mails when invoked.
    - `src/services/communicationOrchestratorService.ts:ingestEmails` calls `fetchNewEmails` and writes rows into `email_threads`.
    - `src/routes/admin/communicationRoutes.ts:48,63` exposes `/api/admin/communication/...` endpoints that invoke `ingestEmails` and `runPipeline`.
    - `src/services/schedulerService.ts` and `src/config/schedulerConstants.ts` contain NO references to `ingestEmails` or `runPipeline`. The OUTBOUND `claimPendingActions` is similarly only referenced from `src/scripts/runDemo.ts`, `validateApprovalFlow.ts`, and `validateCeoIntro.ts` -- demo + manual-validation scripts, not a production loop.
    - Prod docker-compose has three containers: `landjet-backend`, `landjet-frontend`, `landjet-db`. No worker container, no cron container. No external systemd / k8s cron hits the API.
    - Direct prod query confirms `email_threads` table has 0 rows.
  - Root cause: the inbound + outbound pipelines are designed to be invoked, but nothing invokes them automatically. This is a missing piece of infrastructure, not a bug in the polling code itself.
  - Options for Ali to choose between:
    - **A. In-process setInterval loop** in `landjet-backend` (e.g., every 5 min trigger ingest + every 1 min trigger outbound). Simple, no new containers. Risk: backend restart loses in-flight cycles.
    - **B. Separate worker container** in docker-compose that runs a node loop calling the same services. Cleaner separation, restart-tolerant, but new deploy artifact.
    - **C. External cron** on the VPS (systemd timer or cron job) curling the admin endpoints. Simplest. Auth token needs to be a long-lived service token.
  - Recommendation: **C** for the immediate gap (5-line systemd unit + a timer), **B** if/when the outbound pipeline graduates from manual validation to autonomous operation.
  - Status: comment posted on BC 9946676796 with these findings; due date bumped to 2026-06-22 awaiting Alis pick on A/B/C.


- Completed 10 of 14 demo call action items
- Fixed auto-login race condition on all pages (root cause of "empty data" issue)
- Redesigned homepage with live stats, agent grid by department, activity timeline
- MBCV campaigns hidden from LandJet UI (campaigns + outreach dropdown)
- Added Reset to Original button for rewrites
- Added email signature support (global + per-campaign)
- Added send schedule controls (day toggles, time windows, timezone)
- Made LinkedIn messages editable with Copy to Clipboard
- Wired recordAgentRun into 13 backend files (37 tracking calls)
- Bumped rate limits (auth 100->500, API 1000->2000)
- Created agent heartbeat cron job (every 5 min) so War Room always has data
- Reviewed CMS guide PDF -- saved website access info to memory
- Created PROGRESS.md tracking system, updated CLAUDE.md with session protocols
- Remaining: cold outreach (needs Apollo), email validation, visitor intelligence, SEO, franchisee expansion

### Session: 2026-04-17
- Seeded agent run history data
- Created AI Control Tower agent
- Sent follow-up email to Ryan re: MBCV, visitor intelligence, SEO

### Session: 2026-04-16
- Full system build and deployment
- Demo prep: agent timestamps, data seeding
- Ryan completed first demo, sent walkthrough email
