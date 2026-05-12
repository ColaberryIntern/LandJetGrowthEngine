# PROGRESS.md
**LandJet Growth Engine -- Task Tracking & Session History**

Last updated: 2026-04-21

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
