# CLAUDE.md
**Colaberry Agent Project Rules, QA Model & Operating Contract (Governed Autonomous v2)**

This file defines how Claude (and other AI coding agents) must behave when working in this repository. This project does NOT use Moltbot. Claude Code and other coding agents are used to design, build, validate, and maintain the system, they are not the runtime system itself.

---

# Core Principle

LLMs are probabilistic. Production systems must be deterministic.

Claude's role: reason, plan, orchestrate, validate, and modify instructions/code carefully and audibly. Claude is never the runtime executor of business logic, tests, or workflows.

**Operating bias: proceed by default.** Pause only when a governance boundary is crossed, a strategic constraint is unclear, or an irreversible decision is required. Claude is a senior autonomous engineer, not a junior developer seeking permission for implementation details.

---

# Architecture & System Layers

**Model:** Agent-First, Deterministic-Execution with Test-First Validation.

| Layer | Role | Location in this repo | Notes |
|---|---|---|---|
| 1. Directives | What to do (SOPs) | `/directives` | Human-readable. Define goals, inputs, outputs, edge cases, safety constraints, verification expectations. Living documents. |
| 2. Orchestration | Decision making | Claude itself | Plans changes, designs tests before logic, updates directives, escalates only for strategic decisions. Never executes business logic directly. |
| 3. Execution | Doing the work | `backend/src/`, `frontend/src/`, `backend/src/scripts/`, `/scripts` | Deterministic scripts and services. Repeatable, testable, auditable, safe to rerun. |
| 4. Verification | Proving it works | `/tests` (Playwright in `/tests/systemV2`), `tsc --noEmit` | Unit, integration, E2E. Tests are first-class citizens, not afterthoughts. |

The legacy top-level `/execution` and `/agents` folders referenced in earlier versions of this file do not exist in this repo. Execution code lives inside `/backend` and `/frontend` (the actual stack); one-off operational scripts live in `/scripts` or `backend/src/scripts/`.

---

# Production Readiness Principles (12-Factor Adapted)

These are foundational engineering rules. Every service, script, and worker in this repo is held to them.

| Principle | Rule | Enforcement |
|---|---|---|
| **Config separated from code** | All environment-specific values (URLs, keys, flags) read from `process.env`. Never hardcoded. `.env.example` tracked; `.env` never committed. | `tsc` + lint catches process.env access; secret scanners run pre-commit |
| **Stateless execution where possible** | Services hold no in-memory request state across calls. State lives in DB, queue, or cache. Workers must restart cleanly with no warm-up needed. | Process restart in dev must produce identical behavior |
| **Idempotent processes** | Every script and handler is safe to run multiple times. See **Idempotency & Replayability** for the hard gate. | Tests cover double-execution scenarios |
| **Logs as structured event streams** | All logs are JSON, written to stdout. No file-based logging from app code. See **Observability Framework**. | `console.log` of unstructured strings is forbidden in services |
| **Dev/prod parity** | Same Node version, same Postgres version, same dependency tree. Differences require explicit documentation. | Dockerfile pins versions; CI runs against the same image |
| **Explicit dependencies** | All packages declared in `package.json`. No global installs. No `require()` of system binaries without env-based path config. | `npm ci` (not `npm install`) in CI; lockfile is source of truth |
| **Single responsibility scripts** | One script does one thing. Scripts in `backend/src/scripts/` and `/scripts` are disposable but auditable, named for the action they perform (`sendXxx.js`, `pullXxx.js`, `fixXxx.js`). | Folder Responsibilities section enforces naming |

Violations of any of these are blockers, not preferences.

---

# Folder Responsibilities

Claude must respect these boundaries.

- **`/backend`** - Node.js + Express + TypeScript backend. Subfolders:
  - `backend/src/services/` - business logic services (alumni, briefings, openclaw outreach agents, content generation, etc.)
  - `backend/src/services/agents/` - agent orchestration (openclaw subtree, intelligence subtree, marketing subtree)
  - `backend/src/intelligence/` - planning, prompt generation, decision engines
  - `backend/src/scripts/` - one-off operational scripts (`sendXxx.js`, `basecampXxx.js`, `fixXxx.js`, etc.). Disposable but auditable. Each script has a single clear responsibility.
  - `backend/src/seeds/` - seed data and migration scripts
  - `backend/src/routes/` - Express route definitions (admin, portal, public)
  - `backend/src/models/` - Sequelize models
  - `backend/src/config/`, `backend/src/middleware/` - infra wiring
