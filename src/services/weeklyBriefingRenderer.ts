/**
 * Weekly Friday briefing renderer.
 *
 * Pure functions: data shape + chart SVGs + HTML body. No I/O.
 * Consumed by weeklyBriefingService.ts which handles data collection and send.
 *
 * Design mirrors the v3 Ryan outreach audit Ali signed off on 2026-06-17.
 * Six SVG charts get rasterized to PNG before send (Gmail strips inline svg).
 */

export interface BriefingData {
  totalSends: number;
  totalInbound: number;
  totalTouchedLeads: number;
  totalActive: number;
  totalReachable: number;
  uniqueRecipients: number;
  uniqueRespondedRecipients: number;
  replySource: 'graph_inbox' | 'comm_logs' | 'unavailable';
  leadsEmailed: number;
  leadsLinkedInOnly: number;
  activeCampaigns: number;
  firstSend: string;
  lastSend: string;
  daysSinceLastSend: number;
  campaigns: Array<{ name: string; sends: number; recipients: number; firstSend: string; lastSend: string }>;
  dailyCommLogs: Array<{ day: string; count: number }>;
  dailyLeadTouches: Array<{ day: string; count: number }>;
  hourCT: Array<{ hour: number; count: number }>;
  touchedPipeline: Array<{ stage: string; count: number }>;
  senders: Array<{ from: string; count: number }>;
  // Per-channel splits (blue=email / teal=LinkedIn) used across charts 1,3,4,5.
  campaignChannel: Array<{ name: string; emailed: number; linkedinOnly: number }>;
  pipelineChannel: Array<{ stage: string; emailed: number; linkedinOnly: number }>;
  dailyEmail: Array<{ day: string; count: number }>;
  dailyLinkedIn: Array<{ day: string; count: number }>;
  hourEmail: Array<{ hour: number; count: number }>;
  hourLinkedIn: Array<{ hour: number; count: number }>;
  // Distinct leads who replied (validated by replyIngestionService), newest first.
  responders: Array<{ name: string; company: string | null; subject: string | null; body: string | null; day: string }>;
}

// Shared channel palette + legend so every chart reads the same way.
const CH_EMAIL = '#38A169';   // green = email    (PAL.green)
const CH_LINKEDIN = '#2B6CB0'; // blue  = LinkedIn (PAL.navyLight)
function channelLegend(x: number, y: number): string {
  return `<rect x="${x}" y="${y - 9}" width="11" height="11" rx="2" fill="${CH_EMAIL}"/>`
    + `<text x="${x + 16}" y="${y}" font-size="11" fill="#4A5568">Email</text>`
    + `<rect x="${x + 70}" y="${y - 9}" width="11" height="11" rx="2" fill="${CH_LINKEDIN}"/>`
    + `<text x="${x + 86}" y="${y}" font-size="11" fill="#4A5568">LinkedIn</text>`;
}

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

function escXml(s: unknown): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function fmtNumber(n: number): string { return Number(n).toLocaleString('en-US'); }
function svgWrap(width: number, height: number, inner: string): string {
  // 'DejaVu Sans' is the font installed in the backend container (see
  // Dockerfile.backend). It MUST be listed first so librsvg resolves a real
  // font during rasterization; the others are only honored if this ever renders
  // somewhere with richer fonts. Without a resolvable font, text became squares.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" preserveAspectRatio="xMinYMid meet" font-family="'DejaVu Sans',-apple-system,'Segoe UI',Arial,sans-serif">${inner}</svg>`;
}

