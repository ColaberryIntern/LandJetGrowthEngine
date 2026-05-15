require('dotenv').config();

const SHOULD_SEND = process.argv.includes('--send');

const TO = 'pkapadia@landjet.com';
const CC = ['rlandry@landjet.com', 'rmlandry29@gmail.com'];
const BCC = ['ali@colaberry.com'];
const SUBJECT = "Three asks for the Growth Engine: DNS, Outlook rule, Reservations status";

const SIGNATURE_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#333333;line-height:1.5;margin-top:24px"><tr><td style="padding-bottom:6px"><strong style="font-size:15px;color:#000000">Ali Muwwakkil</strong><br><span style="color:#1a8fb5">Managing Director &mdash; AI Systems Architect</span></td></tr><tr><td style="padding-bottom:6px;color:#666666">Colaberry Inc.</td></tr><tr><td style="padding-bottom:4px"><span>&#128205; 200 Chisholm Place, Suite 200 &middot; Plano, TX 75075</span></td></tr><tr><td style="padding-bottom:8px"><a href="mailto:ali@colaberry.com" style="color:#0066cc;text-decoration:none">ali@colaberry.com</a> &nbsp;&middot;&nbsp; <a href="https://enterprise.colaberry.ai" style="color:#0066cc;text-decoration:none">enterprise.colaberry.ai</a></td></tr><tr><td><a href="https://enterprise.colaberry.ai" style="display:inline-block;padding:8px 18px;background-color:#1a8fb5;color:#ffffff;text-decoration:none;border-radius:20px;font-size:13px">&#128640; Design Your AI Organization</a></td></tr></table>`;

const BODY_HTML = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222222;line-height:1.55;max-width:680px">
<p>Percy,</p>

<p>Three things, none urgent in the next hour but all helpful when you have a few minutes. Smallest first.</p>

<p><strong>1. DNS record for growth.landjet.com (~30 seconds)</strong><br>
Ryan picked this as the URL for the Growth Engine. Please add a single A record at landjet.com:</p>

<table style="border-collapse:collapse;margin:8px 0 16px 0;font-size:13px;background-color:#f7fafc;border:1px solid #e2e8f0;border-radius:6px;">
  <tr>
    <td style="padding:8px 14px;border-right:1px solid #e2e8f0;"><strong>Host</strong></td>
    <td style="padding:8px 14px;border-right:1px solid #e2e8f0;"><strong>Type</strong></td>
    <td style="padding:8px 14px;border-right:1px solid #e2e8f0;"><strong>Value</strong></td>
    <td style="padding:8px 14px;"><strong>TTL</strong></td>
  </tr>
  <tr>
    <td style="padding:8px 14px;border-top:1px solid #e2e8f0;border-right:1px solid #e2e8f0;font-family:Menlo,Consolas,monospace;">growth</td>
    <td style="padding:8px 14px;border-top:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">A</td>
    <td style="padding:8px 14px;border-top:1px solid #e2e8f0;border-right:1px solid #e2e8f0;font-family:Menlo,Consolas,monospace;">95.216.199.47</td>
    <td style="padding:8px 14px;border-top:1px solid #e2e8f0;">default</td>
  </tr>
</table>

<p>Once it propagates I&#39;ll set up nginx and the SSL cert on the server. Ryan stops logging in via IP address.</p>

<p><strong>2. Disable any Outlook rule that hides bounces on Ryan&#39;s inbox</strong><br>
The auto-Block protection I shipped last week reads bounce notifications from rlandry@landjet.com&#39;s inbox to know which leads to remove. When I scanned 7 days of messages only 10 came back, suggesting a rule is auto-archiving NDRs. Please disable any rule that touches &quot;Undeliverable&quot; / &quot;Delivery Failure&quot; / &quot;Postmaster&quot; / &quot;Mail Delivery Failed&quot; so bounces stay in the inbox where the system can find them.</p>

<p><strong>3. Status on the Reservations AI Engine</strong><br>
The pricing engine, BookRides parser, and FAQ classifier have been ready for Lorie review since 2026-05-07. Two open items waiting on you:</p>

<ul style="padding-left:20px;margin:8px 0;">
  <li>Schedule a 30-min sync with Lorie so we can walk through 3-5 sample quote drafts side by side. Once she signs off we can flip the switch.</li>
  <li>The non-JD round-trip rule: master pricing doc says base rate applies to initial leg only on round-trips. JD employees were confirmed to bill both legs. Does the same rule extend to standard customers, Lockton, Investors, LJ Members? Need Lorie&#39;s confirmation before that path goes live.</li>
</ul>

<p>Thanks,</p>
</div>${SIGNATURE_HTML}`;

const BODY_TEXT = `Percy,

Three things, none urgent in the next hour but all helpful when you have a few minutes. Smallest first.

1. DNS record for growth.landjet.com (~30 seconds)

Ryan picked this as the URL for the Growth Engine. Please add a single A record at landjet.com:

  Host: growth
  Type: A
  Value: 95.216.199.47
  TTL: default

Once it propagates I'll set up nginx and the SSL cert on the server. Ryan stops logging in via IP address.

2. Disable any Outlook rule that hides bounces on Ryan's inbox

The auto-Block protection I shipped last week reads bounce notifications from rlandry@landjet.com's inbox to know which leads to remove. When I scanned 7 days of messages only 10 came back, suggesting a rule is auto-archiving NDRs. Please disable any rule that touches "Undeliverable" / "Delivery Failure" / "Postmaster" / "Mail Delivery Failed" so bounces stay in the inbox where the system can find them.

3. Status on the Reservations AI Engine

The pricing engine, BookRides parser, and FAQ classifier have been ready for Lorie review since 2026-05-07. Two open items waiting on you:

- Schedule a 30-min sync with Lorie so we can walk through 3-5 sample quote drafts side by side. Once she signs off we can flip the switch.
- The non-JD round-trip rule: master pricing doc says base rate applies to initial leg only on round-trips. JD employees were confirmed to bill both legs. Does the same rule extend to standard customers, Lockton, Investors, LJ Members? Need Lorie's confirmation before that path goes live.

Thanks,
Ali Muwwakkil
Managing Director -- AI Systems Architect
Colaberry Inc.
ali@colaberry.com`;

async function send() {
  if (!SHOULD_SEND) {
    console.log('=== DRAFT MODE ===');
    console.log('To:', TO, '| Cc:', CC.join(', '), '| Bcc:', BCC.join(', '));
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
  const headers = [
    'From: Ali Muwwakkil <ali@colaberry.com>',
    `To: ${TO}`,
    `Cc: ${CC.join(', ')}`,
    `Bcc: ${BCC.join(', ')}`,
    `Subject: ${SUBJECT}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join('\r\n');

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
