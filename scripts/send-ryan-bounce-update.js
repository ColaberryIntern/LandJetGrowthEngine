require('dotenv').config();
const fs = require('fs');
const path = require('path');

const SHOULD_SEND = process.argv.includes('--send');

const TO = 'rmlandry29@gmail.com';
const CC = ['rlandry@landjet.com'];
const BCC = ['ali@colaberry.com'];
const SUBJECT = "LandJet Update -- Bounce Protection is Live (new format inside)";

const ATTACHMENT_PATH = path.join(__dirname, '..', 'docs', 'updates', '2026-05-12-bounce-protection.html');
const ATTACHMENT_FILENAME = '2026-05-12-bounce-protection.html';

const SIGNATURE_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#333333;line-height:1.5;margin-top:24px"><tr><td style="padding-bottom:6px"><strong style="font-size:15px;color:#000000">Ali Muwwakkil</strong><br><span style="color:#1a8fb5">Managing Director &mdash; AI Systems Architect</span></td></tr><tr><td style="padding-bottom:6px;color:#666666">Colaberry Inc.</td></tr><tr><td style="padding-bottom:4px"><span>&#128205; 200 Chisholm Place, Suite 200 &middot; Plano, TX 75075</span></td></tr><tr><td style="padding-bottom:8px"><a href="mailto:ali@colaberry.com" style="color:#0066cc;text-decoration:none">ali@colaberry.com</a> &nbsp;&middot;&nbsp; <a href="https://enterprise.colaberry.ai" style="color:#0066cc;text-decoration:none">enterprise.colaberry.ai</a></td></tr><tr><td><a href="https://enterprise.colaberry.ai" style="display:inline-block;padding:8px 18px;background-color:#1a8fb5;color:#ffffff;text-decoration:none;border-radius:20px;font-size:13px">&#128640; Design Your AI Organization</a></td></tr></table>`;

const BODY_HTML = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222222;line-height:1.55;max-width:680px">
<p>Ryan,</p>

<p>Following up on the three bounces you flagged Monday. Both questions answered, the underlying issue is fixed, and the three addresses are blocked. Details in the attached one-pager.</p>

<p>One process note: going forward, when meaningful changes ship that affect you, I'll send a short HTML one-pager like the one attached. Same shape every time -- what happened, what's fixed, what to check, and two buttons in the doc for quick feedback. Keeps these updates scannable in two minutes and easy to reply to.</p>

<p>Open the attachment to read it. Hit one of the feedback buttons or just reply to this email -- both work.</p>

<p>Best,</p>
</div>${SIGNATURE_HTML}`;

const BODY_TEXT = `Ryan,

Following up on the three bounces you flagged Monday. Both questions answered, the underlying issue is fixed, and the three addresses are blocked. Details in the attached one-pager.

One process note: going forward, when meaningful changes ship that affect you, I'll send a short HTML one-pager like the one attached. Same shape every time -- what happened, what's fixed, what to check, and two buttons in the doc for quick feedback. Keeps these updates scannable in two minutes and easy to reply to.

Open the attachment to read it. Hit one of the feedback buttons or just reply to this email -- both work.

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
    console.log('To send: node scripts/send-ryan-bounce-update.js --send');
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

  // multipart/mixed wraps everything; multipart/alternative wraps text+html body
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
  // Wrap base64 at 76 chars per RFC 2045
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