function kpiTile(label: string, value: string, sublabel: string, accent: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAL.card};border:1px solid ${PAL.cardBorder};border-top:4px solid ${accent};border-radius:8px"><tr><td style="padding:18px 16px 14px">
    <div style="font-size:10px;font-weight:700;color:${PAL.textMuted};text-transform:uppercase;letter-spacing:.08em">${escXml(label)}</div>
    <div style="font-size:30px;font-weight:800;color:${PAL.text};margin-top:8px;line-height:1.0">${escXml(value)}</div>
    <div style="font-size:11px;color:${PAL.textDim};margin-top:6px">${escXml(sublabel)}</div>
  </td></tr></table>`;
}

function section(num: string, headline: string, subhead: string, chart: string, takeaway: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:28px"><tr><td>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:6px"><tr>
      <td width="90" valign="middle" style="font-size:11px;font-weight:800;color:${PAL.gold};letter-spacing:.18em;white-space:nowrap;padding-right:10px">SECTION ${num}</td>
      <td valign="middle" style="border-top:1px solid ${PAL.cardBorder};line-height:1px;font-size:1px">&nbsp;</td>
    </tr></table>
    <div style="font-size:22px;font-weight:700;color:${PAL.text};line-height:1.2;margin-top:4px">${escXml(headline)}</div>
    <div style="font-size:14px;color:${PAL.textMuted};margin-top:6px;line-height:1.5">${escXml(subhead)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAL.card};border:1px solid ${PAL.cardBorder};border-radius:10px;margin-top:14px"><tr><td style="padding:20px">
      ${chart}
    </td></tr></table>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAL.callBg};border-left:4px solid ${PAL.callBorder};margin-top:12px"><tr><td style="padding:12px 16px">
      <div style="font-size:10px;font-weight:800;color:${PAL.callBorder};text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px">Takeaway</div>
      <div style="font-size:14px;color:${PAL.text};line-height:1.55">${takeaway}</div>
    </td></tr></table>
  </td></tr></table>`;
}

// ----- chart 1: campaign bars, split email (blue) vs LinkedIn (teal) -----
function campaignBars(rows: BriefingData['campaignChannel']): string {
  if (rows.length === 0) return '<div style="padding:20px;color:#666;text-align:center">No campaigns have reached anyone in this window.</div>';
  const maxTotal = Math.max(...rows.map(c => c.emailed + c.linkedinOnly), 1);
  const rowH = 40, top = 40, left = 250, barMaxW = 430, width = 820;
  const height = top + rows.length * rowH + 28;
  let svg = `<rect width="${width}" height="${height}" fill="${PAL.card}"/>`;
  svg += channelLegend(left, top - 16);
  svg += `<text x="${left + barMaxW + 50}" y="${top - 16}" font-size="10" font-weight="700" fill="${PAL.textDim}" letter-spacing="0.6">LEADS REACHED</text>`;
  for (let i = 0; i < rows.length; i++) {
    const c = rows[i];
    const total = c.emailed + c.linkedinOnly;
    const y = top + i * rowH;
    const we = (c.emailed / maxTotal) * barMaxW;
    const wl = (c.linkedinOnly / maxTotal) * barMaxW;
    const label = c.name.replace('Cold Outreach - ', '');
    svg += `<text x="${left - 14}" y="${y + 20}" text-anchor="end" font-size="12" font-weight="600" fill="${PAL.text}">${escXml(label)}</text>`;
    if (c.emailed > 0) svg += `<rect x="${left}" y="${y + 6}" width="${Math.max(2, we)}" height="22" rx="2" fill="${CH_EMAIL}"/>`;
    if (c.linkedinOnly > 0) svg += `<rect x="${left + we}" y="${y + 6}" width="${Math.max(2, wl)}" height="22" rx="2" fill="${CH_LINKEDIN}"/>`;
    svg += `<text x="${left + we + wl + 10}" y="${y + 22}" font-size="12" font-weight="700" fill="${PAL.text}">${total}</text>`;
    svg += `<text x="${left + we + wl + 34}" y="${y + 22}" font-size="10" fill="${PAL.textDim}">${c.emailed}e / ${c.linkedinOnly}li</text>`;
  }
  return svgWrap(width, height, svg);
}

// ----- chart: channel mix (emailed vs LinkedIn-only) -----
function channelMixBars(emailed: number, linkedinOnly: number): string {
  const total = emailed + linkedinOnly;
  const rows = [
    { label: 'Emailed', sub: 'received an email send', count: emailed, color: CH_EMAIL },
    { label: 'LinkedIn only', sub: 'touched via LinkedIn, never emailed', count: linkedinOnly, color: CH_LINKEDIN },
  ];
  const max = Math.max(emailed, linkedinOnly, 1);
  const left = 150, top = 28, barMaxW = 480, rowH = 56, width = 820;
  const height = top + rows.length * rowH + 16;
  let svg = `<rect width="${width}" height="${height}" fill="${PAL.card}"/>`;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const y = top + i * rowH;
    const w = Math.max(3, (r.count / max) * barMaxW);
    const pct = total > 0 ? (r.count / total) * 100 : 0;
    svg += `<text x="${left - 14}" y="${y + 22}" text-anchor="end" font-size="13" font-weight="700" fill="${PAL.text}">${escXml(r.label)}</text>`;
    svg += `<rect x="${left}" y="${y + 6}" width="${w}" height="24" rx="3" fill="${r.color}"/>`;
    svg += `<text x="${left + w + 10}" y="${y + 24}" font-size="14" font-weight="800" fill="${PAL.text}">${r.count}</text>`;
    svg += `<text x="${left + w + 44}" y="${y + 24}" font-size="11" fill="${PAL.textDim}">${pct.toFixed(0)}% of reached</text>`;
    svg += `<text x="${left - 14}" y="${y + 40}" text-anchor="end" font-size="10" fill="${PAL.textDim}">${escXml(r.sub)}</text>`;
  }
  return svgWrap(width, height, svg);
}