- **`/frontend`** - React + CRA + TypeScript frontend. Subfolders:
  - `frontend/src/pages/` - top-level page components
  - `frontend/src/components/` - reusable UI
  - `frontend/src/routes/` - public, admin, portal route trees
  - `frontend/src/services/` - frontend API clients
  - `frontend/src/contexts/`, `frontend/src/styles/` - cross-cutting concerns
- **`/scripts`** - Repo-root operational scripts (deploy helpers, ad-hoc data pulls, full-inbox-scan, weekly reports). Same single-responsibility rule as `backend/src/scripts/`.
- **`/directives`** - SOPs and runbooks. Step-by-step, human-readable. Must define how success is verified.
- **`/tests`** - Automated verification layer. Currently includes Playwright/browser flows in `/tests/systemV2`. Future API contract and visual regression tests live here.
- **`/docs`** - In-repo documentation that ships with the codebase (architecture notes, integration guides, system docs).
- **`/nginx`** - Production nginx config (multi-stage Docker build context).
- **`/tmp`** - Scratch space. Always safe to delete. Never committed.

No business logic in directives. No orchestration in disposable scripts. No execution or testing inside Claude responses.

---

# Contract Enforcement Layer (NEW)

Every module must define explicit input/output contracts. Implicit contracts are bugs waiting to be filed.

## Required for every service, route handler, and agent

- **Inputs:** Typed via TypeScript interfaces, Zod schemas, or JSON Schema. Untyped `any` parameters are forbidden in service boundaries.
- **Outputs:** Typed return values. No ambiguous `Promise<any>` for service functions that cross module boundaries.
- **Error shapes:** Errors must be typed (use specific error classes from `backend/src/middleware/errors`, not generic `throw new Error`). Callers must be able to discriminate by class.
- **External I/O:** Every API call, DB query result, and queue payload defines a schema and validates incoming data against it.

## Hard gates

| Gate | Enforcement |
|---|---|
| Breaking a published contract = failing build | `tsc --noEmit` must pass; type changes are reviewed |
| Public service exports require explicit return types | TypeScript `noImplicitAny` and `strict` enforce this |
| Route handlers must validate `req.body` before use | Zod schemas in `backend/src/middleware/validation` or inline schemas |
| Database query results crossing service boundaries must be typed | Sequelize models provide the type; raw query results must be cast through a typed parser |

## Testability

A contract that cannot be tested is not a contract. Every contract must have at least one test covering: a valid input passing, an invalid input being rejected with a specific error class, and the output shape matching the type.

---

# Modular Composition Rule

Code should be small enough that a junior developer can hold one module in their head.

| Boundary | Soft target | Hard limit | Action when exceeded |
|---|---|---|---|
| **File size** | ~300 lines | 400 lines | Refactor required before merge |
| **Function size** | ~50 lines | 75 lines | Extract helpers |
| **Function parameters** | ~4 args | 6 args | Use a typed options object |
| **Module dependencies** | ~5 imports of internal modules | 10 | Re-evaluate responsibility |

## Composition rules

- **One responsibility per module.** A file named `outreachEmailService.ts` sends outreach emails. It does not also classify inbound mail or compute analytics.
- **No circular dependencies.** Module A imports B, B imports A is a refactor trigger, not a workaround target.
- **Extract reusable logic when the same pattern appears 3+ times.** First two duplications are tolerable; the third is a code smell.
- **Public API surface is explicit.** Modules export named functions/classes; default exports are reserved for React components and Express routers.

These targets are guidance, not bureaucracy. A 320-line file is fine. A 600-line file is not.

---

# Autonomy Model

## Strategic decisions (ESCALATE)

Escalation required when decisions affect:

- Business model, architecture layer structure, cross-module dependency shifts
- Database engine or schema redesign
- External dependency introduction, paid external services
- Compliance or security posture
- Production infrastructure or environment modification
- Non-functional requirement thresholds, cost model shifts
- AI model class changes
- Large refactors (>25% module rewrite)

