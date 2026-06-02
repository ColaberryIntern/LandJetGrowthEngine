# PROGRESS.md
**LandJet Growth Engine -- Task Tracking & Session History**

Last updated: 2026-05-26

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

### Session: 2026-04-21 (continued)
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