// ----- chart 3: daily timeline, email (blue) vs LinkedIn (teal) -----
function dailyTimeline(emailByDay: BriefingData['dailyEmail'], linkedinByDay: BriefingData['dailyLinkedIn']): string {
  const all = new Map<string, { day: string; email: number; li: number }>();
  for (const r of emailByDay) all.set(r.day, { day: r.day, email: r.count, li: 0 });
  for (const r of linkedinByDay) {
    const ex = all.get(r.day) || { day: r.day, email: 0, li: 0 };
    ex.li = r.count;
    all.set(r.day, ex);
  }
  let days = [...all.values()].sort((a, b) => a.day.localeCompare(b.day));
  if (days.length > 0) {
    const start = new Date(days[0].day + 'T00:00:00');
    const end = new Date(days[days.length - 1].day + 'T00:00:00');
    const filled = [];
    for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
      const dd = new Date(t).toISOString().slice(0, 10);
      filled.push(all.get(dd) || { day: dd, email: 0, li: 0 });
    }
    days = filled;
  }
  if (days.length === 0) return '<div style="padding:20px;color:#666;text-align:center">No activity recorded.</div>';
  const max = Math.max(...days.map(d => Math.max(d.email, d.li)), 1);
  const left = 50, top = 30, bottom = 50, right = 30, width = 820, height = 280;
  const plotW = width - left - right, plotH = height - top - bottom;
  const slot = plotW / days.length;
  const barW = Math.max(2, Math.floor(slot / 2) - 1);
  let svg = `<rect width="${width}" height="${height}" fill="${PAL.card}"/>`;
  for (let i = 0; i <= 4; i++) {
    const v = Math.round((max * i) / 4);
    const y = top + plotH - (i / 4) * plotH;
    svg += `<line x1="${left}" y1="${y}" x2="${left + plotW}" y2="${y}" stroke="${PAL.gridLine}" stroke-width="1"/>`;
    svg += `<text x="${left - 6}" y="${y + 3}" text-anchor="end" font-size="9" fill="${PAL.textDim}">${v}</text>`;
  }
  for (let i = 0; i < days.length; i++) {
    const x = left + i * slot;
    const dy = days[i];
    const he = (dy.email / max) * plotH;
    const hl = (dy.li / max) * plotH;
    if (dy.email > 0) svg += `<rect x="${x}" y="${top + plotH - he}" width="${barW}" height="${he}" fill="${CH_EMAIL}" rx="1.5"/>`;
    if (dy.li > 0) svg += `<rect x="${x + barW + 1}" y="${top + plotH - hl}" width="${barW}" height="${hl}" fill="${CH_LINKEDIN}" rx="1.5"/>`;
  }
  const labelStep = Math.max(1, Math.floor(days.length / 8));
  for (let i = 0; i < days.length; i += labelStep) {
    const x = left + i * slot + barW;
    svg += `<text x="${x}" y="${top + plotH + 14}" text-anchor="middle" font-size="10" fill="${PAL.textMuted}">${days[i].day.slice(5)}</text>`;
  }
  svg += channelLegend(left, height - 14);
  return svgWrap(width, height, svg);
}