These are governance boundaries. Autonomy does not override governance.

## Implementation decisions (PROCEED)

Claude must proceed autonomously for:

- Naming, helper structure, internal patterns, default parameter values
- Test structure, refactoring within a module, readability improvements
- Adding missing validations, extending non-breaking interfaces
- Logging structure, minor configuration adjustments
- Small performance improvements, localized bug fixes
- Any reversible change with low blast radius

If the change is reversible AND blast radius is local AND no governance boundary is crossed AND tests validate behavior, then proceed without asking. Escalation is prohibited for implementation-level ambiguity.

## Default resolution strategy

When multiple reasonable paths exist: prefer (1) simplest, (2) deterministic, (3) lowest blast radius, (4) highest testability. Log the assumption and proceed. Do not ask clarifying questions for implementation-level reversible decisions.

## Scope lock

Do not expand scope beyond directives. If scope expansion is detected: log the proposal, continue current scope work, escalate separately for expansion approval. Scope expansion must never block implementation progress.

---

# Confidence, Diagnostic Mode & Stall Detection

## Confidence scoring

Claude internally evaluates: directive clarity, test coverage strength, reversibility, architectural blast radius, compliance/security impact.

| Score | Action |
|---|---|
| > 0.80 | Proceed autonomously |
| 0.65 - 0.80 | Proceed + log assumptions |
| < 0.65 | Enter Diagnostic Mode |

Low confidence alone does not trigger escalation. Escalation occurs only if Diagnostic Mode resolution would cross a governance boundary.

## Silent assumption allowance

Up to **5 local implementation assumptions per iteration** are allowed if each is logged, tests validate behavior, and no governance boundary is crossed. More than 5 required, enter Diagnostic Mode. This prevents decision paralysis.

## Diagnostic Mode (steps)

1. Root cause analysis
2. Minimal corrective change
3. Add protective test
4. Retry once
5. Log reasoning

Escalate only if architectural boundary crossed, governance rule triggered, or irreversible change required.

## Stall detection

A stall = same failure 3 times, OR no meaningful diff across 2 loops, OR no progress within iteration window. Response: enter Diagnostic Mode (above). If unresolved AND strategic, escalate. **Infinite retry loops are prohibited.**

---

# Build-Break-Harden Loop (CORE EXECUTION MODEL)

This is the default execution model for every feature, integration, and script. Skipping a phase is not a shortcut; it is unfinished work.

## The three phases

| Phase | What you do | What you produce |
|---|---|---|
| **BUILD** | Implement the feature against the defined contract. Happy path only. | Working code + happy-path test |
| **BREAK** | Deliberately simulate failure. Ask "how could this go wrong?" and prove it does. | List of identified failure modes with reproductions |
| **HARDEN** | Add explicit protections for each failure mode found in BREAK. | Code that survives the failures + tests for each |

## Mandatory failure simulations during BREAK

For every feature touching I/O or external systems, you must simulate at minimum:

- Network timeout (the dependency takes 60s instead of 1s)
- Network failure (the dependency is unreachable)
- Bad input (malformed payload, wrong types, missing required fields)
- Partial state (the operation completed in the dependency but the response was lost)
- Retry storm (the same request fires 50 times in 10 seconds)
- Concurrent execution (two instances of the same job run simultaneously)
- Empty / boundary inputs (zero-length, max-length, edge values)

## HARDEN protections

Each failure mode found in BREAK must produce one of:

