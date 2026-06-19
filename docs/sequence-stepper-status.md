# Sequence stepper — status as of 2026-06-19

**Where we left off:** built and deployed in dry-run mode. Awaiting Ali's decision on which enable strategy to use.

## What's shipped

- [`src/services/sequenceStepperService.ts`](../src/services/sequenceStepperService.ts) — service. Fully raw SQL (Sequelize models had attribute-mapping issues on Lead/Campaign/ScheduledEmail). Dry-run returns previews without DB writes; live creates ScheduledEmail rows + updates `Lead.next_action_at`.
- [`src/services/pipelineAutoRunner.ts`](../src/services/pipelineAutoRunner.ts) — 5th job registered. Fires every 5 min with 0-45s jitter. Default `stepper_enabled: false`.
- [`src/scripts/runStepperDryRun.ts`](../src/scripts/runStepperDryRun.ts) — CLI for ad-hoc dry-runs.
- Deployed in commit [`e008083`](https://github.com/ColaberryIntern/LandJetGrowthEngine/commit/e008083).

## Dry-run results (2026-06-18)

| Metric | Value |
|---|---|
| Total overdue leads | **124** |
| Considered (batch limit) | 25 |
| Would queue | 25 |
| Errors | 0 |
| Skipped | 0 |

**Sample (oldest 5):**

| # | Lead | Campaign | Days overdue |
|---|---|---|---|
| 11 | Denise Ganpat | Manufacturing Outreach | 59 |
| 44 | Nicole Gathercole | Manufacturing Outreach | 59 |
| 55 | Tonya Hardt | Manufacturing Outreach | 54 |
| 5832 | Jason Gremchuk | Cold Outreach - Manufacturing | 47 |
| 5833 | Rick Jenks | Cold Outreach - Manufacturing | 47 |

All 124 are at `pipeline_stage='contacted'`. Next step for each is `channel='email'` at step index 1. Range: 38 to 59 days overdue.

## To enable

Ali needs to pick one of:

| | Approach | Behavior |
|---|---|---|
| **A** | `PIPELINE_ENABLE_STEPPER=true`, default batch limit 10 | 120/hr. All 124 clear in ~1 hour. Aggressive for 40-60-day-stale leads. |
| **B** (recommended) | `PIPELINE_ENABLE_STEPPER=true` + add `STEPPER_BATCH_LIMIT=2` env | 24/hr. All 124 clear in ~5 hours. Gentler ramp. |
| **C** | One-time CLI fire | `docker exec landjet-backend node /app/dist/scripts/runStepperDryRun.js --live --limit=5`. Manual control. |

`STEPPER_BATCH_LIMIT` env var is NOT YET implemented. Currently hardcoded to `DEFAULT_BATCH_LIMIT = 10` in `sequenceStepperService.ts:74`. If picking B, that's a 1-line code change before deploy.

## Outstanding companion concern

Before enabling **anything** that fires outbound, audit inbox-match. Prod logs show daemon polling `from:rmlandry29@gmail.com` (Ryan's personal Gmail). Outbound goes from `rlandry@landjet.com`. If replies aren't getting captured, we'll send 124 emails into a black hole.

## Resume command

```bash
# Re-run the dry-run from a fresh session
ssh root@95.216.199.47 'docker exec landjet-backend sh -c "cd /app && node dist/scripts/runStepperDryRun.js 2>/dev/null"'
```

## Why this file instead of a BC ticket

Tried to create a BC todo on 2026-06-19; Basecamp returned `OAuth token expired (rekeyed_identity)`. The token stored in CCPP MSSQL is the same one Basecamp is now rejecting. The upstream refresh hasn't run. This doc is the durable handoff until BC sync is restored.