// ----- chart 4: pipeline stage bars, stacked email (blue) vs LinkedIn (teal) -----
function pipelineDonut(stages: BriefingData['pipelineChannel']): string {
  const stageMap = new Map(stages.map(s => [s.stage, s]));
  const STAGE_ORDER = ['new_lead', 'contacted', 'replied', 'meeting_scheduled', 'proposal_sent', 'negotiation', 'enrolled', 'lost'];
  const rows = STAGE_ORDER.map(s => stageMap.get(s) || { stage: s, emailed: 0, linkedinOnly: 0 });
  const left = 200, top = 40, barMaxW = 470, rowH = 32, width = 820;
  const height = top + rows.length * rowH + 20;
  const maxCount = Math.max(...rows.map(r => r.emailed + r.linkedinOnly), 1);
  let svg = `<rect width="${width}" height="${height}" fill="${PAL.card}"/>`;
  svg += channelLegend(left, top - 16);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const total = r.emailed + r.linkedinOnly;
    const y = top + i * rowH;
    const we = (r.emailed / maxCount) * barMaxW;
    const wl = (r.linkedinOnly / maxCount) * barMaxW;
    svg += `<text x="${left - 14}" y="${y + 22}" text-anchor="end" font-size="13" font-weight="600" fill="${PAL.text}">${escXml(r.stage.replace(/_/g, ' '))}</text>`;
    if (total === 0) {
      svg += `<rect x="${left}" y="${y + 4}" width="3" height="24" rx="2" fill="${PAL.textDim}" fill-opacity="0.25"/>`;
      svg += `<text x="${left + 12}" y="${y + 22}" font-size="11" fill="${PAL.textDim}">0</text>`;
      continue;
    }
    if (r.emailed > 0) svg += `<rect x="${left}" y="${y + 4}" width="${Math.max(2, we)}" height="24" rx="2" fill="${CH_EMAIL}"/>`;
    if (r.linkedinOnly > 0) svg += `<rect x="${left + we}" y="${y + 4}" width="${Math.max(2, wl)}" height="24" rx="2" fill="${CH_LINKEDIN}"/>`;
    svg += `<text x="${left + we + wl + 10}" y="${y + 22}" font-size="13" font-weight="700" fill="${PAL.text}">${total}</text>`;
    svg += `<text x="${left + we + wl + 36}" y="${y + 22}" font-size="10" fill="${PAL.textDim}">${r.emailed}e / ${r.linkedinOnly}li</text>`;
  }
  return svgWrap(width, height, svg);
}

// ----- chart 5: hour-of-day bars, email (blue) vs LinkedIn (teal) grouped -----
function hourBars(emailHours: BriefingData['hourEmail'], linkedinHours: BriefingData['hourLinkedIn']): string {
  const em = new Map(emailHours.map(h => [h.hour, h.count]));
  const li = new Map(linkedinHours.map(h => [h.hour, h.count]));
  const data = Array.from({ length: 24 }, (_, h) => ({ hour: h, email: em.get(h) || 0, li: li.get(h) || 0 }));
  const max = Math.max(...data.map(d => Math.max(d.email, d.li)), 1);
  const left = 40, top = 40, bottom = 50, right = 20, width = 820, height = 250;
  const plotW = width - left - right, plotH = height - top - bottom;
  const slot = plotW / 24;
  const barW = Math.max(2, Math.floor(slot / 2) - 1);
  let svg = `<rect width="${width}" height="${height}" fill="${PAL.card}"/>`;
  svg += channelLegend(left, top - 16);
  for (let i = 0; i <= 4; i++) {
    const v = Math.round((max * i) / 4);
    const y = top + plotH - (i / 4) * plotH;
    svg += `<line x1="${left}" y1="${y}" x2="${left + plotW}" y2="${y}" stroke="${PAL.gridLine}"/>`;
    svg += `<text x="${left - 6}" y="${y + 3}" text-anchor="end" font-size="9" fill="${PAL.textDim}">${v}</text>`;
  }
  for (let h = 0; h < 24; h++) {
    const x = left + h * slot;
    const he = data[h].email === 0 ? 0 : (data[h].email / max) * plotH;
    const hl = data[h].li === 0 ? 0 : (data[h].li / max) * plotH;
    if (he > 0) svg += `<rect x="${x}" y="${top + plotH - he}" width="${barW}" height="${he}" rx="2" fill="${CH_EMAIL}"/>`;
    if (hl > 0) svg += `<rect x="${x + barW + 1}" y="${top + plotH - hl}" width="${barW}" height="${hl}" rx="2" fill="${CH_LINKEDIN}"/>`;
    if (h % 3 === 0) {
      const label = h === 0 ? '12am' : h === 12 ? '12pm' : h < 12 ? `${h}am` : `${h - 12}pm`;
      svg += `<text x="${x + barW}" y="${top + plotH + 14}" text-anchor="middle" font-size="10" fill="${PAL.textMuted}">${label}</text>`;
    }
  }
  const bizStart = left + 8 * slot;
  const bizEnd = left + 18 * slot;
  svg += `<rect x="${bizStart}" y="${top - 4}" width="${bizEnd - bizStart}" height="3" fill="${PAL.gold}"/>`;
  return svgWrap(width, height, svg);
}

