require('dotenv').config();
const fs = require('fs');
const path = require('path');

const SHOULD_SEND = process.argv.includes('--send');

const TO = 'rmlandry29@gmail.com';
const CC = ['rlandry@landjet.com', 'pkapadia@landjet.com'];
const BCC = ['ali@colaberry.com'];
const SUBJECT = "LandJet Update -- Login + Activity Widget (action items inside)";

const ATTACHMENT_PATH = path.join(__dirname, '..', 'docs', 'updates', '2026-05-14-login-and-usage.html');
const ATTACHMENT_FILENAME = '2026-05-14-login-and-usage.html';

const SIGNATURE_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#333333;line-height:1.5;margin-top:24px"><tr><td style="padding-bottom:6px"><strong style="font-size:15px;color:#000000">Ali Muwwakkil</strong><br><span style="color:#1a8fb5">Managing Director &mdash; AI Systems Architect</span></td></tr><tr><td style="padding-bottom:6px;color:#666666">Colaberry Inc.</td></tr><tr><td style="padding-bottom:4px"><span>&#128205; 200 Chisholm Place, Suite 200 &middot; Plano, TX 75075</span></td></tr><tr><td style="padding-bottom:8px"><a href="mailto:ali@colaberry.com" style="color:#0066cc;text-decoration:none">ali@colaberry.com</a> &nbsp;&middot;&nbsp; <a href="https://enterprise.colaberry.ai" style="color:#0066cc;text-decoration:none">enterprise.colaberry.ai</a></td></tr><tr><td><a href="https://enterprise.colaberry.ai" style="display:inline-block;padding:8px 18px;background-color:#1a8fb5;color:#ffffff;text-decoration:none;border-radius:20px;font-size:13px">&#128640; Design Your AI Organization</a></td></tr></table>`;

const BODY_HTML = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222222;line-height:1.55;max-width:680px">
<p>Ryan, Percy,</p>

<p>Two things shipped today and a handful of nudges for both of you. Details in the attached change log.</p>

<p>Quick summary:</p>
<ol>
  <li><strong>Real per-user login is live.</strong> No more silent auto-login. Ryan, you have credentials waiting -- I'm sending them in a separate message.</li>
  <li><strong>Activity widget on the System page</strong> shows your real outreach numbers. You're at 110 sends in the last 7 days, ~22/active day, hitting 8 of 9 campaigns. Strong.</li>
</ol>

<p>The attached one-pager has action items split out per person:</p>
<ul>
  <li><strong>Ryan:</strong> log in fresh, push toward 30-50 sends/day, kill the Outlook bounce-archive rule (still pending from last week).</li>
  <li><strong>Percy:</strong> schedule the Lorie review for the Reservations engine, confirm the non-JD round-trip rule, want a login of your own?</li>
</ul>

<p>Open the attachment for the full picture. Three buttons inside for quick acknowledgment, feedback, or critique -- or just hit reply.</p>

<p>Best,</p>
</div>${SIGNATURE_HTML}`;

const BODY_TEXT = `Ryan, Percy,

Two things shipped today and a handful of nudges for both of you. Details in the attached change log.

Quick summary:
1. Real per-user login is live. No more silent auto-login. Ryan, you have credentials waiting -- I'm sending them in a separate message.
2. Activity widget on the System page shows your real outreach numbers. You're at 110 sends in the last 7 days, ~22/active day, hitting 8 of 9 campaigns. Strong.

The attached one-pager has action items split out per person:
- Ryan: log in fresh, push toward 30-50 sends/day, kill the Outlook bounce-archive rule (still pending from last week).
- Percy: schedule the Lorie review for the Reservations engine, confirm the non-JD round-trip rule, want a login of your own?

Open the attachment for the full picture. Three buttons inside for quick acknowledgment, feedback, or critique -- or just hit reply.

Best,
Ali Muwwakkil
Managing Director -- AI Systems Architect
Colaberry Inc.
ali@colaberry.com`;

async function send() {
  if (!SHOULD_SEND) {
    const attachmentBytes = fs.statSync(ATTACHMENT_PATH).size;
    console.log('=== DRAFT MODE (no email sent) ===');
    console.log('To:', TO);
    console.log('Cc:', CC.join(', '));
    console.log('Bcc:', BCC.join(', '));
    console.log('Subject:', SUBJECT);
    console.log('Attachment:', ATTACHMENT_FILENAME, `(${attachmentBytes} bytes)`);
    console.log('---');
    console.log(BODY_TEXT);
    console.log('---');
    console.log('To send: node scripts/send-ryan-percy-login-update.js --send');
    return;
  }

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }).toString(),
  });
  const { access_token } = await tokenResp.json();

  const mixedBoundary = '----=_LandJet_mixed_' + Date.now();
  const altBoundary = '----=_LandJet_alt_' + Date.now();

  const headers = [
    'From: Ali Muwwakkil <ali@colaberry.com>',
    `To: ${TO}`,
    `Cc: ${CC.join(', ')}`,
    `Bcc: ${BCC.join(', ')}`,
    `Subject: ${SUBJECT}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
  ].join('\r\n');

  const attachmentBase64 = fs.readFileSync(ATTACHMENT_PATH).toString('base64');
  const attachmentWrapped = attachmentBase64.match(/.{1,76}/g).join('\r\n');

  const body = [
    '',
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    '',
    `--${altBoundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    BODY_TEXT,
    '',
    `--${altBoundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    `<!DOCTYPE html><html><body>${BODY_HTML}</body></html>`,
    '',
    `--${altBoundary}--`,
    '',
    `--${mixedBoundary}`,
    `Content-Type: text/html; charset=UTF-8; name="${ATTACHMENT_FILENAME}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${ATTACHMENT_FILENAME}"`,
    '',
    attachmentWrapped,
    '',
    `--${mixedBoundary}--`,
    '',
  ].join('\r\n');

  const message = headers + '\r\n' + body;
  const encoded = Buffer.from(message).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const sendResp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encoded }),
  });

  const result = await sendResp.json();
  if (sendResp.ok) {
    console.log('SENT! Message ID:', result.id);
  } else {
    console.log('Failed:', sendResp.status, JSON.stringify(result));
  }
}

send().catch(e => console.error('Error:', e.message));
