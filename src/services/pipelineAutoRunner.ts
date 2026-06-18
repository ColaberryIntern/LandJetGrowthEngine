/**
 * In-process pipeline auto-runner.
 *
 * Decision 2026-06-09 (Ali): go with in-process `setInterval` rather than a
 * separate worker container or external systemd timer. Reasons:
 *  - Current load is light (a few hundred sends/day max).
 *  - One container per stack is the established pattern.
 *  - All operations are already idempotent, so a restart mid-cycle is cheap.
 *  - When outbound load grows or we want horizontal worker scaling, *that* is
 *    when we graduate to a dedicated worker container.
 *
 * Three jobs registered when PIPELINE_AUTORUN=true:
 *  - Inbound ingest (every 5 min): fetches monitored Gmail senders, writes
 *    `email_threads`, runs classification pipeline.
 *  - Outbound scheduler (every 1 min): claims pending ScheduledEmail rows
 *    and processes each through the existing guard chain.
 *  - Ryan Pulse (daily, 7am America/Chicago, weekdays only): builds the
 *    snapshot and emails it via the existing outreach email service.
 *
 * Each job has:
 *  - An overlap guard (skip if previous cycle still running)
 *  - Try/catch so a single failure does not kill the loop
 *  - Initial random jitter so multiple backend restarts do not all fire at
 *    the same instant
 *  - Structured logging at start + end with duration + outcome
 *
 * Off-switches:
 *  - PIPELINE_AUTORUN=false (default) disables everything
 *  - PIPELINE_DISABLE_INGEST=true skips only the inbound ingest
 *  - PIPELINE_DISABLE_SCHEDULER=true skips only the outbound scheduler
 *  - PIPELINE_DISABLE_PULSE=true skips only the daily Pulse
 *  - PIPELINE_PULSE_RECIPIENT overrides the Pulse recipient (defaults to
 *    ali@colaberry.com for safety until Ali flips to rlandry@landjet.com)
 */

import { logger } from '../config/logger';

const INGEST_INTERVAL_MS = 5 * 60 * 1000;
const SCHEDULER_INTERVAL_MS = 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;
const PULSE_TZ = 'America/Chicago';
const PULSE_HOUR_LOCAL = 7;
// Friday pre-call briefing: 9:45 AM CT, 15 min before the recurring 10 AM call.
const BRIEFING_HOUR_LOCAL = 9;
const BRIEFING_MIN_LOCAL = 45;
const BRIEFING_DOW_NAME = 'Fri';

const running = { ingest: false, scheduler: false, pulse: false, briefing: false };
const timers: ReturnType<typeof setInterval>[] = [];
const timeouts: ReturnType<typeof setTimeout>[] = [];

export function isAutorunEnabled(): boolean {
  return process.env.PIPELINE_AUTORUN === 'true';
}

export function jitter(maxMs: number): number {
  return Math.floor(Math.random() * maxMs);
}

/**
 * Milliseconds from `now` until the next 7am America/Chicago. If today's
 * 7am has already passed, returns the gap until tomorrow's 7am.
 */
export function msUntilNextPulse(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PULSE_TZ,
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const hh = Number(parts.find(p => p.type === 'hour')?.value ?? '0');
  const mm = Number(parts.find(p => p.type === 'minute')?.value ?? '0');
  const ss = Number(parts.find(p => p.type === 'second')?.value ?? '0');
  const nowMsOfDay = hh * 3600000 + mm * 60000 + ss * 1000;
  const targetMsOfDay = PULSE_HOUR_LOCAL * 3600000;
  let delta = targetMsOfDay - nowMsOfDay;
  if (delta <= 0) delta += ONE_DAY_MS;
  return delta;
}

export function isWeekendInChicago(now: Date = new Date()): boolean {
  const day = new Intl.DateTimeFormat('en-US', { timeZone: PULSE_TZ, weekday: 'short' }).format(now);
  return day === 'Sat' || day === 'Sun';
}