// ----- chart 5: reach gauge -----
function reachGauge(touched: number, reachable: number): string {
  const width = 820, height = 180;
  const left = 40, top = 60, barW = 740, barH = 36;
  const pct = reachable > 0 ? (touched / reachable) * 100 : 0;
  const fillW = Math.max(4, (touched / Math.max(reachable, 1)) * barW);
  let svg = `<rect width="${width}" height="${height}" fill="${PAL.card}"/>`;
  svg += `<text x="${left}" y="${top - 20}" font-size="13" font-weight="700" fill="${PAL.text}">Recipients touched vs reachable lead pool</text>`;
  svg += `<rect x="${left}" y="${top}" width="${barW}" height="${barH}" rx="6" fill="${PAL.gridLine}"/>`;
  svg += `<rect x="${left}" y="${top}" width="${fillW}" height="${barH}" rx="6" fill="${PAL.red}"/>`;
  for (const goal of [10, 25, 50, 75]) {
    const gx = left + (goal / 100) * barW;
    svg += `<line x1="${gx}" y1="${top - 6}" x2="${gx}" y2="${top + barH + 6}" stroke="${PAL.textDim}" stroke-dasharray="3,2"/>`;
    svg += `<text x="${gx}" y="${top + barH + 22}" text-anchor="middle" font-size="10" fill="${PAL.textDim}">${goal}%</text>`;
  }
  svg += `<text x="${left + fillW + 10}" y="${top + 24}" font-size="14" font-weight="800" fill="${PAL.red}">${pct.toFixed(2)}%</text>`;
  svg += `<text x="${left}" y="${top + barH + 50}" font-size="12" fill="${PAL.textMuted}"><tspan font-weight="700" fill="${PAL.text}">${fmtNumber(touched)}</tspan> unique recipients | <tspan font-weight="700" fill="${PAL.text}">${fmtNumber(reachable)}</tspan> active leads with email | <tspan font-weight="700" fill="${PAL.text}">${fmtNumber(reachable - touched)}</tspan> never touched</text>`;
  return svgWrap(width, height, svg);
}

// ----- chart 6: sender bars -----
function senderBars(senders: BriefingData['senders']): string {
  if (senders.length === 0) return '<div style="padding:20px;color:#666;text-align:center">No outbound senders recorded.</div>';
  const total = senders.reduce((a, s) => a + s.count, 0);
  const left = 250, top = 24, barMaxW = 420, rowH = 36, width = 820;
  const height = top + senders.length * rowH + 16;
  let svg = `<rect width="${width}" height="${height}" fill="${PAL.card}"/>`;
  for (let i = 0; i < senders.length; i++) {
    const s = senders[i];
    const y = top + i * rowH;
    const pct = (s.count / total) * 100;
    const w = Math.max(3, (s.count / total) * barMaxW);
    const isCanonical = s.from === 'rlandry@landjet.com';
    const color = isCanonical ? PAL.green : PAL.red;
    svg += `<text x="${left - 12}" y="${y + 22}" text-anchor="end" font-size="12" font-weight="600" fill="${PAL.text}">${escXml(s.from)}</text>`;
    svg += `<rect x="${left}" y="${y + 8}" width="${w}" height="22" rx="3" fill="${color}"/>`;
    svg += `<text x="${left + w + 10}" y="${y + 24}" font-size="13" font-weight="700" fill="${PAL.text}">${s.count}</text>`;
    svg += `<text x="${left + w + 36}" y="${y + 24}" font-size="11" fill="${PAL.textDim}">(${pct.toFixed(0)}%)</text>`;
    const tag = isCanonical ? 'CANONICAL' : 'PRE-FIX LEAK';
    const tagColor = isCanonical ? PAL.green : PAL.red;
    svg += `<text x="${left + barMaxW + 30}" y="${y + 24}" font-size="9" font-weight="800" fill="${tagColor}" letter-spacing="0.6">${tag}</text>`;
  }
  return svgWrap(width, height, svg);
}

