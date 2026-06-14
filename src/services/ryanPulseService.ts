// Ryan Pulse -- single daily exec dashboard email.
//
// Sections:
//   1. Yesterday (outbound sends, inbound replies, leads added)
//   2. Where we stand (total pipeline grouped by stage + hot leads)
//   3. What needs you today (recent inbound replies awaiting Ryan)
//   4. What's next (upcoming scheduled sends + open Ali/Percy asks count)
//   5. Vs last week (compares yesterday's headline numbers to same weekday 7d ago)
//
// Design notes:
// - Pure data-aggregation + template rendering. No I/O side effects beyond DB reads.
// - sendOutreachEmail is called by the route layer, not here, so this is unit-testable.
// - Dates are computed in America/Chicago (Ryan's TZ) so "yesterday" matches his reality.
// - Inbound "needs you" surfaces last 24h inbound replies; the read/unread distinction is
//   future work once we have a comm_log.handled_at field (TODO when surfaced).

import { Op, Sequelize } from 'sequelize';
import { Lead, PIPELINE_STAGES, PipelineStage } from '../models/Lead';
import { CommunicationLog } from '../models/CommunicationLog';
import { ScheduledEmail } from '../models/ScheduledEmail';

export interface PulseHotLead {
  id: number;
  name: string;
  company: string | null;
  state: string | null;
  lead_score: number;
}

export interface PulseInboundReply {
  lead_id: number;
  lead_name: string;
  lead_company: string | null;
  subject: string | null;
  snippet: string | null;
  received_at: Date;
}

export interface PulseUpcoming {
  scheduled_for: Date;
  campaign_id: string | null;
  count_at_time: number; // # of sends bundled around this time
}

export interface PulseSnapshot {
  for_date: string; // ISO yyyy-mm-dd of the day being reported on (= "yesterday")
  generated_at: Date;

  yesterday: {
    sends: number;
    sends_cold: number;
    sends_followup: number;
    replies: number;
    leads_added: number;
    leads_added_apollo: number;
    leads_added_other: number;
    meetings_booked: number;
  };

  pipeline: {
    total: number;
    by_stage: Record<PipelineStage, number>;
    hot_leads: PulseHotLead[];
  };

  needs_you: {
    inbound_replies: PulseInboundReply[];
    inbound_reply_count: number;
  };

  whats_next: {
    upcoming_sends_24h: number;
    upcoming_clusters: PulseUpcoming[];
  };

  vs_last_week: {
    sends_delta: number;
    replies_delta: number;
    leads_added_delta: number;
    meetings_delta: number;
  };
}

const CHICAGO_TZ = 'America/Chicago';

/** Returns the start-of-day (midnight) in America/Chicago for the given date, as a UTC Date. */
function startOfDayChicago(d: Date): Date {
  const isoLocal = new Intl.DateTimeFormat('sv-SE', {
    timeZone: CHICAGO_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
  // sv-SE locale produces "YYYY-MM-DD"; treat that as midnight Chicago, then offset to UTC.
  // Approximate via Date.UTC + Chicago offset for that date. America/Chicago is UTC-5/-6.
  // For correctness across DST, compute the offset by formatting back.
  const noonChicagoIso = `${isoLocal}T12:00:00`;
  const noonChicagoUtc = new Date(noonChicagoIso + 'Z').getTime();
  // Round-trip: how does that UTC moment render as a wall-clock in Chicago?
  const renderedHour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: CHICAGO_TZ, hour: 'numeric', hour12: false }).format(new Date(noonChicagoUtc)),
  );
  const drift = (12 - renderedHour) * 60 * 60 * 1000;
  return new Date(noonChicagoUtc + drift - 12 * 60 * 60 * 1000);
}

/** Returns Chicago-local date strings (yyyy-mm-dd) for "yesterday" and "the same weekday last week (8 days ago)". */
export function reportingWindows(now: Date = new Date()): {
  yesterdayStart: Date; yesterdayEnd: Date; yesterdayLabel: string;
  lastWeekStart: Date; lastWeekEnd: Date;
  next24Start: Date; next24End: Date;
} {
  const yesterdayAnchor = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStart = startOfDayChicago(yesterdayAnchor);
  const yesterdayEnd = new Date(yesterdayStart.getTime() + 24 * 60 * 60 * 1000);

  const lastWeekAnchor = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
  const lastWeekStart = startOfDayChicago(lastWeekAnchor);
  const lastWeekEnd = new Date(lastWeekStart.getTime() + 24 * 60 * 60 * 1000);

  const next24Start = now;
  const next24End = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const yesterdayLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: CHICAGO_TZ, weekday: 'long', month: 'short', day: 'numeric',
  }).format(yesterdayAnchor);

  return { yesterdayStart, yesterdayEnd, yesterdayLabel, lastWeekStart, lastWeekEnd, next24Start, next24End };
}

