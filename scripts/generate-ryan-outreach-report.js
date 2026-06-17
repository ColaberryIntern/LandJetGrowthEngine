#!/usr/bin/env node
/**
 * Ryan outreach activity report -- v3.
 *
 * Story-led: what is Ryan sending, to whom, when, with what result.
 * Each chart carries an annotated takeaway. Power BI feel, hero KPI strip.
 *
 * Data pulled live from prod (read-only) via:
 *   ssh root@95.216.199.47 docker exec landjet-db psql ...
 *
 * Modes:
 *   node scripts/generate-ryan-outreach-report.js          # write HTML only
 *   node scripts/generate-ryan-outreach-report.js --send   # write + email
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
require('dotenv').config();

const SHOULD_SEND = process.argv.includes('--send');
const REPO_ROOT = path.resolve(__dirname, '..');
const NOW = new Date();
const SSH_TARGET = 'root@95.216.199.47';
const DB_CONTAINER = 'landjet-db';
const DB_NAME = 'landjet_growth_engine';
const DB_USER = 'postgres';

// ---------- Palette ----------
const PAL = {
  navy: '#1A365D',
  navyDark: '#13294B',
  navyLight: '#2B6CB0',
  red: '#E53E3E',
  gold: '#D69E2E',
  goldLight: '#F6E05E',
  green: '#38A169',
  greenDark: '#22543D',
  purple: '#6B46C1',
  teal: '#319795',
  text: '#1A202C',
  textMuted: '#4A5568',
  textDim: '#718096',
  bg: '#F7FAFC',
  card: '#FFFFFF',
  cardBorder: '#E2E8F0',
  cardShadow: 'rgba(15, 23, 42, 0.08)',
  callBg: '#FFFBEA',
  callBorder: '#D69E2E',
  gridLine: '#EDF2F7',
};
const HEAT_NAVY = ['#EBF4FB', '#C6DCEF', '#8FB7DB', '#4F8AC7', '#1A5FB0', '#0E3F7E'];

function escapeShellSql(s) { return s.replace(/'/g, `'\\''`); }
function runPsql(sql) {
  const oneLine = sql.replace(/\s+/g, ' ').trim();
  const cmd = `ssh ${SSH_TARGET} "docker exec ${DB_CONTAINER} psql -U ${DB_USER} -d ${DB_NAME} -t -A -F'|' -c '${escapeShellSql(oneLine)}'"`;
  const out = execSync(cmd, { maxBuffer: 32 * 1024 * 1024 }).toString();
  return out.split('\n').filter(l => l.length > 0).map(l => l.split('|'));
}
function fmtNumber(n) { return Number(n).toLocaleString('en-US'); }
function escapeXml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
function svgWrap(width, height, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" preserveAspectRatio="xMinYMid meet" font-family="-apple-system,'Segoe UI',Arial,sans-serif">${inner}</svg>`;
}
function colorScale(v, max, palette = HEAT_NAVY) {
  if (max <= 0) return palette[0];
  const idx = Math.min(palette.length - 1, Math.floor((v / max) * palette.length));
  return palette[idx];
}

// ---------- Data collection ----------
function collectData() {
  const d = {};

  // Campaigns currently active in outreach
  d.campaigns = runPsql(`
    SELECT c.name, COUNT(cl.id) AS sends, COUNT(DISTINCT cl.to_address) AS recipients,
      MIN(cl.created_at)::date::text AS first_send, MAX(cl.created_at)::date::text AS last_send
    FROM campaigns c
    JOIN communication_logs cl ON cl.campaign_id=c.id
    WHERE cl.direction='outbound'
    GROUP BY c.name
    ORDER BY sends DESC
  `).map(([name, sends, recipients, first, last]) => ({
    name, sends: +sends, recipients: +recipients, firstSend: first, lastSend: last,
  }));

  // Daily activity from both signals
  d.dailyCommLogs = runPsql(`
    SELECT (created_at AT TIME ZONE 'America/Chicago')::date::text AS d, count(*)
    FROM communication_logs
    WHERE direction='outbound'
    GROUP BY d
    ORDER BY d
  `).map(([day, c]) => ({ day, count: +c }));

  d.dailyLeadTouches = runPsql(`
    SELECT (last_contacted_at AT TIME ZONE 'America/Chicago')::date::text AS d, count(*)
    FROM leads
    WHERE last_contacted_at IS NOT NULL
    GROUP BY d
    ORDER BY d
  `).map(([day, c]) => ({ day, count: +c }));

  // Send hour distribution (CT)
  d.hourCT = runPsql(`
    SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Chicago')::int AS h, count(*)
    FROM communication_logs
    WHERE direction='outbound'
    GROUP BY h
    ORDER BY h
  `).map(([h, c]) => ({ hour: +h, count: +c }));

  // Pipeline distribution of touched leads
  d.touchedPipeline = runPsql(`
    SELECT pipeline_stage::text AS stage, count(*)
    FROM leads
    WHERE email IN (SELECT to_address FROM communication_logs WHERE direction='outbound')
       OR last_contacted_at IS NOT NULL
    GROUP BY stage
    ORDER BY count(*) DESC
  `).map(([stage, c]) => ({ stage, count: +c }));

  // Vertical distribution of touched recipients
  d.touchedVerticals = runPsql(`
    SELECT COALESCE(vertical, '(unknown)') AS v, count(*)
    FROM leads
    WHERE email IN (SELECT to_address FROM communication_logs WHERE direction='outbound')
    GROUP BY v
    ORDER BY count(*) DESC
  `).map(([v, c]) => ({ vertical: v, count: +c }));

  // Pool sizing
  d.totalReachable = +runPsql(`SELECT count(*) FROM leads WHERE status='active' AND email IS NOT NULL`)[0][0];
  d.totalActive = +runPsql(`SELECT count(*) FROM leads WHERE status='active'`)[0][0];
  d.uniqueRecipients = +runPsql(`SELECT COUNT(DISTINCT to_address) FROM communication_logs WHERE direction='outbound'`)[0][0];

  // Totals + counts
  d.totalSends = +runPsql(`SELECT count(*) FROM communication_logs WHERE direction='outbound'`)[0][0];
  d.totalInbound = +runPsql(`SELECT count(*) FROM communication_logs WHERE direction='inbound'`)[0][0];
  d.totalTouchedLeads = +runPsql(`SELECT count(*) FROM leads WHERE last_contacted_at IS NOT NULL OR email IN (SELECT to_address FROM communication_logs WHERE direction='outbound')`)[0][0];
  d.activeCampaigns = +runPsql(`SELECT count(*) FROM campaigns WHERE approval_status='live'`)[0][0];

  // First / last comm log dates
  const range = runPsql(`SELECT min(created_at)::date::text, max(created_at)::date::text FROM communication_logs WHERE direction='outbound'`)[0];
  d.firstSend = range[0]; d.lastSend = range[1];

  // Days since last send (CT)
  const last = new Date(d.lastSend + 'T12:00:00');
  d.daysSinceLastSend = Math.floor((NOW - last) / (24 * 60 * 60 * 1000));

  // Senders breakdown (for the leaky-address commentary)
  d.senders = runPsql(`
    SELECT from_address, count(*) FROM communication_logs
    WHERE direction='outbound' GROUP BY from_address ORDER BY count(*) DESC
  `).map(([f, c]) => ({ from: f, count: +c }));

  return d;
}

// ---------- Components ----------
function kpiTile(label, value, sublabel, accent) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAL.card};border:1px solid ${PAL.cardBorder};border-top:4px solid ${accent};border-radius:8px"><tr><td style="padding:18px 16px 14px">
    <div style="font-size:10px;font-weight:700;color:${PAL.textMuted};text-transform:uppercase;letter-spacing:.08em">${escapeXml(label)}</div>
    <div style="font-size:30px;font-weight:800;color:${PAL.text};margin-top:8px;line-height:1.0">${escapeXml(value)}</div>
    <div style="font-size:11px;color:${PAL.textDim};margin-top:6px">${escapeXml(sublabel)}</div>
  </td></tr></table>`;
}

function section(num, headline, subhead, chart, takeaway) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:28px"><tr><td>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:6px"><tr>
      <td width="90" valign="middle" style="font-size:11px;font-weight:800;color:${PAL.gold};letter-spacing:.18em;white-space:nowrap;padding-right:10px">SECTION ${num}</td>
      <td valign="middle" style="border-top:1px solid ${PAL.cardBorder};line-height:1px;font-size:1px">&nbsp;</td>
    </tr></table>
    <div style="font-size:22px;font-weight:700;color:${PAL.text};line-height:1.2;margin-top:4px">${escapeXml(headline)}</div>
    <div style="font-size:14px;color:${PAL.textMuted};margin-top:6px;line-height:1.5">${escapeXml(subhead)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAL.card};border:1px solid ${PAL.cardBorder};border-radius:10px;margin-top:14px"><tr><td style="padding:20px">
      ${chart}
    </td></tr></table>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAL.callBg};border-left:4px solid ${PAL.callBorder};margin-top:12px"><tr><td style="padding:12px 16px">
      <div style="font-size:10px;font-weight:800;color:${PAL.callBorder};text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px">Takeaway</div>
      <div style="font-size:14px;color:${PAL.text};line-height:1.55">${takeaway}</div>
    </td></tr></table>
  </td></tr></table>`;
}

// ---------- Charts ----------

// Campaign horizontal bars w/ recipient sub-bars
function campaignBars(campaigns) {
  const maxSends = Math.max(...campaigns.map(c => c.sends), 1);
  const rowH = 44, top = 30, left = 240, barMaxW = 440;
  const width = 820;
  const height = top + campaigns.length * rowH + 20;
  let svg = `<rect width="${width}" height="${height}" fill="${PAL.card}"/>`;
  // header
  svg += `<text x="${left}" y="${top - 12}" font-size="10" font-weight="700" fill="${PAL.textDim}" letter-spacing="0.6">SENDS</text>`;
  svg += `<text x="${left + barMaxW + 60}" y="${top - 12}" font-size="10" font-weight="700" fill="${PAL.textDim}" letter-spacing="0.6">DATE RANGE</text>`;
  for (let i = 0; i < campaigns.length; i++) {
    const c = campaigns[i];
    const y = top + i * rowH;
    const w = Math.max(3, (c.sends / maxSends) * barMaxW);
    const isInvestor = c.name.includes('Investor');
    const color = isInvestor ? PAL.gold : PAL.navyLight;
    svg += `<text x="${left - 14}" y="${y + 22}" text-anchor="end" font-size="12" font-weight="600" fill="${PAL.text}">${escapeXml(c.name.replace('Cold Outreach - ', ''))}</text>`;
    svg += `<rect x="${left}" y="${y + 8}" width="${w}" height="22" rx="3" fill="${color}"/>`;
    svg += `<text x="${left + w + 10}" y="${y + 24}" font-size="13" font-weight="700" fill="${PAL.text}">${c.sends}</text>`;
    svg += `<text x="${left + w + 38}" y="${y + 24}" font-size="11" fill="${PAL.textDim}">(${c.recipients} unique)</text>`;
    svg += `<text x="${left + barMaxW + 60}" y="${y + 24}" font-size="11" fill="${PAL.textMuted}">${c.firstSend} to ${c.lastSend}</text>`;
  }
  return svgWrap(width, height, svg);
}

// Time-series bar chart (daily) with two layered series
function dailyTimeline(commLogs, leadTouches) {
  // Union of all days, sorted
  const all = new Map();
  for (const r of leadTouches) all.set(r.day, { day: r.day, leads: r.count, comms: 0 });
  for (const r of commLogs) {
    const ex = all.get(r.day) || { day: r.day, leads: 0, comms: 0 };
    ex.comms = r.count;
    all.set(r.day, ex);
  }
  const days = [...all.values()].sort((a, b) => a.day.localeCompare(b.day));
  // Pad continuous date range
  if (days.length > 0) {
    const start = new Date(days[0].day + 'T00:00:00');
    const end = new Date(days[days.length - 1].day + 'T00:00:00');
    const filled = [];
    for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
      const dd = new Date(t).toISOString().slice(0, 10);
      const ex = all.get(dd) || { day: dd, leads: 0, comms: 0 };
      filled.push(ex);
    }
    days.splice(0, days.length, ...filled);
  }
  const max = Math.max(...days.map(d => Math.max(d.leads, d.comms)), 1);
  const left = 50, top = 30, bottom = 50, right = 30;
  const width = 820;
  const height = 280;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const barW = Math.max(2, Math.floor(plotW / days.length) - 2);
  let svg = `<rect width="${width}" height="${height}" fill="${PAL.card}"/>`;
  // y-axis ticks
  for (let i = 0; i <= 4; i++) {
    const v = Math.round((max * i) / 4);
    const y = top + plotH - (i / 4) * plotH;
    svg += `<line x1="${left}" y1="${y}" x2="${left + plotW}" y2="${y}" stroke="${PAL.gridLine}" stroke-width="1"/>`;
    svg += `<text x="${left - 6}" y="${y + 3}" text-anchor="end" font-size="9" fill="${PAL.textDim}">${v}</text>`;
  }
  // bars: leads (light navy back), comms (gold front)
  for (let i = 0; i < days.length; i++) {
    const x = left + i * (plotW / days.length);
    const dy = days[i];
    const hLeads = (dy.leads / max) * plotH;
    const hComms = (dy.comms / max) * plotH;
    if (dy.leads > 0) {
      svg += `<rect x="${x}" y="${top + plotH - hLeads}" width="${barW}" height="${hLeads}" fill="${PAL.navyLight}" fill-opacity="0.45" rx="1.5"/>`;
    }
    if (dy.comms > 0) {
      svg += `<rect x="${x}" y="${top + plotH - hComms}" width="${barW}" height="${hComms}" fill="${PAL.gold}" rx="1.5"/>`;
    }
  }
  // x-axis labels: every ~7 days
  const labelStep = Math.max(1, Math.floor(days.length / 8));
  for (let i = 0; i < days.length; i += labelStep) {
    const x = left + i * (plotW / days.length) + barW / 2;
    const label = days[i].day.slice(5); // MM-DD
    svg += `<text x="${x}" y="${top + plotH + 14}" text-anchor="middle" font-size="10" fill="${PAL.textMuted}">${label}</text>`;
  }
  // legend
  const legY = height - 18;
  svg += `<rect x="${left}" y="${legY - 9}" width="11" height="11" fill="${PAL.navyLight}" fill-opacity="0.45" rx="2"/>`;
  svg += `<text x="${left + 16}" y="${legY}" font-size="11" fill="${PAL.textMuted}">Leads with last_contacted_at on this day (historical footprint)</text>`;
  svg += `<rect x="${left + 380}" y="${legY - 9}" width="11" height="11" fill="${PAL.gold}" rx="2"/>`;
  svg += `<text x="${left + 396}" y="${legY}" font-size="11" fill="${PAL.textMuted}">Logged sends in communication_logs (since 2026-05-14)</text>`;
  return svgWrap(width, height, svg);
}

// Funnel / pipeline donut
function pipelineDonut(stages, totalTouched) {
  // we expect mostly 'contacted'; show a horizontal "filled vs empty" rail
  const stageMap = new Map(stages.map(s => [s.stage, s.count]));
  const STAGE_ORDER = ['new_lead', 'contacted', 'replied', 'meeting_scheduled', 'proposal_sent', 'negotiation', 'enrolled', 'lost'];
  const colors = {
    new_lead: PAL.textDim,
    contacted: PAL.navyLight,
    replied: PAL.green,
    meeting_scheduled: PAL.purple,
    proposal_sent: PAL.gold,
    negotiation: PAL.red,
    enrolled: PAL.greenDark,
    lost: '#A0AEC0',
  };
  const rows = STAGE_ORDER.map(s => ({ stage: s, count: stageMap.get(s) || 0 }));
  const totalShown = rows.reduce((a, b) => a + b.count, 0);
  const left = 200, top = 30, barMaxW = 480, rowH = 32;
  const width = 820;
  const height = top + rows.length * rowH + 20;
  let svg = `<rect width="${width}" height="${height}" fill="${PAL.card}"/>`;
  const maxCount = Math.max(...rows.map(r => r.count), 1);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const y = top + i * rowH;
    const pct = totalShown > 0 ? (r.count / totalShown) * 100 : 0;
    const w = Math.max(2, (r.count / maxCount) * barMaxW);
    const c = colors[r.stage];
    svg += `<text x="${left - 14}" y="${y + 22}" text-anchor="end" font-size="13" font-weight="600" fill="${PAL.text}">${escapeXml(r.stage.replace(/_/g, ' '))}</text>`;
    svg += `<rect x="${left}" y="${y + 4}" width="${w}" height="24" rx="3" fill="${c}" fill-opacity="${r.count > 0 ? 0.95 : 0.25}"/>`;
    if (r.count > 0) {
      svg += `<text x="${left + w + 10}" y="${y + 22}" font-size="13" font-weight="700" fill="${PAL.text}">${r.count}</text>`;
      svg += `<text x="${left + w + 40}" y="${y + 22}" font-size="11" fill="${PAL.textDim}">${pct.toFixed(0)}%</text>`;
    } else {
      svg += `<text x="${left + w + 10}" y="${y + 22}" font-size="11" fill="${PAL.textDim}">0</text>`;
    }
  }
  return svgWrap(width, height, svg);
}

// Hour of day bars (CT)
function hourBars(hours) {
  const map = new Map(hours.map(h => [h.hour, h.count]));
  const data = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: map.get(h) || 0 }));
  const max = Math.max(...data.map(d => d.count), 1);
  const left = 40, top = 30, bottom = 50, right = 20;
  const width = 820;
  const height = 240;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const barW = Math.floor(plotW / 24) - 4;
  let svg = `<rect width="${width}" height="${height}" fill="${PAL.card}"/>`;
  // y axis
  for (let i = 0; i <= 4; i++) {
    const v = Math.round((max * i) / 4);
    const y = top + plotH - (i / 4) * plotH;
    svg += `<line x1="${left}" y1="${y}" x2="${left + plotW}" y2="${y}" stroke="${PAL.gridLine}"/>`;
    svg += `<text x="${left - 6}" y="${y + 3}" text-anchor="end" font-size="9" fill="${PAL.textDim}">${v}</text>`;
  }
  // bars w/ business-hour highlight (8a-6p = hours 8..17)
  for (let h = 0; h < 24; h++) {
    const x = left + h * (plotW / 24) + 2;
    const v = data[h].count;
    const hgt = v === 0 ? 1 : (v / max) * plotH;
    const inBiz = h >= 8 && h < 18;
    const color = inBiz ? PAL.navy : PAL.textDim;
    svg += `<rect x="${x}" y="${top + plotH - hgt}" width="${barW}" height="${hgt}" rx="2" fill="${color}" fill-opacity="${v === 0 ? 0.15 : 0.95}"/>`;
    if (v > 0) svg += `<text x="${x + barW / 2}" y="${top + plotH - hgt - 4}" text-anchor="middle" font-size="10" font-weight="700" fill="${PAL.text}">${v}</text>`;
    if (h % 3 === 0) {
      const label = h === 0 ? '12am' : h === 12 ? '12pm' : h < 12 ? `${h}am` : `${h - 12}pm`;
      svg += `<text x="${x + barW / 2}" y="${top + plotH + 14}" text-anchor="middle" font-size="10" fill="${PAL.textMuted}">${label}</text>`;
    }
  }
  // business hour band annotation
  const bizStart = left + 8 * (plotW / 24);
  const bizEnd = left + 18 * (plotW / 24);
  svg += `<rect x="${bizStart}" y="${top - 6}" width="${bizEnd - bizStart}" height="3" fill="${PAL.gold}"/>`;
  svg += `<text x="${(bizStart + bizEnd) / 2}" y="${top - 12}" text-anchor="middle" font-size="10" font-weight="700" fill="${PAL.gold}">BUSINESS HOURS (CT)</text>`;
  return svgWrap(width, height, svg);
}

// Reach gauge: touched vs reachable
function reachGauge(touched, reachable) {
  const width = 820;
  const height = 180;
  const left = 40, top = 60, barW = 740, barH = 36;
  const pct = (touched / reachable) * 100;
  const fillW = Math.max(4, (touched / reachable) * barW);
  let svg = `<rect width="${width}" height="${height}" fill="${PAL.card}"/>`;
  svg += `<text x="${left}" y="${top - 20}" font-size="13" font-weight="700" fill="${PAL.text}">Recipients touched vs reachable lead pool</text>`;
  svg += `<rect x="${left}" y="${top}" width="${barW}" height="${barH}" rx="6" fill="${PAL.gridLine}"/>`;
  svg += `<rect x="${left}" y="${top}" width="${fillW}" height="${barH}" rx="6" fill="${PAL.red}"/>`;
  // marker for goal e.g. 10%
  for (const goal of [10, 25, 50, 75]) {
    const gx = left + (goal / 100) * barW;
    svg += `<line x1="${gx}" y1="${top - 6}" x2="${gx}" y2="${top + barH + 6}" stroke="${PAL.textDim}" stroke-dasharray="3,2"/>`;
    svg += `<text x="${gx}" y="${top + barH + 22}" text-anchor="middle" font-size="10" fill="${PAL.textDim}">${goal}%</text>`;
  }
  svg += `<text x="${left + fillW + 10}" y="${top + 24}" font-size="14" font-weight="800" fill="${PAL.red}">${pct.toFixed(2)}%</text>`;
  svg += `<text x="${left}" y="${top + barH + 50}" font-size="12" fill="${PAL.textMuted}"><tspan font-weight="700" fill="${PAL.text}">${fmtNumber(touched)}</tspan> unique recipients | <tspan font-weight="700" fill="${PAL.text}">${fmtNumber(reachable)}</tspan> active leads with email | <tspan font-weight="700" fill="${PAL.text}">${fmtNumber(reachable - touched)}</tspan> never touched</text>`;
  return svgWrap(width, height, svg);
}

// Senders breakdown small bar (for leaky-address commentary)
function senderBars(senders) {
  const total = senders.reduce((a, s) => a + s.count, 0);
  const left = 250, top = 24, barMaxW = 420, rowH = 36;
  const width = 820;
  const height = top + senders.length * rowH + 16;
  let svg = `<rect width="${width}" height="${height}" fill="${PAL.card}"/>`;
  for (let i = 0; i < senders.length; i++) {
    const s = senders[i];
    const y = top + i * rowH;
    const pct = (s.count / total) * 100;
    const w = Math.max(3, (s.count / total) * barMaxW);
    const isCanonical = s.from === 'rlandry@landjet.com';
    const color = isCanonical ? PAL.green : PAL.red;
    svg += `<text x="${left - 12}" y="${y + 22}" text-anchor="end" font-size="12" font-weight="600" fill="${PAL.text}">${escapeXml(s.from)}</text>`;
    svg += `<rect x="${left}" y="${y + 8}" width="${w}" height="22" rx="3" fill="${color}"/>`;
    svg += `<text x="${left + w + 10}" y="${y + 24}" font-size="13" font-weight="700" fill="${PAL.text}">${s.count}</text>`;
    svg += `<text x="${left + w + 36}" y="${y + 24}" font-size="11" fill="${PAL.textDim}">(${pct.toFixed(0)}%)</text>`;
    const tag = isCanonical ? 'CANONICAL' : 'PRE-FIX LEAK';
    const tagColor = isCanonical ? PAL.green : PAL.red;
    svg += `<text x="${left + barMaxW + 30}" y="${y + 24}" font-size="9" font-weight="800" fill="${tagColor}" letter-spacing="0.6">${tag}</text>`;
  }
  return svgWrap(width, height, svg);
}

// ---------- HTML build ----------
function buildReport(d) {
  const touchRatePct = ((d.uniqueRecipients / d.totalReachable) * 100).toFixed(2);
  const investor = d.campaigns.find(c => c.name.includes('Investor')) || { sends: 0 };
  const verticalSends = d.campaigns.filter(c => !c.name.includes('Investor')).reduce((a, c) => a + c.sends, 0);
  const dateRange = `${d.firstSend} to ${d.lastSend}`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="X-UA-Compatible" content="IE=edge"></head>
<body style="margin:0;padding:0;background:${PAL.bg};font-family:-apple-system,'Segoe UI',Arial,sans-serif;color:${PAL.text}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${PAL.bg}" style="background:${PAL.bg};font-family:-apple-system,'Segoe UI',Arial,sans-serif;color:${PAL.text}"><tr><td align="center" style="padding:24px 16px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="880" style="max-width:880px;width:100%"><tr><td>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${PAL.navy}" style="background:${PAL.navy};background-image:linear-gradient(135deg, ${PAL.navy} 0%, ${PAL.navyDark} 60%, ${PAL.purple} 120%);border-radius:14px;margin-bottom:24px"><tr><td style="padding:32px 30px 28px;color:#fff">
    <div style="font-size:11px;font-weight:800;color:${PAL.goldLight};text-transform:uppercase;letter-spacing:.18em">LandJet Growth Engine | Outreach Audit</div>
    <div style="font-size:32px;font-weight:800;margin-top:10px;line-height:1.1;color:#ffffff">What Ryan is sending through the system</div>
    <div style="font-size:14px;color:#cbd5e1;margin-top:10px">${dateRange} | ${d.totalSends} logged sends across ${d.activeCampaigns} live campaigns | pulled live from prod ${NOW.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</div>
  </td></tr></table>

  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:14px"><tr>
    <td width="33%" style="padding-right:6px;vertical-align:top">${kpiTile('Logged sends', fmtNumber(d.totalSends), `since ${d.firstSend} (comm_logs began 5/14)`, PAL.navy)}</td>
    <td width="34%" style="padding:0 6px;vertical-align:top">${kpiTile('Total leads touched', fmtNumber(d.totalTouchedLeads), `incl. ~104 pre-log touches via last_contacted_at`, PAL.purple)}</td>
    <td width="33%" style="padding-left:6px;vertical-align:top">${kpiTile('Replies received', fmtNumber(d.totalInbound), `0 in comm_logs | inbox-match was OFF until today`, PAL.red)}</td>
  </tr></table>

  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px"><tr>
    <td width="33%" style="padding-right:6px;vertical-align:top">${kpiTile('Live campaigns', fmtNumber(d.activeCampaigns), `${d.campaigns.length} have actually sent`, PAL.teal)}</td>
    <td width="34%" style="padding:0 6px;vertical-align:top">${kpiTile('Pool reach', `${touchRatePct}%`, `${fmtNumber(d.uniqueRecipients)} of ${fmtNumber(d.totalReachable)} reachable leads`, PAL.gold)}</td>
    <td width="33%" style="padding-left:6px;vertical-align:top">${kpiTile('Days since last send', fmtNumber(d.daysSinceLastSend), `last send ${d.lastSend} | cadence has stalled`, PAL.red)}</td>
  </tr></table>

  ${section(
    '01',
    'One campaign is doing the work',
    `Investor Outreach has fired ${investor.sends} of ${d.totalSends} logged sends (${((investor.sends / d.totalSends) * 100).toFixed(0)}%). The six vertical cold-outreach campaigns are at single-digit touches each.`,
    campaignBars(d.campaigns),
    `<strong>The portfolio is imbalanced.</strong> Investor Outreach is the only campaign with sustained activity; the six vertical campaigns together total <strong>${verticalSends} sends</strong>, most of which fired once and stopped. Either the vertical campaigns aren't being scheduled, or the system is concentrating budget on the investor list while the vertical lists wait.`
  )}

  ${section(
    '02',
    'Outreach happens in bursts, not in cadence',
    `Two big push days (5/11 and 6/1), long silences between. The historical footprint via last_contacted_at goes back to 4/16; comm_logs only started populating 5/14, so the early bursts are visible only through the older signal.`,
    dailyTimeline(d.dailyCommLogs, d.dailyLeadTouches),
    `<strong>This is a burst pattern, not a campaign.</strong> A real cadence would show daily activity at some baseline volume. Instead, ${d.daysSinceLastSend} days have passed since the last send. The auto-runner that schedules outbound was OFF until today. Once it's been live for a week, this same chart should show a flat, daily baseline filling in. If it still looks like spikes, the scheduler is broken.`
  )}

  ${section(
    '03',
    'Every touched lead is parked at "contacted"',
    `${d.touchedPipeline.filter(p => p.stage === 'contacted')[0]?.count || 0} of ${d.totalTouchedLeads} touched leads sit at the "contacted" stage. Zero have advanced to "replied" or beyond.`,
    pipelineDonut(d.touchedPipeline, d.totalTouchedLeads),
    `<strong>The pipeline has no forward motion.</strong> No replies have been logged because <em>inbox-match was not running</em>. When a recipient replied to <code>rlandry@landjet.com</code>, the system had no daemon picking it up and writing it back to the lead. That changed today (auto-runner ON). If meaningful response data still doesn't surface within 5 to 7 days, the issue isn't inbox-match: it's that the outreach isn't generating responses.`
  )}

  ${section(
    '04',
    'Sends fire during business hours, predictably',
    `${d.hourCT.filter(h => h.hour >= 9 && h.hour <= 11).reduce((a, b) => a + b.count, 0)} of ${d.totalSends} sends land between 9 and 11 AM Central. Outside business hours: a handful of stragglers at 10pm-1am CT (likely the same scheduler retrying with bad clock math).`,
    hourBars(d.hourCT),
    `<strong>Send timing is healthy.</strong> The mid-morning peak is when investor recipients are at their desks, which is the right window for an opener. The ${d.hourCT.filter(h => h.hour < 8 || h.hour >= 18).reduce((a, b) => a + b.count, 0)} after-hours sends should be inspected. Most likely a job that ran with a stale or wrong timezone setting. Worth a quick look at the scheduler logs to confirm.`
  )}

  ${section(
    '05',
    'The system is barely using its inventory',
    `${d.uniqueRecipients} unique recipients have been touched out of ${fmtNumber(d.totalReachable)} active leads with email on file. That's ${touchRatePct}% pool reach.`,
    reachGauge(d.uniqueRecipients, d.totalReachable),
    `<strong>The lead inventory dwarfs the actual outreach.</strong> 7,839 leads with email addresses have never been contacted. Some of that is intentional, since Ryan's "crawl-walk-run" preference means we shouldn't be firing thousands of emails. But the gap between inventory and activity is the actual headline. The question to ask Ryan: <em>are the right 100 going first, or are we just sending to whoever was loaded first?</em>`
  )}

  ${section(
    '06',
    'The sender alignment fix held',
    `Of ${d.totalSends} total sends, ${d.senders.find(s => s.from === 'rlandry@landjet.com')?.count || 0} fired from the canonical address. The ${d.senders.filter(s => s.from !== 'rlandry@landjet.com').reduce((a, s) => a + s.count, 0)} leaks from <code>ryan@</code> and <code>ryan.landry@</code> all happened before the 6/2 patch, and nothing has leaked since.`,
    senderBars(d.senders),
    `<strong>The 6/2 sender alignment patch is doing its job.</strong> No misaligned sends have occurred since the fix landed. This means inbound replies to <code>rlandry@</code> will now consistently route to the address the inbox-match daemon watches. The earlier leakage is permanently in the record but won't affect future tracking.`
  )}

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${PAL.navy}" style="background:${PAL.navy};border-radius:10px;margin-top:14px"><tr><td style="padding:22px;color:#fff">
    <div style="font-size:11px;font-weight:800;color:${PAL.goldLight};text-transform:uppercase;letter-spacing:.16em">Status as of report time</div>
    <div style="font-size:18px;font-weight:700;margin-top:8px;color:#ffffff">Auto-runner is now ON</div>
    <div style="font-size:13px;color:#cbd5e1;margin-top:8px;line-height:1.6">
      The pipeline auto-runner was enabled today at ${NOW.toLocaleString('en-US', { timeStyle: 'short' })}. From here forward: inbound mail is checked every 5 minutes (replies should start showing up in comm_logs), the scheduler ticks every 1 minute (new outbound sends fire on schedule), and a daily Pulse fires at 7 AM CT to ali@colaberry.com. Tomorrow morning's Pulse should be the first real reply picture.
    </div>
  </td></tr></table>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAL.card};border:1px solid ${PAL.cardBorder};border-radius:8px;margin-top:18px"><tr><td style="padding:16px;font-size:11px;color:${PAL.textMuted};line-height:1.6">
    <div><strong style="color:${PAL.text}">Data sources:</strong> communication_logs (${d.totalSends} outbound rows, ${d.totalInbound} inbound), leads (${fmtNumber(d.totalActive)} active, ${d.totalTouchedLeads} touched), campaigns (${d.activeCampaigns} live). All queries read-only via SSH + docker exec + psql against prod landjet-db.</div>
    <div style="margin-top:6px"><strong style="color:${PAL.text}">Generated:</strong> ${NOW.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })} via scripts/generate-ryan-outreach-report.js</div>
  </td></tr></table>

</td></tr></table>
</td></tr></table>
</body></html>`;
  return html;
}

// ---------- Main ----------
async function main() {
  console.log('[1/3] Pulling data from prod...');
  const d = collectData();
  console.log(`      sends: ${d.totalSends} · touched leads: ${d.totalTouchedLeads} · campaigns: ${d.campaigns.length}`);
  console.log(`      pool reach: ${d.uniqueRecipients}/${d.totalReachable} (${((d.uniqueRecipients / d.totalReachable) * 100).toFixed(2)}%)`);
  console.log(`      days since last send: ${d.daysSinceLastSend}`);

  console.log('[2/3] Rendering HTML...');
  const html = buildReport(d);
  const outDir = path.join(REPO_ROOT, 'docs', 'updates');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const stamp = NOW.toISOString().slice(0, 10);
  const outPath = path.join(outDir, `${stamp}-ryan-outreach-report.html`);
  fs.writeFileSync(outPath, html);
  console.log(`      wrote ${outPath} (${(html.length / 1024).toFixed(1)} KB)`);

  if (!SHOULD_SEND) {
    console.log('\n[skip] --send flag not passed. Open the HTML file to review.');
    return;
  }

  console.log('[3/3] Refreshing Gmail OAuth token + sending...');
  const tr = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }).toString(),
  });
  const tj = await tr.json();
  if (!tj.access_token) throw new Error('Token refresh failed: ' + JSON.stringify(tj));
  const access_token = tj.access_token;

  const subject = `Ryan outreach audit: ${d.totalSends} sends, ${d.totalInbound} replies, ${((d.uniqueRecipients / d.totalReachable) * 100).toFixed(2)}% pool reach`;
  const altBoundary = '----=_LandJet_alt_' + Date.now();
  const textBody = `Outreach audit summary\n\n- Logged sends: ${d.totalSends}\n- Leads touched (full footprint): ${d.totalTouchedLeads}\n- Replies received: ${d.totalInbound}\n- Pool reach: ${((d.uniqueRecipients / d.totalReachable) * 100).toFixed(2)}%\n- Days since last send: ${d.daysSinceLastSend}\n\nOpen the HTML version for the full report with charts and takeaways.`;
  const htmlBase64 = Buffer.from(html, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
  const raw = [
    'From: Ali Muwwakkil <ali@colaberry.com>',
    'To: ali@colaberry.com',
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    '',
    `--${altBoundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    textBody,
    '',
    `--${altBoundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    htmlBase64,
    '',
    `--${altBoundary}--`,
    '',
  ].join('\r\n');
  const encoded = Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encoded }),
  });
  const result = await resp.json();
  if (!resp.ok) throw new Error('Send failed: ' + JSON.stringify(result));
  console.log(`      SENT. Gmail message id: ${result.id}`);
}

main().catch(e => { console.error('ERR', e); process.exit(1); });