function replyTileSub(d: BriefingData): string {
  if (d.replySource === 'unavailable') return 'no replies ingested yet';
  return `${fmtNumber(d.uniqueRespondedRecipients)} leads replied (validated)`;
}

function respondedRateSub(d: BriefingData): string {
  const base = `${fmtNumber(d.uniqueRespondedRecipients)} of ${fmtNumber(d.totalTouchedLeads)} reached leads have replied`;
  return `${base} | validated replies from Ryan's inbox (thread-confirmed; vendor/newsletter/internal excluded). Most are investor conversations.`;
}

// "Who replied" -- a plain HTML table (not rasterized) listing the validated
// responders so the reply number is not just a count but names you can act on.
function respondersCard(responders: BriefingData['responders']): string {
  if (responders.length === 0) return '';
  const rows = responders.slice(0, 20).map((r) => {
    const snippet = (r.body || '').replace(/\s+/g, ' ').trim();
    const shown = snippet.slice(0, 240);
    return `<tr><td style="padding:10px 14px;border-top:1px solid ${PAL.cardBorder}">
      <div style="font-size:13px"><span style="font-weight:700;color:${PAL.text}">${escXml(r.name)}</span>${r.company ? `<span style="color:${PAL.textMuted}"> &middot; ${escXml(r.company)}</span>` : ''}<span style="color:${PAL.textDim};font-size:11px"> &middot; ${escXml(r.day)}</span></div>
      ${r.subject ? `<div style="font-size:12px;color:${PAL.textMuted};margin-top:3px">${escXml(r.subject)}</div>` : ''}
      ${shown ? `<div style="font-size:12px;color:${PAL.text};margin-top:5px;line-height:1.5">${escXml(shown)}${snippet.length > 240 ? '&hellip;' : ''}</div>` : ''}
    </td></tr>`;
  }).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAL.card};border:1px solid ${PAL.cardBorder};border-top:4px solid ${PAL.green};border-radius:8px;margin-bottom:24px">
    <tr><td style="padding:14px 16px 4px">
      <div style="font-size:10px;font-weight:700;color:${PAL.green};text-transform:uppercase;letter-spacing:.08em">Who replied (${responders.length})</div>
      <div style="font-size:13px;color:${PAL.textMuted};margin-top:4px">Leads who answered our outreach, validated against the thread (vendor/newsletter/internal excluded). These are now marked "replied" in the pipeline.</div>
    </td></tr>
    <tr><td style="padding:6px 4px 10px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>
    </td></tr>
  </table>`;
}

export function renderBriefingHtml(d: BriefingData, now: Date): string {
  const touchRatePct = d.totalReachable > 0 ? ((d.uniqueRecipients / d.totalReachable) * 100).toFixed(2) : '0.00';
  const investor = d.campaigns.find(c => c.name.includes('Investor')) || { sends: 0 };
  const verticalSends = d.campaigns.filter(c => !c.name.includes('Investor')).reduce((a, c) => a + c.sends, 0);
  const dateRange = `${d.firstSend} to ${d.lastSend}`;
  const investorShareTxt = d.totalSends > 0 ? `${((investor.sends / d.totalSends) * 100).toFixed(0)}%` : '0%';
  const afterHours = d.hourCT.filter(h => h.hour < 8 || h.hour >= 18).reduce((a, b) => a + b.count, 0);
  const businessHours = d.hourCT.filter(h => h.hour >= 9 && h.hour <= 11).reduce((a, b) => a + b.count, 0);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="X-UA-Compatible" content="IE=edge"></head>
<body style="margin:0;padding:0;background:${PAL.bg};font-family:-apple-system,'Segoe UI',Arial,sans-serif;color:${PAL.text}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${PAL.bg}" style="background:${PAL.bg};font-family:-apple-system,'Segoe UI',Arial,sans-serif;color:${PAL.text}"><tr><td align="center" style="padding:24px 16px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="880" style="max-width:880px;width:100%"><tr><td>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${PAL.navy}" style="background:${PAL.navy};background-image:linear-gradient(135deg, ${PAL.navy} 0%, ${PAL.navyDark} 60%, ${PAL.purple} 120%);border-radius:14px;margin-bottom:24px"><tr><td style="padding:32px 30px 28px;color:#fff">
    <div style="font-size:11px;font-weight:800;color:${PAL.goldLight};text-transform:uppercase;letter-spacing:.18em">LandJet Growth Engine | Friday Pre-Call Briefing</div>
    <div style="font-size:32px;font-weight:800;margin-top:10px;line-height:1.1;color:#ffffff">What Ryan is sending through the system</div>
    <div style="font-size:14px;color:#cbd5e1;margin-top:10px">${dateRange} | ${d.totalSends} logged sends across ${d.activeCampaigns} live campaigns | snapshot taken ${now.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago' })} CT</div>
  </td></tr></table>

  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:14px"><tr>
    <td width="33%" style="padding-right:6px;vertical-align:top">${kpiTile('Emails sent (logged)', fmtNumber(d.totalSends), `since ${d.firstSend} (comm_logs began 5/14)`, PAL.navy)}</td>
    <td width="34%" style="padding:0 6px;vertical-align:top">${kpiTile('Total leads reached', fmtNumber(d.totalTouchedLeads), `${fmtNumber(d.leadsEmailed)} emailed, ${fmtNumber(d.leadsLinkedInOnly)} LinkedIn-only`, PAL.purple)}</td>
    <td width="33%" style="padding-left:6px;vertical-align:top">${kpiTile('Replies received', fmtNumber(d.totalInbound), replyTileSub(d), d.totalInbound > 0 ? PAL.green : PAL.red)}</td>
  </tr></table>

  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:14px"><tr>
    <td width="33%" style="padding-right:6px;vertical-align:top">${kpiTile('Live campaigns', fmtNumber(d.activeCampaigns), `${d.campaigns.length} have actually sent`, PAL.teal)}</td>
    <td width="34%" style="padding:0 6px;vertical-align:top">${kpiTile('Pool reach', `${touchRatePct}%`, `${fmtNumber(d.uniqueRecipients)} of ${fmtNumber(d.totalReachable)} reachable leads`, PAL.gold)}</td>
    <td width="33%" style="padding-left:6px;vertical-align:top">${kpiTile('Days since last send', fmtNumber(d.daysSinceLastSend), `last send ${d.lastSend}`, d.daysSinceLastSend > 3 ? PAL.red : PAL.green)}</td>
  </tr></table>

  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px"><tr>
    <td width="100%" style="vertical-align:top">${kpiTile(
      'Responded rate (leads who replied / leads reached)',
      d.totalTouchedLeads > 0 ? `${((d.uniqueRespondedRecipients / d.totalTouchedLeads) * 100).toFixed(2)}%` : 'n/a',
      respondedRateSub(d),
      d.uniqueRespondedRecipients > 0 ? PAL.green : PAL.red,
    )}</td>
  </tr></table>

  ${respondersCard(d.responders)}

  ${section('01', 'One campaign is doing the work',
    `Investor Outreach has fired ${investor.sends} of ${d.totalSends} logged sends (${investorShareTxt}). The vertical cold-outreach campaigns are at single-digit touches each.`,
    campaignBars(d.campaignChannel),
    `<strong>Portfolio balance check.</strong> Investor Outreach is the only campaign with sustained activity; the vertical campaigns together total <strong>${verticalSends} sends</strong>. Either the vertical campaigns are not being scheduled, or the system is concentrating budget on the investor list while the vertical lists wait.`)}

  ${section('02', 'Email vs LinkedIn: who actually got which touch',
    `Of ${d.totalTouchedLeads} leads reached, ${d.leadsEmailed} received an email and ${d.leadsLinkedInOnly} were touched on LinkedIn only (never emailed). LinkedIn touches are not logged in communication_logs; they are inferred from last_contacted_at on leads that have no email send.`,
    channelMixBars(d.leadsEmailed, d.leadsLinkedInOnly),
    `<strong>Channel reality.</strong> Yes, real emails went out -- to <strong>${d.leadsEmailed}</strong> people. But <strong>${d.leadsLinkedInOnly}</strong> of the ${d.totalTouchedLeads} reached (${d.totalTouchedLeads > 0 ? ((d.leadsLinkedInOnly / d.totalTouchedLeads) * 100).toFixed(0) : '0'}%) were LinkedIn-only. That matters because email replies are tracked automatically while LinkedIn replies are not, so the "responded rate" below only covers the ${d.leadsEmailed} we emailed. If the intent is measurable, trackable outreach, the email share needs to grow.`)}

  ${section('03', 'Outreach cadence',
    `${d.daysSinceLastSend} days since last send. The historical footprint via last_contacted_at extends back to 2026-04-16; comm_logs only started populating 5/14.`,
    dailyTimeline(d.dailyEmail, d.dailyLinkedIn),
    `<strong>Cadence reading.</strong> A real cadence would show daily activity at some baseline volume. If this chart still looks like spikes rather than a flat baseline, the scheduler is not feeding the queue, or the queue is empty.`)}

  ${section('04', 'Pipeline movement',
    `${d.uniqueRespondedRecipients} leads have advanced to "replied"; ${d.touchedPipeline.find(p => p.stage === 'contacted')?.count || 0} of ${d.totalTouchedLeads} reached leads are still at "contacted".`,
    pipelineDonut(d.pipelineChannel),
    `<strong>Pipeline forward motion.</strong> Reply write-back is now live: validated replies from Ryan's inbox advance the lead from contacted to replied automatically (and are recorded as inbound communication_logs). The green segment is the first real forward motion in the pipeline. Next step is moving "replied" leads on to meetings.`)}

  ${section('05', 'Send timing',
    `${businessHours} of ${d.totalSends} sends land between 9 and 11 AM Central. ${afterHours > 0 ? `${afterHours} after-hours sends to inspect.` : 'No after-hours sends this period.'}`,
    hourBars(d.hourEmail, d.hourLinkedIn),
    `<strong>Timing health.</strong> The mid-morning peak is when recipients are at their desks, which is the right window for an opener. After-hours sends usually indicate a job that ran with a stale or wrong timezone setting; worth checking the scheduler logs to confirm.`)}

  ${section('06', 'Pool utilization',
    `${d.uniqueRecipients} unique recipients out of ${fmtNumber(d.totalReachable)} active leads with email. That is ${touchRatePct}% pool reach.`,
    reachGauge(d.uniqueRecipients, d.totalReachable),
    `<strong>Inventory vs activity.</strong> ${fmtNumber(d.totalReachable - d.uniqueRecipients)} leads with email addresses have never been contacted. The question for the call: are the right 100 going first, or are we just sending to whoever was loaded first?`)}

  ${section('07', 'Sender alignment',
    `Of ${d.totalSends} total sends, ${d.senders.find(s => s.from === 'rlandry@landjet.com')?.count || 0} fired from the canonical address. The ${d.senders.filter(s => s.from !== 'rlandry@landjet.com').reduce((a, s) => a + s.count, 0)} from other addresses are pre-6/2 patch leaks.`,
    senderBars(d.senders),
    `<strong>Alignment status.</strong> The 6/2 sender alignment patch keeps inbound replies routing consistently to rlandry@. If any new pre-fix-style sends show up here, a regression has been introduced.`)}

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAL.card};border:1px solid ${PAL.cardBorder};border-radius:8px;margin-top:18px"><tr><td style="padding:16px;font-size:11px;color:${PAL.textMuted};line-height:1.6">
    <div><strong style="color:${PAL.text}">Data sources:</strong> communication_logs (${d.totalSends} outbound email rows; LinkedIn touches are not logged here), leads (${fmtNumber(d.totalActive)} active, ${d.totalTouchedLeads} reached: ${fmtNumber(d.leadsEmailed)} emailed + ${fmtNumber(d.leadsLinkedInOnly)} LinkedIn-only), campaigns (${d.activeCampaigns} live), replies (${d.totalInbound} ${d.replySource === 'graph_inbox' ? 'matched live from rlandry@landjet.com inbox' : d.replySource === 'unavailable' ? 'inbox read unavailable' : 'from comm_logs'}).</div>
    <div style="margin-top:6px"><strong style="color:${PAL.text}">In progress:</strong> outreach geography map (needs lead location backfilled from Apollo) and LinkedIn connection-acceptance rate (needs Ryan's LinkedIn notification inbox connected). Both arrive once those data sources are wired.</div>
    <div style="margin-top:6px"><strong style="color:${PAL.text}">Generated:</strong> ${now.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Chicago' })} CT via weeklyBriefingService.ts</div>
  </td></tr></table>

</td></tr></table>
</td></tr></table>
</body></html>`;
}
