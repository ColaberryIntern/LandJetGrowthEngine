#!/usr/bin/env node
/**
 * Auto-runner diagnostic email.
 *
 * One-shot: builds an HTML diagnosis of why no outbound sends have fired
 * since the auto-runner was enabled, then emails it via Gmail OAuth.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const NOW = new Date();
const REPO_ROOT = path.resolve(__dirname, '..');

const PAL = {
  navy: '#1A365D', navyDark: '#13294B', purple: '#6B46C1',
  red: '#E53E3E', gold: '#D69E2E', goldLight: '#F6E05E',
  green: '#38A169', teal: '#319795',
  text: '#1A202C', textMuted: '#4A5568', textDim: '#718096',
  bg: '#F7FAFC', card: '#FFFFFF', cardBorder: '#E2E8F0',
  callBg: '#FFFBEA', callBorder: '#D69E2E',
  callBgRed: '#FFF5F5', callBorderRed: '#E53E3E',
};

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function kpiTile(label, value, sublabel, accent) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAL.card};border:1px solid ${PAL.cardBorder};border-top:4px solid ${accent};border-radius:8px"><tr><td style="padding:16px 14px 12px">
    <div style="font-size:10px;font-weight:700;color:${PAL.textMuted};text-transform:uppercase;letter-spacing:.08em">${esc(label)}</div>
    <div style="font-size:26px;font-weight:800;color:${PAL.text};margin-top:6px;line-height:1.0">${esc(value)}</div>
    <div style="font-size:11px;color:${PAL.textDim};margin-top:6px">${esc(sublabel)}</div>
  </td></tr></table>`;
}

function chainRow(num, status, headline, detail, statusColor) {
  const icon = status === 'ok' ? '&#10003;' : status === 'broken' ? '&#10007;' : '&middot;';
  return `<tr>
    <td width="40" valign="top" style="padding:14px 12px 14px 0;color:${PAL.textDim};font-size:13px;font-weight:700">${num}.</td>
    <td width="36" valign="top" style="padding:14px 12px 14px 0">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="28" height="28" align="center" valign="middle" bgcolor="${statusColor}" style="background:${statusColor};border-radius:14px;color:#ffffff;font-size:15px;font-weight:800;line-height:28px">${icon}</td></tr></table>
    </td>
    <td valign="top" style="padding:12px 0">
      <div style="font-size:15px;font-weight:700;color:${PAL.text};line-height:1.3">${headline}</div>
      <div style="font-size:12px;color:${PAL.textMuted};margin-top:4px;line-height:1.5">${detail}</div>
    </td>
  </tr>`;
}

const PULSE_TIME = '7:00 AM CT (12:00 UTC)';
const TODAY = NOW.toLocaleString('en-US', { dateStyle: 'long' });

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:${PAL.bg};font-family:-apple-system,'Segoe UI',Arial,sans-serif;color:${PAL.text}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${PAL.bg}" style="background:${PAL.bg};font-family:-apple-system,'Segoe UI',Arial,sans-serif;color:${PAL.text}"><tr><td align="center" style="padding:24px 16px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="780" style="max-width:780px;width:100%"><tr><td>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${PAL.navy}" style="background:${PAL.navy};background-image:linear-gradient(135deg, ${PAL.navy} 0%, ${PAL.navyDark} 60%, ${PAL.purple} 120%);border-radius:14px;margin-bottom:22px"><tr><td style="padding:30px 28px 26px;color:#ffffff">
    <div style="font-size:11px;font-weight:800;color:${PAL.goldLight};text-transform:uppercase;letter-spacing:.18em">LandJet Growth Engine | Auto-Runner Diagnosis</div>
    <div style="font-size:28px;font-weight:800;margin-top:10px;line-height:1.15;color:#ffffff">The pipeline is alive, the queue is starving</div>
    <div style="font-size:14px;color:#cbd5e1;margin-top:10px">${TODAY} | 24 hours after PIPELINE_AUTORUN was flipped to true</div>
  </td></tr></table>

  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:12px"><tr>
    <td width="33%" style="padding-right:6px;vertical-align:top">${kpiTile('Daily Pulse', 'DELIVERED', `fired ${PULSE_TIME} today | snapshot 2026-06-16`, PAL.green)}</td>
    <td width="34%" style="padding:0 6px;vertical-align:top">${kpiTile('Outbound scheduler', 'IDLE', 'ticks every 1 min, finds 0 in queue', PAL.gold)}</td>
    <td width="33%" style="padding-left:6px;vertical-align:top">${kpiTile('Inbound ingest', 'IDLE', 'ticks every 5 min, fetches 0 new', PAL.gold)}</td>
  </tr></table>

  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:22px"><tr>
    <td width="33%" style="padding-right:6px;vertical-align:top">${kpiTile('ScheduledEmail queue', '0', 'pending or approved rows', PAL.red)}</td>
    <td width="34%" style="padding:0 6px;vertical-align:top">${kpiTile('Overdue leads', '124', 'next_action_at in the past, stranded', PAL.red)}</td>
    <td width="33%" style="padding-left:6px;vertical-align:top">${kpiTile('Sends in last 24h', '0', 'last comm_log: 2026-06-09', PAL.red)}</td>
  </tr></table>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:22px"><tr><td>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:6px"><tr>
      <td width="120" valign="middle" style="font-size:11px;font-weight:800;color:${PAL.gold};letter-spacing:.18em;white-space:nowrap;padding-right:10px">THE PIPELINE</td>
      <td valign="middle" style="border-top:1px solid ${PAL.cardBorder};line-height:1px;font-size:1px">&nbsp;</td>
    </tr></table>
    <div style="font-size:20px;font-weight:700;color:${PAL.text};line-height:1.2;margin-top:4px">Five steps. Step 3 is missing.</div>
    <div style="font-size:13px;color:${PAL.textMuted};margin-top:6px;line-height:1.5">The head and tail of the outbound pipeline run on schedule. The middle stage that turns "leads ready for action" into "queued sends" is not registered.</div>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAL.card};border:1px solid ${PAL.cardBorder};border-radius:10px;margin-top:14px"><tr><td style="padding:6px 22px 14px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        ${chainRow('1', 'ok', 'Leads enrolled in campaigns', '7,884 active leads have a campaign_id set. Top destinations: General Outreach (4,576), Investor Outreach (2,589), Manufacturing (188).', PAL.green)}
        ${chainRow('2', 'ok', 'Leads with overdue next_action_at', '124 leads have next_action_at &lt;= now(). These are ready for the next sequence step to fire.', PAL.green)}
        ${chainRow('3', 'broken', 'Sequence stepper NOT registered', 'Nothing in pipelineAutoRunner.ts queries the 124 overdue leads, generates the next step content, and writes a row to scheduled_emails. This is the missing job.', PAL.red)}
        ${chainRow('4', 'ok', 'Outbound scheduler', 'Ticks every 1 min. Sequelize confirms: SELECT FROM scheduled_emails WHERE status IN (pending, approved) AND scheduled_for &lt;= now() returns 0 every cycle.', PAL.green)}
        ${chainRow('5', 'ok', 'Send path', 'When a row exists, the existing Mandrill/Gmail send guard chain handles it. We know this works: 46 historical sends prove it.', PAL.green)}
      </table>
    </td></tr></table>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAL.callBgRed};border-left:4px solid ${PAL.callBorderRed};margin-top:12px"><tr><td style="padding:12px 16px">
      <div style="font-size:10px;font-weight:800;color:${PAL.callBorderRed};text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px">Root cause</div>
      <div style="font-size:14px;color:${PAL.text};line-height:1.55"><strong>The auto-runner registers 3 jobs: ingest, scheduler, Pulse.</strong> The pipeline needs a 4th job that closes the loop: a sequence stepper that ticks every ~5 min, finds leads where <code>next_action_at &lt;= now()</code>, generates the next step's content via the existing sequence engine (sequenceEngineService.ts already has this query at line 56), and inserts into scheduled_emails. Without it, the 124 stranded leads will sit forever and no new sends will fire even though everything around them is healthy.</div>
    </td></tr></table>
  </td></tr></table>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:6px"><tr>
      <td width="120" valign="middle" style="font-size:11px;font-weight:800;color:${PAL.gold};letter-spacing:.18em;white-space:nowrap;padding-right:10px">WHAT TO DO</td>
      <td valign="middle" style="border-top:1px solid ${PAL.cardBorder};line-height:1px;font-size:1px">&nbsp;</td>
    </tr></table>
    <div style="font-size:20px;font-weight:700;color:${PAL.text};line-height:1.2;margin-top:4px">Two steps, in order.</div>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAL.card};border:1px solid ${PAL.cardBorder};border-radius:10px;margin-top:14px"><tr><td style="padding:18px 22px">
      <div style="font-size:14px;font-weight:700;color:${PAL.text}">Step A: Verify the 124 are real (10 min)</div>
      <div style="font-size:13px;color:${PAL.textMuted};margin-top:6px;line-height:1.55">Pull a sample. Are they leads with valid email + a configured sequence + a sane next_action_at, or are they stale rows from earlier development that should not actually be sent to? Worth eyeballing before turning on the stepper that would otherwise blast all 124.</div>
      <div style="font-size:14px;font-weight:700;color:${PAL.text};margin-top:16px">Step B: Wire the sequence stepper into the auto-runner (30 min)</div>
      <div style="font-size:13px;color:${PAL.textMuted};margin-top:6px;line-height:1.55">Add a 4th interval to pipelineAutoRunner.ts that calls the existing sequence engine on every tick. Use a generous interval (5 min) and a per-cycle batch limit (say, 25 leads max) so the first time it runs it does not fire 124 emails at once. Log a structured event on every cycle so the next 24-hour check shows movement.</div>
    </td></tr></table>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAL.callBg};border-left:4px solid ${PAL.callBorder};margin-top:12px"><tr><td style="padding:12px 16px">
      <div style="font-size:10px;font-weight:800;color:${PAL.callBorder};text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px">Recommendation</div>
      <div style="font-size:14px;color:${PAL.text};line-height:1.55">Do Step A right after this email lands. If the 124 look clean, do Step B today and we will see real sends start firing tomorrow morning. If the 124 look stale, decide whether to reset their next_action_at to NULL before turning the stepper on. Either way, the diagnosis is now concrete and the fix is small.</div>
    </td></tr></table>
  </td></tr></table>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAL.card};border:1px solid ${PAL.cardBorder};border-radius:8px;margin-top:18px"><tr><td style="padding:14px 16px;font-size:11px;color:${PAL.textMuted};line-height:1.6">
    <div><strong style="color:${PAL.text}">Evidence basis:</strong> 24h of backend logs (only pipeline.ingest and pipeline.pulse entries, never an outbound-send event), SELECT count(*) FROM scheduled_emails (= 0), SELECT count(*) FROM leads WHERE next_action_at &lt; now() (= 124), SELECT max(created_at) FROM communication_logs WHERE direction=outbound (= 2026-06-09).</div>
    <div style="margin-top:6px"><strong style="color:${PAL.text}">Generated:</strong> ${NOW.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })} via scripts/send-autorunner-diagnosis.js</div>
  </td></tr></table>

</td></tr></table>
</td></tr></table>
</body></html>`;

// Save + send
async function main() {
  const outDir = path.join(REPO_ROOT, 'docs', 'updates');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const stamp = NOW.toISOString().slice(0, 10);
  const outPath = path.join(outDir, `${stamp}-autorunner-diagnosis.html`);
  fs.writeFileSync(outPath, html);
  console.log(`[1/2] wrote ${outPath} (${(html.length / 1024).toFixed(1)} KB)`);

  console.log('[2/2] Sending via Gmail OAuth...');
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

  const subject = 'Auto-runner diagnosis: pipeline alive, queue starving (124 leads stranded)';
  const altBoundary = '----=_LandJet_alt_' + Date.now();
  const textBody = `Auto-runner diagnosis\n\n- Pulse: delivered 7:00 AM CT today\n- Scheduler: running but queue empty\n- Ingest: running but no new mail\n- ScheduledEmail queue: 0 rows\n- Overdue leads: 124\n- Sends in last 24h: 0\n\nRoot cause: the auto-runner is missing the sequence stepper job that creates ScheduledEmail rows from leads with overdue next_action_at.\n\nOpen the HTML version for the full diagnosis.`;
  const htmlB64 = Buffer.from(html, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
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
    htmlB64,
    '',
    `--${altBoundary}--`,
    '',
  ].join('\r\n');
  const encoded = Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + tj.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encoded }),
  });
  const result = await resp.json();
  if (!resp.ok) throw new Error('Send failed: ' + JSON.stringify(result));
  console.log(`      SENT. Gmail message id: ${result.id}`);
}

main().catch(e => { console.error('ERR', e); process.exit(1); });
