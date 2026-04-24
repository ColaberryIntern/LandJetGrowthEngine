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