async function countSends(start: Date, end: Date): Promise<{ total: number; cold: number; followup: number }> {
  const rows = await CommunicationLog.findAll({
    attributes: [
      [Sequelize.fn('COUNT', Sequelize.col('id')), 'cnt'],
      'metadata',
    ],
    where: {
      direction: 'outbound',
      channel: 'email',
      status: { [Op.in]: ['sent', 'delivered'] },
      delivery_mode: 'live',
      created_at: { [Op.gte]: start, [Op.lt]: end },
    },
    group: ['metadata'],
    raw: true,
  });
  let total = 0; let cold = 0; let followup = 0;
  for (const r of rows as unknown as { cnt: string; metadata: { step_number?: number } | null }[]) {
    const n = Number(r.cnt);
    total += n;
    const step = r.metadata?.step_number ?? 1;
    if (step <= 1) cold += n; else followup += n;
  }
  return { total, cold, followup };
}

async function countReplies(start: Date, end: Date): Promise<number> {
  return CommunicationLog.count({
    where: {
      direction: 'inbound',
      channel: 'email',
      created_at: { [Op.gte]: start, [Op.lt]: end },
    },
  });
}

async function countLeadsAdded(start: Date, end: Date): Promise<{ total: number; apollo: number; other: number }> {
  const rows = await Lead.findAll({
    attributes: ['lead_source', [Sequelize.fn('COUNT', Sequelize.col('id')), 'cnt']],
    where: { created_at: { [Op.gte]: start, [Op.lt]: end } },
    group: ['lead_source'],
    raw: true,
  });
  let total = 0; let apollo = 0;
  for (const r of rows as unknown as { lead_source: string | null; cnt: string }[]) {
    const n = Number(r.cnt);
    total += n;
    if ((r.lead_source || '').toLowerCase() === 'api') apollo += n;
  }
  return { total, apollo, other: total - apollo };
}

async function countMeetingsBooked(start: Date, end: Date): Promise<number> {
  // Approximate: leads transitioned into meeting_scheduled stage during the window.
  // We don't have a state-transition log, so we proxy via updated_at + current pipeline_stage.
  // Good enough until we add a lead_pipeline_history table.
  return Lead.count({
    where: {
      pipeline_stage: 'meeting_scheduled',
      updated_at: { [Op.gte]: start, [Op.lt]: end },
    },
  });
}

async function pipelineByStage(): Promise<{ total: number; by_stage: Record<PipelineStage, number> }> {
  const rows = await Lead.findAll({
    attributes: ['pipeline_stage', [Sequelize.fn('COUNT', Sequelize.col('id')), 'cnt']],
    where: { status: 'active' },
    group: ['pipeline_stage'],
    raw: true,
  });
  const by_stage = Object.fromEntries(PIPELINE_STAGES.map(s => [s, 0])) as Record<PipelineStage, number>;
  let total = 0;
  for (const r of rows as unknown as { pipeline_stage: PipelineStage; cnt: string }[]) {
    const n = Number(r.cnt);
    by_stage[r.pipeline_stage] = n;
    total += n;
  }
  return { total, by_stage };
}

async function hotLeads(limit = 6): Promise<PulseHotLead[]> {
  const rows = await Lead.findAll({
    where: { status: 'active', temperature: 'hot' },
    order: [['lead_score', 'DESC'], ['updated_at', 'DESC']],
    limit,
  });
  return rows.map(l => ({
    id: l.id,
    name: `${l.first_name} ${l.last_name}`.trim(),
    company: l.company,
    state: l.state,
    lead_score: l.lead_score,
  }));
}

