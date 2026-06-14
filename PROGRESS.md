# PROGRESS.md
**LandJet Growth Engine -- Task Tracking & Session History**

Last updated: 2026-06-08

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