/**
 * Milliseconds from `now` until the next Friday 9:15 AM America/Chicago. If
 * today is Friday and 9:15 AM has not yet passed, returns the gap until today's
 * 9:15. Otherwise returns the gap until next Friday.
 */
export function msUntilNextFridayBriefing(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PULSE_TZ,
    weekday: 'short', hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find(p => p.type === 'weekday')?.value ?? 'Mon';
  const hh = Number(parts.find(p => p.type === 'hour')?.value ?? '0');
  const mm = Number(parts.find(p => p.type === 'minute')?.value ?? '0');
  const ss = Number(parts.find(p => p.type === 'second')?.value ?? '0');
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const todayIdx = DOW.indexOf(weekday);
  const friIdx = DOW.indexOf(BRIEFING_DOW_NAME);
  const nowMsOfDay = hh * 3600000 + mm * 60000 + ss * 1000;
  const targetMsOfDay = BRIEFING_HOUR_LOCAL * 3600000 + BRIEFING_MIN_LOCAL * 60000;

  let daysUntilFri = (friIdx - todayIdx + 7) % 7;
  if (daysUntilFri === 0 && nowMsOfDay >= targetMsOfDay) daysUntilFri = 7;
  return daysUntilFri * ONE_DAY_MS + (targetMsOfDay - nowMsOfDay);
}

async function runIngest(): Promise<void> {
  if (running.ingest) {
    logger.info('pipeline.ingest skipped: previous cycle still running');
    return;
  }
  if (process.env.PIPELINE_DISABLE_INGEST === 'true') return;
  running.ingest = true;
  const start = Date.now();
  try {
    const { ingestEmails, processEmails } = await import('./communicationOrchestratorService');
    const ingested = await ingestEmails(24);
    const processed = await processEmails();
    logger.info('pipeline.ingest complete', {
      duration_ms: Date.now() - start,
      fetched: ingested.fetched,
      new_emails: ingested.new_emails,
      processed: processed.processed,
      skipped: processed.skipped,
      errors: processed.errors,
    });
  } catch (e) {
    logger.error('pipeline.ingest failed (non-fatal)', { error: (e as Error).message });
  } finally {
    running.ingest = false;
  }
}

async function runScheduler(): Promise<void> {
  if (running.scheduler) return;
  if (process.env.PIPELINE_DISABLE_SCHEDULER === 'true') return;
  running.scheduler = true;
  const start = Date.now();
  try {
    const { claimPendingActions, processAction } = await import('./schedulerService');
    const claimed = await claimPendingActions();
    if (claimed.length === 0) return; // quiet idle tick -- no log noise
    for (const action of claimed) {
      try {
        await processAction(action);
      } catch (e) {
        logger.warn('pipeline.scheduler action failed (non-fatal)', { action_id: action.id, error: (e as Error).message });
      }
    }
    logger.info('pipeline.scheduler complete', { duration_ms: Date.now() - start, claimed: claimed.length });
  } catch (e) {
    logger.error('pipeline.scheduler failed (non-fatal)', { error: (e as Error).message });
  } finally {
    running.scheduler = false;
  }
}

async function runWeeklyBriefing(): Promise<void> {
  if (running.briefing) {
    logger.info('pipeline.briefing skipped: previous cycle still running');
    return;
  }
  if (process.env.PIPELINE_DISABLE_BRIEFING === 'true') {
    logger.info('pipeline.briefing skipped: PIPELINE_DISABLE_BRIEFING=true');
    return;
  }
  running.briefing = true;
  const start = Date.now();
  try {
    const { sendWeeklyBriefing } = await import('./weeklyBriefingService');
    const result = await sendWeeklyBriefing();
    logger.info('pipeline.briefing complete', {
      duration_ms: Date.now() - start,
      mandrill_id: result.messageId,
      recipients: result.recipients,
      chart_count: result.chartCount,
      bc_comment_url: result.bcCommentUrl,
    });
  } catch (e) {
    logger.error('pipeline.briefing failed (non-fatal)', { error: (e as Error).message });
  } finally {
    running.briefing = false;
  }
}