async function recentInboundReplies(start: Date, end: Date, limit = 5): Promise<PulseInboundReply[]> {
  const rows = await CommunicationLog.findAll({
    where: {
      direction: 'inbound',
      channel: 'email',
      created_at: { [Op.gte]: start, [Op.lt]: end },
    },
    order: [['created_at', 'DESC']],
    limit,
  });
  if (rows.length === 0) return [];

  const leadIds = Array.from(new Set(rows.map(r => r.lead_id)));
  const leads = await Lead.findAll({ where: { id: { [Op.in]: leadIds } } });
  const byId = new Map(leads.map(l => [l.id, l]));

  return rows.map(r => {
    const lead = byId.get(r.lead_id);
    const bodyText = (r.body || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    return {
      lead_id: r.lead_id,
      lead_name: lead ? `${lead.first_name} ${lead.last_name}`.trim() : `Lead #${r.lead_id}`,
      lead_company: lead?.company ?? null,
      subject: r.subject,
      snippet: bodyText.length > 140 ? bodyText.slice(0, 137) + '...' : bodyText,
      received_at: r.created_at,
    };
  });
}

async function upcomingSends(start: Date, end: Date): Promise<{ count: number; clusters: PulseUpcoming[] }> {
  const all = await ScheduledEmail.findAll({
    where: {
      status: { [Op.in]: ['pending', 'approved'] },
      scheduled_for: { [Op.gte]: start, [Op.lt]: end },
    },
    attributes: ['scheduled_for', 'campaign_id'],
    order: [['scheduled_for', 'ASC']],
  });
  // Group by half-hour bucket
  const buckets = new Map<number, { time: Date; campaign_id: string | null; n: number }>();
  for (const s of all) {
    const t = s.scheduled_for.getTime();
    const bucketKey = Math.floor(t / (30 * 60 * 1000));
    const existing = buckets.get(bucketKey);
    if (existing) { existing.n += 1; }
    else { buckets.set(bucketKey, { time: s.scheduled_for, campaign_id: s.campaign_id, n: 1 }); }
  }
  const clusters: PulseUpcoming[] = Array.from(buckets.values())
    .map(b => ({ scheduled_for: b.time, campaign_id: b.campaign_id, count_at_time: b.n }))
    .sort((a, b) => a.scheduled_for.getTime() - b.scheduled_for.getTime())
    .slice(0, 5);
  return { count: all.length, clusters };
}

export async function buildPulseSnapshot(now: Date = new Date()): Promise<PulseSnapshot> {
  const w = reportingWindows(now);

  const [sends, replies, leadsAdded, meetings, pipeline, hot, inbound, upcoming, lastWeekSends, lastWeekReplies, lastWeekLeads, lastWeekMeetings] = await Promise.all([
    countSends(w.yesterdayStart, w.yesterdayEnd),
    countReplies(w.yesterdayStart, w.yesterdayEnd),
    countLeadsAdded(w.yesterdayStart, w.yesterdayEnd),
    countMeetingsBooked(w.yesterdayStart, w.yesterdayEnd),
    pipelineByStage(),
    hotLeads(),
    recentInboundReplies(new Date(now.getTime() - 24 * 60 * 60 * 1000), now),
    upcomingSends(w.next24Start, w.next24End),
    countSends(w.lastWeekStart, w.lastWeekEnd),
    countReplies(w.lastWeekStart, w.lastWeekEnd),
    countLeadsAdded(w.lastWeekStart, w.lastWeekEnd),
    countMeetingsBooked(w.lastWeekStart, w.lastWeekEnd),
  ]);

  const forDate = new Intl.DateTimeFormat('sv-SE', { timeZone: CHICAGO_TZ }).format(w.yesterdayStart);

  return {
    for_date: forDate,
    generated_at: now,
    yesterday: {
      sends: sends.total,
      sends_cold: sends.cold,
      sends_followup: sends.followup,
      replies,
      leads_added: leadsAdded.total,
      leads_added_apollo: leadsAdded.apollo,
      leads_added_other: leadsAdded.other,
      meetings_booked: meetings,
    },
    pipeline: { total: pipeline.total, by_stage: pipeline.by_stage, hot_leads: hot },
    needs_you: { inbound_replies: inbound, inbound_reply_count: inbound.length },
    whats_next: { upcoming_sends_24h: upcoming.count, upcoming_clusters: upcoming.clusters },
    vs_last_week: {
      sends_delta: sends.total - lastWeekSends.total,
      replies_delta: replies - lastWeekReplies,
      leads_added_delta: leadsAdded.total - lastWeekLeads.total,
      meetings_delta: meetings - lastWeekMeetings,
    },
  };
}

// ----- Rendering -----

function signed(n: number): string {
  if (n === 0) return '+0';
  return n > 0 ? `+${n}` : String(n);
}

function fmtChicago(d: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: CHICAGO_TZ, ...opts }).format(d);
}

export function renderPulseSubject(snap: PulseSnapshot): string {
  const dayLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: CHICAGO_TZ, weekday: 'short', month: 'numeric', day: 'numeric',
  }).format(snap.generated_at);
  const todoBits: string[] = [];
  if (snap.whats_next.upcoming_sends_24h > 0) todoBits.push(`${snap.whats_next.upcoming_sends_24h} send${snap.whats_next.upcoming_sends_24h === 1 ? '' : 's'} queued`);
  if (snap.needs_you.inbound_reply_count > 0) todoBits.push(`${snap.needs_you.inbound_reply_count} repl${snap.needs_you.inbound_reply_count === 1 ? 'y' : 'ies'} need you`);
  if (todoBits.length === 0) todoBits.push('all clear');
  return `LandJet -- ${dayLabel} -- ${todoBits.join(' , ')}`;
}

