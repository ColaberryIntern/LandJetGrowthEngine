require('dotenv').config();

const SHOULD_SEND = process.argv.includes('--send');

const TO = 'pkapadia@landjet.com';
const CC = ['rlandry@landjet.com', 'rmlandry29@gmail.com'];
const BCC = ['ali@colaberry.com'];
const SUBJECT = "Re: RE: Three asks for the Growth Engine: DNS, Outlook rule, Reservations status";
const THREAD_ID = '19e2c1d86bd87a90';

const SIGNATURE_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#333333;line-height:1.5;margin-top:24px"><tr><td style="padding-bottom:6px"><strong style="font-size:15px;color:#000000">Ali Muwwakkil</strong><br><span style="color:#1a8fb5">Managing Director &mdash; AI Systems Architect</span></td></tr><tr><td style="padding-bottom:6px;color:#666666">Colaberry Inc.</td></tr><tr><td style="padding-bottom:4px"><span>&#128205; 200 Chisholm Place, Suite 200 &middot; Plano, TX 75075</span></td></tr><tr><td style="padding-bottom:8px"><a href="mailto:ali@colaberry.com" style="color:#0066cc;text-decoration:none">ali@colaberry.com</a> &nbsp;&middot;&nbsp; <a href="https://enterprise.colaberry.ai" style="color:#0066cc;text-decoration:none">enterprise.colaberry.ai</a></td></tr><tr><td><a href="https://enterprise.colaberry.ai" style="display:inline-block;padding:8px 18px;background-color:#1a8fb5;color:#ffffff;text-decoration:none;border-radius:20px;font-size:13px">&#128640; Design Your AI Organization</a></td></tr></table>`;

const BODY_HTML = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222222;line-height:1.55;max-width:680px">
<p>Percy,</p>

<p>Thanks for the fast turn on all three. Quick notes back on each:</p>

<p><strong>DNS for growth.landjet.com:</strong> appreciate you adding it. One heads up, the record isn&#39;t resolving yet, even from the authoritative GoDaddy nameserver (ns33.domaincontrol.com). Could you double-check the A record was saved and published in the DNS panel? Sometimes GoDaddy stages an edit and you have to hit a second confirm/publish step. The values should be:</p>

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

<p>Server-side is fully staged on my end. The moment the record resolves, nginx is ready and growth.landjet.com works.</p>

<p><strong>Outlook rule:</strong> thanks for testing locally with Ryan. Let me know what you find, and if there&#39;s a rule we need to disable I can also help write a quick filter exception specifically for the postmaster bounces if that&#39;s cleaner.</p>

<p><strong>Your login:</strong> sent separately in a private email a few minutes ago so it stays off this thread. Admin access, same as Ryan. Save the password and you&#39;re good.</p>

<p><strong>Lorie sync Thursday:</strong> I&#39;ll come prepped with three to five sample BookRides quote requests run through the pricing engine, so we can walk Lorie through what the AI would draft vs what she would write manually. Also one quick question for her if you can flag it: the master pricing doc says the base rate on round-trips applies to the initial leg only, but JD employees were confirmed to bill both legs. Does the same &quot;both legs&quot; rule apply to standard customers, Lockton, Investors, and LJ Members? Need her word before we let that path go live. Happy to ask her live in the meeting if easier.</p>

<p>Talk Thursday.</p>

<p>Best,</p>
</div>${SIGNATURE_HTML}`;

const BODY_TEXT = `Percy,

Thanks for the fast turn on all three. Quick notes back on each:

DNS for growth.landjet.com: appreciate you adding it. One heads up, the record isn't resolving yet, even from the authoritative GoDaddy nameserver (ns33.domaincontrol.com). Could you double-check the A record was saved and published in the DNS panel? Sometimes GoDaddy stages an edit and you have to hit a second confirm/publish step. The values should be:

  Host: growth
  Type: A
  Value: 95.216.199.47
  TTL: default

Server-side is fully staged on my end. The moment the record resolves, nginx is ready and growth.landjet.com works.

Outlook rule: thanks for testing locally with Ryan. Let me know what you find, and if there's a rule we need to disable I can also help write a quick filter exception specifically for the postmaster bounces if that's cleaner.

Your login: sent separately in a private email a few minutes ago so it stays off this thread. Admin access, same as Ryan. Save the password and you're good.

Lorie sync Thursday: I'll come prepped with three to five sample BookRides quote requests run through the pricing engine, so we can walk Lorie through what the AI would draft vs what she would write manually. Also one quick question for her if you can flag it: the master pricing doc says the base rate on round-trips applies to the initial leg only, but JD employees were confirmed to bill both legs. Does the same "both legs" rule apply to standard customers, Lockton, Investors, and LJ Members? Need her word before we let that path go live. Happy to ask her live in the meeting if easier.

Talk Thursday.

Best,
Ali Muwwakkil
Managing Director -- AI Systems Architect
Colaberry Inc.
ali@colaberry.com`;

async function send() {
  if (!SHOULD_SEND) {
    console.log('=== DRAFT MODE ===');
    console.log('To:', TO, '| Cc:', CC.join(', '), '| Bcc:', BCC.join(', '));
    console.log('Subject:', SUBJECT);
    console.log('ThreadID:', THREAD_ID);
    console.log('---');
    console.log(BODY_TEXT);
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
    body: JSON.stringify({ raw: encoded, threadId: THREAD_ID }),
  });
  const result = await resp.json();
  if (resp.ok) console.log('SENT! Message ID:', result.id);
  else console.log('Failed:', resp.status, JSON.stringify(result));
}

send().catch(e => console.error('Error:', e.message));