async function runPulse(): Promise<void> {
  if (running.pulse) return;
  if (process.env.PIPELINE_DISABLE_PULSE === 'true') return;
  if (isWeekendInChicago()) {
    logger.info('pipeline.pulse skipped: weekend in America/Chicago');
    return;
  }
  running.pulse = true;
  const start = Date.now();
  try {
    const { buildPulseSnapshot, renderPulseSubject, renderPulseText, renderPulseHtml } = await import('./ryanPulseService');
    const { sendOutreachEmail } = await import('./outreachEmailService');
    const recipient = process.env.PIPELINE_PULSE_RECIPIENT || 'ali@colaberry.com';
    const snap = await buildPulseSnapshot();
    const result = await sendOutreachEmail({
      to: recipient,
      subject: renderPulseSubject(snap),
      body: renderPulseText(snap),
      html: renderPulseHtml(snap),
      from: 'rlandry@landjet.com',
      senderName: 'LandJet Growth Engine',
    });
    logger.info('pipeline.pulse complete', {
      duration_ms: Date.now() - start,
      to: recipient,
      success: result.success,
      snapshot_date: snap.for_date,
    });
  } catch (e) {
    logger.error('pipeline.pulse failed (non-fatal)', { error: (e as Error).message });
  } finally {
    running.pulse = false;
  }
}

export function startPipelineAutoRunner(): void {
  if (!isAutorunEnabled()) {
    logger.info('PIPELINE_AUTORUN not enabled; pipeline auto-runner is OFF');
    return;
  }
  logger.info('pipeline auto-runner starting', {
    ingest_interval_ms: INGEST_INTERVAL_MS,
    scheduler_interval_ms: SCHEDULER_INTERVAL_MS,
    pulse_first_fire_ms: msUntilNextPulse(),
    briefing_first_fire_ms: msUntilNextFridayBriefing(),
  });

  // Inbound ingest. Initial 0-30s jitter so multiple restarts don't fire at once.
  const ingestStartIn = jitter(30000);
  timeouts.push(setTimeout(() => {
    void runIngest();
    timers.push(setInterval(() => { void runIngest(); }, INGEST_INTERVAL_MS));
  }, ingestStartIn));

  // Outbound scheduler. 0-10s jitter (smaller because the cadence is 1 min).
  const schedStartIn = jitter(10000);
  timeouts.push(setTimeout(() => {
    void runScheduler();
    timers.push(setInterval(() => { void runScheduler(); }, SCHEDULER_INTERVAL_MS));
  }, schedStartIn));

  // Pulse: next 7am CT, then every 24h.
  const untilPulse = msUntilNextPulse();
  timeouts.push(setTimeout(() => {
    void runPulse();
    timers.push(setInterval(() => { void runPulse(); }, ONE_DAY_MS));
  }, untilPulse));

  // Friday pre-call briefing: next Friday 9:15 AM CT, then weekly.
  const untilBriefing = msUntilNextFridayBriefing();
  timeouts.push(setTimeout(() => {
    void runWeeklyBriefing();
    timers.push(setInterval(() => { void runWeeklyBriefing(); }, ONE_WEEK_MS));
  }, untilBriefing));

  process.on('SIGTERM', stopPipelineAutoRunner);
  process.on('SIGINT', stopPipelineAutoRunner);
}

export function stopPipelineAutoRunner(): void {
  if (timers.length === 0 && timeouts.length === 0) return;
  logger.info('pipeline auto-runner stopping', { intervals: timers.length, pending_timeouts: timeouts.length });
  for (const t of timers) clearInterval(t);
  for (const t of timeouts) clearTimeout(t);
  timers.length = 0;
  timeouts.length = 0;
}
