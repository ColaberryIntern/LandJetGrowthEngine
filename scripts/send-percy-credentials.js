require('dotenv').config();

const SHOULD_SEND = process.argv.includes('--send');

const TO = 'pkapadia@landjet.com';
const CC = [];
const BCC = ['ali@colaberry.com'];
const SUBJECT = "Your LandJet Growth Engine login";

const SIGNATURE_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#333333;line-height:1.5;margin-top:24px"><tr><td style="padding-bottom:6px"><strong style="font-size:15px;color:#000000">Ali Muwwakkil</strong><br><span style="color:#1a8fb5">Managing Director &mdash; AI Systems Architect</span></td></tr><tr><td style="padding-bottom:6px;color:#666666">Colaberry Inc.</td></tr><tr><td style="padding-bottom:4px"><span>&#128205; 200 Chisholm Place, Suite 200 &middot; Plano, TX 75075</span></td></tr><tr><td style="padding-bottom:8px"><a href="mailto:ali@colaberry.com" style="color:#0066cc;text-decoration:none">ali@colaberry.com</a> &nbsp;&middot;&nbsp; <a href="https://enterprise.colaberry.ai" style="color:#0066cc;text-decoration:none">enterprise.colaberry.ai</a></td></tr><tr><td><a href="https://enterprise.colaberry.ai" style="display:inline-block;padding:8px 18px;background-color:#1a8fb5;color:#ffffff;text-decoration:none;border-radius:20px;font-size:13px">&#128640; Design Your AI Organization</a></td></tr></table>`;

const BODY_HTML = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222222;line-height:1.55;max-width:680px">
<p>Percy,</p>

<p>Thanks for handling the DNS and the Lorie sync. Here are your login credentials for the Growth Engine. Sending separately to keep it off the thread that includes Ryan.</p>

<table style="border-collapse:collapse;margin:14px 0;font-size:14px;background-color:#f7fafc;border:1px solid #e2e8f0;border-radius:6px;">
  <tr><td style="padding:10px 16px;color:#4a5568;border-bottom:1px solid #e2e8f0;"><strong>URL</strong></td><td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;font-family:Menlo,Consolas,monospace;">http://95.216.199.47:4000 (will move to growth.landjet.com once DNS propagates)</td></tr>
  <tr><td style="padding:10px 16px;color:#4a5568;border-bottom:1px solid #e2e8f0;"><strong>Email</strong></td><td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;font-family:Menlo,Consolas,monospace;">pkapadia@landjet.com</td></tr>
  <tr><td style="padding:10px 16px;color:#4a5568;"><strong>Password</strong></td><td style="padding:10px 16px;font-family:Menlo,Consolas,monospace;">LandJet2026!</td></tr>
</table>

<p>You have admin access, same level as Ryan. Hit me up if anything looks off, or save it in 1Password and we&#39;ll roll forward.</p>

<p>I&#39;ll prep a handful of sample BookRides emails -&gt; priced quotes for the Lorie sync so we can walk through them side by side. Talk Thursday.</p>

<p>Best,</p>
</div>${SIGNATURE_HTML}`;

const BODY_TEXT = `Percy,

Thanks for handling the DNS and the Lorie sync. Here are your login credentials for the Growth Engine. Sending separately to keep it off the thread that includes Ryan.

URL:      http://95.216.199.47:4000 (will move to growth.landjet.com once DNS propagates)
Email:    pkapadia@landjet.com
Password: LandJet2026!

You have admin access, same level as Ryan. Hit me up if anything looks off, or save it in 1Password and we'll roll forward.

I'll prep a handful of sample BookRides emails -> priced quotes for the Lorie sync so we can walk through them side by side. Talk Thursday.

Best,
Ali Muwwakkil
Managing Director -- AI Systems Architect
Colaberry Inc.
ali@colaberry.com`;

async function send() {
  if (!SHOULD_SEND) {
    console.log('=== DRAFT MODE ===');
    console.log('To:', TO, '| Cc:', CC.length ? CC.join(', ') : '(none)', '| Bcc:', BCC.join(', '));
    console.log('Subject:', SUBJECT);
    console.log('---');
    console.log(BODY_TEXT);
    console.log('---');
    return;
  }

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
  const { access_token } = await tr.json();

  const boundary = '----=_LandJet_' + Date.now();
  const headerLines = [
    'From: Ali Muwwakkil <ali@colaberry.com>',
    `To: ${TO}`,
  ];
  if (CC.length) headerLines.push(`Cc: ${CC.join(', ')}`);
  headerLines.push(`Bcc: ${BCC.join(', ')}`);
  headerLines.push(`Subject: ${SUBJECT}`);
  headerLines.push('MIME-Version: 1.0');
  headerLines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  const headers = headerLines.join('\r\n');

  const body = [
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    BODY_TEXT,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    `<!DOCTYPE html><html><body>${BODY_HTML}</body></html>`,
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');

  const message = headers + '\r\n' + body;
  const encoded = Buffer.from(message).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encoded }),
  });
  const result = await resp.json();
  if (resp.ok) console.log('SENT! Message ID:', result.id);
  else console.log('Failed:', resp.status, JSON.stringify(result));
}

send().catch(e => console.error('Error:', e.message));