export function renderPulseText(snap: PulseSnapshot): string {
  const w = reportingWindows(snap.generated_at);
  const yesterdayLabel = fmtChicago(w.yesterdayStart, { weekday: 'long', month: 'short', day: 'numeric' });

  const lines: string[] = [];
  lines.push('Good morning Ryan.');
  lines.push('');
  lines.push(`YESTERDAY (${yesterdayLabel})`);
  lines.push(`  Sent:        ${snap.yesterday.sends} emails  (cold ${snap.yesterday.sends_cold} , follow-up ${snap.yesterday.sends_followup})`);
  lines.push(`  Replies:     ${snap.yesterday.replies}`);
  lines.push(`  Leads added: ${snap.yesterday.leads_added}  (Apollo ${snap.yesterday.leads_added_apollo} , other ${snap.yesterday.leads_added_other})`);
  lines.push(`  Meetings booked: ${snap.yesterday.meetings_booked}`);
  lines.push('');
  lines.push('WHERE WE STAND');
  lines.push(`  Pipeline: ${snap.pipeline.total} leads  (` +
    `new ${snap.pipeline.by_stage.new_lead} | contacted ${snap.pipeline.by_stage.contacted} | replied ${snap.pipeline.by_stage.replied} | meeting ${snap.pipeline.by_stage.meeting_scheduled} | won ${snap.pipeline.by_stage.enrolled}` +
    `)`);
  if (snap.pipeline.hot_leads.length > 0) {
    const sample = snap.pipeline.hot_leads.slice(0, 3).map(h => `${h.name} at ${h.company || 'unknown'}`).join(' , ');
    const more = snap.pipeline.hot_leads.length > 3 ? ` ... +${snap.pipeline.hot_leads.length - 3} more` : '';
    lines.push(`  Hot leads: ${snap.pipeline.hot_leads.length}  (${sample}${more})`);
  } else {
    lines.push(`  Hot leads: 0`);
  }
  lines.push(`  Vs last week: sends ${signed(snap.vs_last_week.sends_delta)} , replies ${signed(snap.vs_last_week.replies_delta)} , leads ${signed(snap.vs_last_week.leads_added_delta)} , meetings ${signed(snap.vs_last_week.meetings_delta)}`);
  lines.push('');
  lines.push('WHAT NEEDS YOU TODAY');
  if (snap.needs_you.inbound_reply_count === 0) {
    lines.push('  Nothing waiting on you. Quiet inbox.');
  } else {
    for (const r of snap.needs_you.inbound_replies) {
      const at = fmtChicago(r.received_at, { hour: 'numeric', minute: '2-digit' });
      lines.push(`  - ${r.lead_name}${r.lead_company ? ` at ${r.lead_company}` : ''}`);
      lines.push(`    received ${at}  |  "${r.subject || '(no subject)'}"`);
      if (r.snippet) lines.push(`    > ${r.snippet}`);
    }
  }
  lines.push('');
  lines.push('WHAT IS NEXT');
  if (snap.whats_next.upcoming_sends_24h === 0) {
    lines.push('  No sends queued in the next 24 hours.');
  } else {
    lines.push(`  ${snap.whats_next.upcoming_sends_24h} email${snap.whats_next.upcoming_sends_24h === 1 ? '' : 's'} queued over next 24 hours.`);
    for (const c of snap.whats_next.upcoming_clusters) {
      const at = fmtChicago(c.scheduled_for, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
      lines.push(`    ${at}: ${c.count_at_time}`);
    }
  }
  lines.push('');
  lines.push('--');
  lines.push('LandJet Growth Engine. Reply STOP if you want to pause these.');
  return lines.join('\n');
}

export function renderPulseHtml(snap: PulseSnapshot): string {
  const w = reportingWindows(snap.generated_at);
  const yesterdayLabel = fmtChicago(w.yesterdayStart, { weekday: 'long', month: 'short', day: 'numeric' });

  const cell = 'padding:4px 10px;font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:14px;color:#222;line-height:1.5';
  const lbl = `padding:4px 10px;font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:14px;color:#666;line-height:1.5;width:160px`;
  const sectionH = 'margin-top:20px;margin-bottom:6px;font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#1a8fb5';

  const replyDelta = signed(snap.vs_last_week.replies_delta);
  const sendsDelta = signed(snap.vs_last_week.sends_delta);
  const leadsDelta = signed(snap.vs_last_week.leads_added_delta);
  const meetingsDelta = signed(snap.vs_last_week.meetings_delta);

  const hotSample = snap.pipeline.hot_leads.slice(0, 3).map(h => `${h.name} at ${h.company || 'unknown'}`).join(' , ');
  const hotMore = snap.pipeline.hot_leads.length > 3 ? ` ... +${snap.pipeline.hot_leads.length - 3} more` : '';

  const needsYouRows = snap.needs_you.inbound_reply_count === 0
    ? `<tr><td style="${cell}" colspan="2"><em style="color:#666">Nothing waiting on you. Quiet inbox.</em></td></tr>`
    : snap.needs_you.inbound_replies.map(r => {
        const at = fmtChicago(r.received_at, { hour: 'numeric', minute: '2-digit' });
        return `<tr><td style="${cell}" colspan="2"><strong>${r.lead_name}</strong>${r.lead_company ? ` at ${r.lead_company}` : ''} <span style="color:#999">- received ${at}</span><br><span style="color:#444">${r.subject || '(no subject)'}</span>${r.snippet ? `<br><span style="color:#888;font-style:italic">"${r.snippet}"</span>` : ''}</td></tr>`;
      }).join('');

  const upcomingRows = snap.whats_next.upcoming_sends_24h === 0
    ? `<tr><td style="${cell}" colspan="2"><em style="color:#666">No sends queued in the next 24 hours.</em></td></tr>`
    : `<tr><td style="${cell}" colspan="2"><strong>${snap.whats_next.upcoming_sends_24h}</strong> email${snap.whats_next.upcoming_sends_24h === 1 ? '' : 's'} queued over the next 24h.</td></tr>` +
      snap.whats_next.upcoming_clusters.map(c => {
        const at = fmtChicago(c.scheduled_for, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
        return `<tr><td style="${lbl}">${at}</td><td style="${cell}">${c.count_at_time}</td></tr>`;
      }).join('');

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f7fa">
<div style="max-width:680px;margin:0 auto;padding:24px;background:#fff">
  <p style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:16px;color:#222;margin:0 0 8px">Good morning Ryan.</p>

  <div style="${sectionH}">Yesterday -- ${yesterdayLabel}</div>
  <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%">
    <tr><td style="${lbl}">Sent</td><td style="${cell}"><strong>${snap.yesterday.sends}</strong> emails <span style="color:#999">(cold ${snap.yesterday.sends_cold} , follow-up ${snap.yesterday.sends_followup})</span></td></tr>
    <tr><td style="${lbl}">Replies</td><td style="${cell}"><strong>${snap.yesterday.replies}</strong></td></tr>
    <tr><td style="${lbl}">Leads added</td><td style="${cell}"><strong>${snap.yesterday.leads_added}</strong> <span style="color:#999">(Apollo ${snap.yesterday.leads_added_apollo} , other ${snap.yesterday.leads_added_other})</span></td></tr>
    <tr><td style="${lbl}">Meetings booked</td><td style="${cell}"><strong>${snap.yesterday.meetings_booked}</strong></td></tr>
  </table>

  <div style="${sectionH}">Where we stand</div>
  <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%">
    <tr><td style="${lbl}">Pipeline</td><td style="${cell}"><strong>${snap.pipeline.total}</strong> leads <span style="color:#999">(new ${snap.pipeline.by_stage.new_lead} | contacted ${snap.pipeline.by_stage.contacted} | replied ${snap.pipeline.by_stage.replied} | meeting ${snap.pipeline.by_stage.meeting_scheduled} | won ${snap.pipeline.by_stage.enrolled})</span></td></tr>
    <tr><td style="${lbl}">Hot leads</td><td style="${cell}"><strong>${snap.pipeline.hot_leads.length}</strong>${snap.pipeline.hot_leads.length > 0 ? ` <span style="color:#666">(${hotSample}${hotMore})</span>` : ''}</td></tr>
    <tr><td style="${lbl}">Vs last week</td><td style="${cell}">sends <strong>${sendsDelta}</strong> , replies <strong>${replyDelta}</strong> , leads <strong>${leadsDelta}</strong> , meetings <strong>${meetingsDelta}</strong></td></tr>
  </table>

  <div style="${sectionH}">What needs you today</div>
  <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%">
    ${needsYouRows}
  </table>

  <div style="${sectionH}">What is next</div>
  <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%">
    ${upcomingRows}
  </table>

  <p style="margin-top:24px;font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:12px;color:#999">LandJet Growth Engine. Reply STOP if you want to pause these.</p>
</div>
</body></html>`;
}