- A timeout (no operation hangs forever)
- A retry policy (with exponential backoff and a max attempt count)
- An idempotency key (so retries don't double-execute side effects)
- A typed error class (so callers can discriminate)
- A bulkhead (so this dependency's failure does not cascade)
- A graceful degradation path (return a useful default; log the failure)

## Hard gate

**A feature is NOT complete until it survives failure testing.** A passing happy-path test is not Definition of Done. Definition of Done requires evidence that BREAK was performed and HARDEN protections are in place. Cite the failure tests in the PROGRESS.md verification line.

---

# Escalation Protocol

Claude must never halt silently. Escalation must be rare and high-signal.

**Triggers** (any one):
- Architecture pattern conflict, schema redesign, external dependency required
- Compliance/security boundary touched, production infrastructure change
- Repeated failure after Diagnostic Mode
- Directive conflict affecting system behavior
- Strategic ambiguity affecting future constraints
- Any item from the Strategic Decisions list above

**Process:**
1. Write `/tmp/escalation.json` with: problem summary, root cause, options, risks, recommendation, required decision
2. Notify the owner. Until a dedicated `notify_owner` worker exists in `/backend`, the operational substitute is a Mandrill email to `ali@colaberry.com` containing the escalation contents.
3. Continue work that is not blocked by the escalation.

---

# Testing & Validation Rules

Testing is mandatory and gated. Claude designs tests; tools execute them. The current state of this repo does not yet meet the full target standard. The rules below describe both the **target** and the **minimum acceptable now**.

## Unit testing

- **Target:** All non-trivial logic in `backend/src/services/` and `backend/src/intelligence/` has unit tests. Pure logic tested without I/O; external dependencies mocked. Fast, deterministic, runnable locally.
- **Minimum now:** Any new business logic added to those folders ships with at least one unit test covering the happy path. Existing untested code is grandfathered until it is touched.

## Integration testing

- May touch dev sandboxes, test databases, mock APIs.
- Must NEVER touch production.
- Requires explicit opt-in (env flag or CI label).

## End-to-End & UI testing

Validates routing, links, forms, auth flows, permissions, UI state. Browser automation (Playwright) is used in `/tests/systemV2`. Claude may generate crawl tests, define form test matrices, design visual regression rules. Claude must NOT manually simulate UI behavior in prose. For UI changes, type-checking (`tsc --noEmit`) is the minimum gate; Playwright coverage is the target.

## Worker / scheduled-job testing

Workers and scheduled jobs (Cory briefings, content generation, intelligence runs, openclaw outreach) are tested as routing logic: correct script selection, retry behavior, idempotency, error handling. Workers must never send real communications during tests; use the test-mode flag on Mandrill scripts and the no-op flag on briefing services.

## Directive validation

Directives in `/directives` validated for: required sections, referenced files/scripts existence, markdown integrity, clarity for junior developers.

If behavior can be tested via code, do not validate it narratively.

---

# Test Strategy Framework (NEW)

The Testing & Validation Rules section above defines what the test layers ARE. This section defines how much of each you need and what each test must cover.

## Test pyramid (target distribution)

| Layer | Target % of total tests | Properties |
|---|---|---|
| **Unit** | ~70% | Pure logic, no I/O, fast (<50ms each), no shared state |
| **Integration** | ~20% | Cross-module flows; may touch test DB or mock APIs; never production |
| **End-to-End** | ~10% | Full system flows through Playwright; one happy path + critical failure paths only |

A pyramid that's inverted (lots of E2E, few unit tests) is a smell. E2E tests are slow, brittle, and expensive; rely on them for confidence at the system level, not as a substitute for unit coverage.

## Risk-based testing

Higher-risk surfaces require deeper coverage. A surface is high-risk if any of these are true:

- It writes to production (sends emails, charges cards, books trips, posts to LinkedIn)
- It handles money or PII
- It is external-facing (public API, public website)
- It is on a critical path that, if broken, blocks revenue or customer trust

For high-risk surfaces, all four mandatory test types below are required. For low-risk surfaces, happy-path + boundary cases is the minimum.

## Mandatory test types per feature

Every feature must have, at minimum:

| Type | What it covers | Example |
|---|---|---|
| **Happy path** | The expected, normal case | "Pulling 25 leads from Apollo creates 25 leads" |
| **Failure path** | Network timeout, error response, partial state | "Apollo returns 500, no leads are created, error is logged" |
| **Boundary cases** | Empty input, max input, edge values | "Pulling 0 leads is a no-op; pulling 999999 is rejected with a typed error" |
| **Idempotency** | Same input twice produces same effect (not double-executed) | "Pulling the same lead twice creates one lead, not two" |

A feature without all four for high-risk surfaces is not done.

---

# Idempotency & Replayability (NON-NEGOTIABLE)

Every script, scheduled job, queue handler, and API endpoint that performs side effects must be safe to run multiple times. This is non-negotiable; violations are production defects.

## Required properties

| Property | Meaning | How to achieve |
|---|---|---|
| **Safe to re-run** | Running the same operation twice does not corrupt state | Use idempotency keys, unique constraints, upsert semantics |
| **Same input = same output** | No time-dependent randomness without seed; no hidden state | Pass timestamps as parameters; seed RNGs explicitly |
| **No duplicate side effects** | One inbound request = at most one email, one charge, one DB write | Dedupe by `(operation_type, business_id)` before performing the side effect |
| **Retry-safe** | A retry of a failed call does not over-apply the operation | Idempotency keys passed to upstream services; dedup tables for inbound |

## Idempotency keys

Every external write must include an idempotency key derived from the business operation, not a random UUID per attempt. Examples:

- Sending a campaign email to lead X at step Y → key: `outreach:lead-X:step-Y`
- Booking a reservation → key: `reservation:user-X:trip-id-Y`
- Pulling Apollo leads for a campaign → key: `apollo-pull:campaign-X:request-id-Y`

If the upstream service supports idempotency keys natively, use theirs. If not, dedupe locally before calling.

## Hard gate

Any operation with side effects that cannot be safely re-run is a production defect. This is a Definition of Done blocker. Tests must cover the double-execution case explicitly.

---

# Failure-First Design (NEW)

You design the failure path before you design the happy path. Systems that work only when everything works are not production systems.

## Required for every system / integration

| Element | What it means | Example |
|---|---|---|
| **Retry strategy** | Defined number of retries with exponential backoff and jitter | 3 retries, base delay 1s, jitter 0-500ms, max delay 30s |
| **Recovery path** | What happens after retries are exhausted | Move to dead-letter queue; alert via Cory briefing; flag in admin UI |
| **Explicit failure modes** | Typed error classes, never raw `throw new Error("oops")` | `ApolloRateLimitError`, `OutreachSendBlockedError`, `LeadValidationError` |
| **Bulkhead boundaries** | One failed dependency does not take down unrelated paths | Apollo failure must not block Mandrill sends |
| **Circuit breaker** | After repeated failures, stop calling for a cool-down period | After 10 consecutive 5xx from upstream, pause for 5 min |
| **Graceful degradation** | The system returns useful behavior even when a dependency is down | If enrichment fails, save the lead anyway with `enrichment_status='failed'` |

## Failure documentation

Every service must document, in a comment block at the top of the file, what its failure modes are and how it handles each. A reader should be able to answer:

- What happens if my upstream is down?
- What happens if my DB write fails halfway?
- What happens if I am called concurrently with the same input?
- What happens if my retry budget is exhausted?

If those questions have no answer in the code, the service is not done.

---

# Logging, Reporting & Progress Tracking

This section is **gated**. Failure to update progress is a process violation, not an oversight, and blocks Definition of Done.

## Per-change autonomy log (target)

When the autonomy log writer lands in `/backend`, every change appends one entry to `/tmp/autonomy_log.json`:

```json
{
  "timestamp": "ISO-8601",
  "change_summary": "what was done",
  "files_touched": ["..."],
  "assumptions": ["..."],
  "confidence": 0.0,
  "tests_added": ["..."],
  "directives_updated": ["..."],
  "escalation_triggered": false
}
```

Until that writer exists, Claude must include the same information in the commit message body and the corresponding PROGRESS.md note. The autonomy_log gate becomes a hard Definition of Done requirement once the writer ships.

## PROGRESS.md update rule (HARD GATE, ENFORCED NOW)

After every completed implementation change, before marking the change "done" in any sense, Claude MUST update `PROGRESS.md`. Non-compliance is a violation, not a forgetting.

**What goes in `PROGRESS.md`:** code, prompts that ship, infra/config that affects runtime, in-repo docs.

**What does NOT go in `PROGRESS.md`:** Mandrill emails sent on Ali's behalf, Basecamp ticket creation, ad-hoc data pulls, memory file additions, discovery/dry-run script outputs that don't ship, external API calls that don't land code, deploy commands shipping already-tracked code.

**Required entry format** (append under the relevant task):

```markdown
- [x] <task name>
  - Date: YYYY-MM-DD
  - What changed: <one line>
  - Verification: <test name | deploy URL | "user confirmed" | "TypeScript passes">
  - Notes: <only if blocker, deviation, or non-obvious decision>
```

**Hard gates:**
1. **No code change is "done" without a PROGRESS.md entry.** Definition of Done explicitly blocks on this.
2. **No `[x]` mark without verification evidence on the same line.** Forbidden: marking complete based on intent. Required: a concrete artifact (test result, deploy confirmation, user statement, or `tsc` pass).
3. **Every commit that touches `/backend`, `/frontend`, `/scripts`, `/nginx`, or `/directives` must also touch `PROGRESS.md`.** If it doesn't, the change is incomplete.
4. **End-of-session audit (REQUIRED):** Before ending any session, Claude must:
   - List every file modified in the session
   - Confirm each modification has a corresponding PROGRESS.md entry
   - If any entry is missing, write it before ending
   - State explicitly in the session-end summary: "PROGRESS.md audit: N changes, N entries, audit clean."

If PROGRESS.md does not exist, create it before doing any work.

## Catch-up rule

If a session has done implementation work without updating PROGRESS.md along the way, write a single end-of-session entry covering everything that landed, dated for the day the work was done. Better to log late than not at all.

## Session start protocol

At the start of every session:
1. Read `CLAUDE.md` (this file) fully
2. Read `PROGRESS.md` fully
3. Summarize current state and the first unchecked task
4. **Make no code changes during this step**

## Verification rule

Before any coding work begins: confirm both files exist, read both fully, summarize the rules and progress. No code changes during verification.

## Daily executive report

The daily executive report concept in this repo is implemented as the **Cory briefing** service in `backend/src/services/`. The briefing emails Ram and Ali via the `admin_notification_emails` setting and covers: completed work, tests added, failures resolved, architectural changes, confidence averages, assumptions made, risk flags, open escalations, next milestones. Claude does not send notifications directly; the briefing service does.

---

# Observability Framework (NEW)

Logging tells you what happened. Observability tells you what is happening, what is broken, and why. Every service must emit enough signal to debug a production issue without re-running the code.

## Structured logging (required)

| Rule | Detail |
|---|---|
| **Format: JSON** | `{ "level": "info", "msg": "...", "ts": "...", ... }`. No plain string concatenation. |
| **Use the `logger`** from `backend/src/config/logger`, never bare `console.log` in services |
| **Include context fields** | Every log line must carry: `correlationId`, `userId` (if known), `entityId` (if known), `action` |
| **No PII in logs** | Mask emails to `r***@d***.com` style if logging recipient lists; never log full bodies of outbound communications |

## Per-execution tracking (required)

Every service operation, agent run, and worker job must record:

| Field | Why |
|---|---|
| `started_at`, `ended_at`, `duration_ms` | Latency tracking |
| `status` (`success`, `failure`, `skipped`, `timeout`) | Success rate calculation |
| `error_class` and `error_message` (on failure) | Error classification |
| `attempt_number` (on retry) | Retry-pattern detection |
| Domain-specific counters (e.g., `leads_created`, `emails_sent`, `credits_used`) | Operational metrics |

For agents, this means calling `recordAgentRun()` in `backend/src/intelligence/agents/agentRegistry` (or its equivalent) on every execution.

## Required metrics

Every long-running service or scheduled job must expose:

- **Success rate** (rolling 24h)
- **Failure rate** (rolling 24h)
- **Retry count** (rolling 24h)
- **Latency percentiles** (p50, p95, p99)

Surfaced via the system status page or admin reporting.

## Correlation IDs

Every inbound HTTP request gets a UUID `correlationId` (header `X-Correlation-Id` if provided, else generated). Every log line, every agent run, every downstream API call carries it. This is how you trace a single user action across services.

For background jobs, the correlationId is the job execution ID.

---

# UI/UX Design Policy

## Design system

- **Framework:** Bootstrap 5 (CDN), utility-first. No custom CSS unless a class exists in `global.css`
- **Tokens:** All colors, fonts, spacing as CSS custom properties in `frontend/src/styles/global.css`
- **Never hardcode hex values.** Use `var(--color-*)` or Bootstrap utility classes

## Color palette

| Token | Value | Usage |
|---|---|---|
| `--color-primary` | `#1a365d` | Navy: headings, primary buttons, brand |
| `--color-primary-light` | `#2b6cb0` | Links, hover states, focus outlines |
| `--color-secondary` | `#e53e3e` | Red: CTAs, warnings, destructive actions |
| `--color-accent` | `#38a169` | Green: success states, positive indicators |
| `--color-bg` | `#ffffff` | Page background |
| `--color-bg-alt` | `#f7fafc` | Alternate section backgrounds |
| `--color-text` | `#2d3748` | Body text |
| `--color-text-light` | `#718096` | Muted/secondary text |
| `--color-border` | `#e2e8f0` | Card borders, dividers |

## Component patterns

- **Cards:** `card border-0 shadow-sm` with `card-header bg-white fw-semibold`
- **Tables:** `table-responsive > table table-hover mb-0`, `thead table-light`
- **Badges:** `badge bg-{success|warning|info|secondary|danger}`
- **Tabs:** `nav nav-tabs mb-4` with `nav-link active` buttons
- **Modals:** `modal show d-block` with backdrop, `role="dialog"`, `aria-modal="true"`
- **Forms:** `form-control-sm`, `form-select-sm`, `form-label small fw-medium`
- **Buttons:** Always `btn-sm` in admin UI; `btn-primary`, `btn-outline-secondary`, `btn-outline-danger`
- **Filter bars:** `d-flex gap-2 mb-3 flex-wrap align-items-center`

## Accessibility (WCAG 2.1 AA required)

- **Focus indicators:** `3px solid var(--color-primary-light)` on `:focus-visible` (in `responsive.css`)
- **Touch targets:** Min 44x44px on mobile (in `responsive.css` for `< 992px`)
- **Reduced motion:** `prefers-reduced-motion: reduce` disables animations (in `responsive.css`)
- **High contrast:** `prefers-contrast: high` adds borders and full-contrast text (in `responsive.css`)
- **Screen readers:** Loading spinners need `role="status"` + `visually-hidden` text

## Available design skills

| Skill | Invocation | Purpose |
|---|---|---|
| Baseline UI | `/baseline-ui` | Output the complete design system reference |
| Accessibility | `/fixing-accessibility` | WCAG 2.1 AA audit and remediation |
| Performance | `/fixing-motion-performance` | Animation, rendering, bundle optimization |
| Frontend Design | `/frontend-design` | Generate React + Bootstrap components and pages |
| UI/UX Design | `/ui-ux-design` | Strategic design: research, wireframes, prototyping, review |

## Target audience

**Enterprise executives, aged 35-60.** Design must be clean, calm, and authoritative. Prioritize scannable information density, progressive disclosure, and professional tone. Think Bloomberg meets Salesforce, not consumer SaaS.

---

# Tooling Assumptions

Claude may assume:
- Claude Code is available
- VS Code / VSCodium / Cursor may be used
- Git is present
- CI runs automated tests where they exist (manual testing is the current default for most surfaces)
- Production VPS access is via `ssh root@95.216.199.47`. The VPS is multi-tenant (it hosts ~30 containers across several apps). The **LandJet** stack lives at `/opt/landjet-growth-engine` (containers `landjet-backend`, `landjet-frontend`, `landjet-db`). Deploy LandJet with `cd /opt/landjet-growth-engine && git pull --rebase --autostash origin main && docker compose -f docker-compose.production.yml up -d --build backend`. Run TS ops scripts via `docker exec landjet-backend npx tsx /app/src/scripts/<name>.ts`. NOTE: `/opt/colaberry-accelerator` is a DIFFERENT app (ColaberryEnterprise_AI_LeadershipAccelerator) — do not deploy LandJet there.

Claude must NOT assume:
- Moltbot exists
- Proprietary automation platforms exist
- Production credentials exist locally (Mandrill, MSSQL, Basecamp tokens live in the prod backend container env, not in the local repo)

---

# Intern Safety Rules

This repository may be worked on by interns.

- No destructive scripts without confirmation
- No production writes without explicit environment checks
- No secrets in repo
- Clear setup docs must exist
- One-command test execution must exist

Optimize for clarity, reproducibility, and teachability.

---

# Security Enforcement Layer

Security rules are runtime guardrails. Violating them creates production incidents, not styling complaints.

## Required for all code

| Rule | What it means | Enforcement |
|---|---|---|
| **Input validation at every boundary** | All `req.body`, `req.query`, `req.params`, queue payloads, and external API responses are validated against a schema (Zod or equivalent) before use | Validation middleware on routes; explicit parsing for queue handlers |
| **No unsafe queries** | All SQL is parameterized via Sequelize bindings or `?` placeholders. Never string-concatenate or template-literal user input into a query | Code review; lint rule for raw query construction |
| **No secrets in code** | API keys, tokens, passwords, connection strings live in `process.env`. `.env.example` tracked with placeholders; `.env` never committed | `.gitignore` enforces; pre-commit secret scanner |
| **No PII in logs** | Mask emails, phone numbers, addresses in log lines. Full payloads only in opt-in debug mode locally, never in production | Logger masking helpers; PII review during code review |

## External calls -- mandatory wrapping

Every call to an external service (API, DB, queue, file system across containers) must include:

| Element | Default | Notes |
|---|---|---|
| **Timeout** | 30 seconds | Override only with documented reason |
| **Retry policy** | 3 attempts, exponential backoff with jitter | Only for idempotent operations |
| **Error handling** | Typed error class on failure | Never silent catch; never `catch {}` without action |
| **Observability** | Log start, end, duration, status | See Observability Framework |

A `fetch()` call without a timeout is a defect. A `try/catch` that swallows the error is a defect.

## Authentication & authorization

| Rule | Where enforced |
|---|---|
| All write endpoints require authentication | `backend/src/middleware/auth` on every router |
| All admin endpoints additionally require role authorization | `backend/src/middleware/authorize` |
| Sessions / tokens have explicit expiry | JWT exp claim; rotated on suspicious activity |
| Failed auth attempts are rate-limited | `backend/src/middleware/rateLimiter` |

---

# Definition of Done & Self-Strengthening

A change is complete only if ALL of the following are true:

- Tests exist and pass at the minimum standard for the layer (see Testing & Validation Rules)
- For new features touching I/O: BUILD-BREAK-HARDEN loop completed (failure tests cited in PROGRESS.md)
- Required test types present per Test Strategy Framework (happy path + failure path + boundary cases + idempotency for high-risk surfaces)
- Module contracts defined and tested (typed inputs/outputs, typed errors)
- Idempotency verified for any operation with side effects (double-execution test passes)
- Failure paths designed and tested (retries, recovery, typed error classes)
- Observability hooks in place (structured logs, duration, status, correlationId, agent run recorded if applicable)
- Security checklist passed (input validation at boundaries, no unsafe queries, no secrets in code, external calls wrapped with timeout + retry + error handling)
- Modular composition limits respected (file/function size, no circular dependencies)
- Directives updated if necessary
- No secrets introduced
- Validation scripts pass (`tsc --noEmit` for TypeScript layers)
- A junior developer can understand the change
- Assumptions logged (if any)
- No unresolved governance boundary crossed
- **PROGRESS.md updated with verification evidence (Logging section, hard gate, enforced now)**
- **`/tmp/autonomy_log.json` entry appended (when the writer lands; until then, the same information is in the commit body and PROGRESS.md note)**

## Self-strengthening requirement

Each autonomous change should leave the system stronger: add missing tests, clarify ambiguous directives, refactor recurring failure patterns, reduce future ambiguity, improve determinism, reduce future need for escalation. Failures are inputs, not mistakes.

---

# Summary

Claude is the planner, validator, and system hardener, not the worker.

- Directives define intent
- Scripts and services execute deterministically
- Tests prove correctness
- Long-running services run the system
- PROGRESS.md and autonomy logs prove what happened
- Implementation ambiguity does not trigger escalation
- Strategic ambiguity does
- Escalation replaces paralysis

Be deliberate. Be testable. Be autonomous. Be governed only where necessary.
