#!/usr/bin/env node
/**
 * Decision map email: what Ali needs, from whom, to unlock what.
 *
 * One-off send via the existing Mandrill wrapper. SVG flowchart gets rasterized
 * to PNG so Gmail renders it. Attached to its own BC todo for audit trail.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const PAL = {
  navy: '#1A365D', navyDark: '#13294B', purple: '#6B46C1',
  red: '#E53E3E', gold: '#D69E2E', goldLight: '#F6E05E',
  green: '#38A169', greenDark: '#22543D', teal: '#319795',
  text: '#1A202C', textMuted: '#4A5568', textDim: '#718096',
  bg: '#F7FAFC', card: '#FFFFFF', cardBorder: '#E2E8F0',
};

const ROWS = [
  { need: 'Sequence stepper wired (4th auto-runner job)', from: 'Claude Code (next session)', delivers: '124 stranded leads start moving; outbound cadence resumes', urgency: 'high' },
  { need: 'inbox-match Gmail OAuth confirmed', from: 'Ali decision + Claude wiring', delivers: 'Replies populate comm_logs; Pulse shows real reply numbers', urgency: 'high' },
  { need: 'Per-vertical lead approval (6 campaigns)', from: 'Ryan', delivers: 'Healthcare, Mfg, Banking, Legal, Business Svcs, Tech campaigns leave the dock', urgency: 'med' },
  { need: 'Investor list refresh (next 100)', from: 'Ryan', delivers: 'Investor Outreach keeps moving past current 31 unique recipients', urgency: 'med' },
  { need: 'Iowa territory owner named', from: 'Ryan', delivers: '3rd account_manager account; Iowa-scoped leads addressable', urgency: 'low' },
  { need: 'Percy first login confirmation', from: 'Percy', delivers: 'TX customer outreach starts; pkapadia@ account validated', urgency: 'med' },
  { need: 'BC token rotation handler (CCPP MSSQL pull)', from: 'Claude Code', delivers: 'BC sync survives every 2-week token rotation; next rotation 2026-06-23', urgency: 'high' },
];

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function buildFlowchart() {
  const rowH = 96, top = 80, padCol = 24, left = 30;
  const cellW = 380;
  const width = left + cellW * 3 + padCol * 2 + 30;
  const height = top + ROWS.length * rowH + 30;
  const urgencyColor = { high: PAL.red, med: PAL.gold, low: PAL.textDim };

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" preserveAspectRatio="xMinYMid meet" font-family="-apple-system,'Segoe UI',Arial,sans-serif">`;
  svg += `<rect width="${width}" height="${height}" fill="${PAL.card}"/>`;
  // header
  svg += `<text x="${left + cellW / 2}" y="40" text-anchor="middle" font-size="13" font-weight="800" fill="${PAL.red}" letter-spacing="0.18em">WHAT I NEED</text>`;
  svg += `<text x="${left + cellW + padCol + cellW / 2}" y="40" text-anchor="middle" font-size="13" font-weight="800" fill="${PAL.gold}" letter-spacing="0.18em">FROM WHOM</text>`;
  svg += `<text x="${left + cellW * 2 + padCol * 2 + cellW / 2}" y="40" text-anchor="middle" font-size="13" font-weight="800" fill="${PAL.green}" letter-spacing="0.18em">WHAT IT DELIVERS</text>`;
  // header underline
  svg += `<line x1="${left}" y1="56" x2="${width - 30}" y2="56" stroke="${PAL.cardBorder}" stroke-width="1"/>`;

  for (let i = 0; i < ROWS.length; i++) {
    const r = ROWS[i];
    const y = top + i * rowH;
    const boxTop = y + 8;
    const boxH = rowH - 18;
    const urgClr = urgencyColor[r.urgency];

    // box 1: NEED (red-edged)
    svg += `<rect x="${left}" y="${boxTop}" width="${cellW}" height="${boxH}" rx="10" fill="#FFF5F5" stroke="${PAL.red}" stroke-width="2"/>`;
    svg += `<rect x="${left}" y="${boxTop}" width="6" height="${boxH}" rx="3" fill="${urgClr}"/>`;
    svg += `<text x="${left + 18}" y="${boxTop + 28}" font-size="13" font-weight="700" fill="${PAL.text}">${esc(r.need)}</text>`;
    svg += `<text x="${left + 18}" y="${boxTop + boxH - 10}" font-size="10" font-weight="700" fill="${urgClr}" letter-spacing="0.12em">${r.urgency.toUpperCase()} URGENCY</text>`;

    // arrow 1
    const ax1 = left + cellW + 4;
    const ax2 = left + cellW + padCol - 4;
    const ay = y + rowH / 2;
    svg += `<line x1="${ax1}" y1="${ay}" x2="${ax2 - 6}" y2="${ay}" stroke="${PAL.textDim}" stroke-width="2"/>`;
    svg += `<polygon points="${ax2 - 6},${ay - 5} ${ax2},${ay} ${ax2 - 6},${ay + 5}" fill="${PAL.textDim}"/>`;

    // box 2: FROM (gold-edged)
    const fromX = left + cellW + padCol;
    svg += `<rect x="${fromX}" y="${boxTop}" width="${cellW}" height="${boxH}" rx="10" fill="#FFFBEA" stroke="${PAL.gold}" stroke-width="2"/>`;
    svg += `<text x="${fromX + 16}" y="${boxTop + 28}" font-size="13" font-weight="700" fill="${PAL.text}">${esc(r.from)}</text>`;

    // arrow 2
    const bx1 = fromX + cellW + 4;
    const bx2 = fromX + cellW + padCol - 4;
    svg += `<line x1="${bx1}" y1="${ay}" x2="${bx2 - 6}" y2="${ay}" stroke="${PAL.textDim}" stroke-width="2"/>`;
    svg += `<polygon points="${bx2 - 6},${ay - 5} ${bx2},${ay} ${bx2 - 6},${ay + 5}" fill="${PAL.textDim}"/>`;

    // box 3: DELIVERS (green-edged)
    const delX = fromX + cellW + padCol;
    svg += `<rect x="${delX}" y="${boxTop}" width="${cellW}" height="${boxH}" rx="10" fill="#F0FFF4" stroke="${PAL.green}" stroke-width="2"/>`;
    // delivers text can wrap; manual two-line render
    const deliversText = r.delivers;
    if (deliversText.length > 50) {
      // simple split on space near middle
      const mid = deliversText.length / 2;
      let split = deliversText.indexOf(' ', mid);
      if (split === -1) split = deliversText.lastIndexOf(' ');
      const line1 = deliversText.slice(0, split);
      const line2 = deliversText.slice(split + 1);
      svg += `<text x="${delX + 16}" y="${boxTop + 28}" font-size="12" font-weight="600" fill="${PAL.text}">${esc(line1)}</text>`;
      svg += `<text x="${delX + 16}" y="${boxTop + 46}" font-size="12" font-weight="600" fill="${PAL.text}">${esc(line2)}</text>`;
    } else {
      svg += `<text x="${delX + 16}" y="${boxTop + 34}" font-size="13" font-weight="700" fill="${PAL.text}">${esc(deliversText)}</text>`;
    }
  }
  svg += `</svg>`;
  return svg;
}

const flowchartSvg = buildFlowchart();
const now = new Date();

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:${PAL.bg};font-family:-apple-system,'Segoe UI',Arial,sans-serif;color:${PAL.text}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${PAL.bg}" style="background:${PAL.bg}"><tr><td align="center" style="padding:24px 16px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="900" style="max-width:900px;width:100%"><tr><td>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${PAL.navy}" style="background:${PAL.navy};background-image:linear-gradient(135deg, ${PAL.navy} 0%, ${PAL.navyDark} 60%, ${PAL.purple} 120%);border-radius:14px;margin-bottom:24px"><tr><td style="padding:30px 28px 26px;color:#ffffff">
    <div style="font-size:11px;font-weight:800;color:${PAL.goldLight};text-transform:uppercase;letter-spacing:.18em">LandJet Growth Engine | Decision Map</div>
    <div style="font-size:28px;font-weight:800;margin-top:10px;line-height:1.15;color:#ffffff">What I need, from whom, to unlock what</div>
    <div style="font-size:14px;color:#cbd5e1;margin-top:10px">${now.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Chicago' })} CT | 7 open paths, urgency color-coded on the left rail of each need</div>
  </td></tr></table>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAL.card};border:1px solid ${PAL.cardBorder};border-radius:10px;margin-bottom:18px"><tr><td style="padding:20px">
    ${flowchartSvg}
  </td></tr></table>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#FFFBEA;border-left:4px solid ${PAL.gold};margin-bottom:14px"><tr><td style="padding:14px 18px">
    <div style="font-size:11px;font-weight:800;color:${PAL.gold};text-transform:uppercase;letter-spacing:.12em;margin-bottom:6px">How to read this</div>
    <div style="font-size:14px;color:${PAL.text};line-height:1.55">Each row is one unblocked path. <strong>Red rail = HIGH urgency</strong> (blocks revenue motion). <strong>Gold rail = MED urgency</strong> (slows the system but not blocking). <strong>Gray rail = LOW urgency</strong> (cleanup). The three HIGH-urgency rows (sequence stepper, inbox-match, BC token rotation handler) are all things I can wire next session if you green-light them; the others need decisions or actions from Ryan or Percy.</div>
  </td></tr></table>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#FFF5F5;border-left:4px solid ${PAL.red};margin-bottom:18px"><tr><td style="padding:14px 18px">
    <div style="font-size:11px;font-weight:800;color:${PAL.red};text-transform:uppercase;letter-spacing:.12em;margin-bottom:6px">If you only do three things</div>
    <div style="font-size:14px;color:${PAL.text};line-height:1.55">1. <strong>Green-light the sequence stepper wire-up</strong>. This is the single largest blocker. 124 leads currently overdue, queue empty, scheduler idle. Once wired, the system starts moving on its own.<br>2. <strong>Press Ryan on the vertical lead lists.</strong> Six campaigns are configured but starving. Investor Outreach is doing 70% of the work because it is the only one with approved leads.<br>3. <strong>Ping Percy.</strong> His account is provisioned; he just needs to log in once for TX customer outreach to become real.</div>
  </td></tr></table>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAL.card};border:1px solid ${PAL.cardBorder};border-radius:8px"><tr><td style="padding:14px 16px;font-size:11px;color:${PAL.textMuted};line-height:1.6">
    <div><strong style="color:${PAL.text}">Generated:</strong> ${now.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })} via scripts/send-decision-map.js</div>
    <div style="margin-top:4px"><strong style="color:${PAL.text}">BC todo:</strong> created at run time, comment auto-attached.</div>
  </td></tr></table>

</td></tr></table>
</td></tr></table>
</body></html>`;

const outDir = path.join(__dirname, '..', 'docs', 'updates');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const stamp = now.toISOString().slice(0, 10);
const outPath = path.join(outDir, `${stamp}-decision-map.html`);
fs.writeFileSync(outPath, html);
console.log(`Wrote ${outPath} (${(html.length / 1024).toFixed(1)} KB)`);
