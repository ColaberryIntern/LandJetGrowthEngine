require('dotenv').config();

const TO = 'pkapadia@landjet.com';
const CC = ['rlandry@landjet.com'];
const SUBJECT = "Re: AI In-Bound Email Engine -- Got everything, 3 questions before I lock the pricing engine";

const SIGNATURE_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#333333;line-height:1.5;margin-top:24px"><tr><td style="padding-bottom:6px"><strong style="font-size:15px;color:#000000">Ali Muwwakkil</strong><br><span style="color:#1a8fb5">Managing Director &mdash; AI Systems Architect</span></td></tr><tr><td style="padding-bottom:6px;color:#666666">Colaberry Inc.</td></tr><tr><td style="padding-bottom:4px"><span>&#128205; 200 Chisholm Place, Suite 200 &middot; Plano, TX 75075</span></td></tr><tr><td style="padding-bottom:8px"><a href="mailto:ali@colaberry.com" style="color:#0066cc;text-decoration:none">ali@colaberry.com</a> &nbsp;&middot;&nbsp; <a href="https://enterprise.colaberry.ai" style="color:#0066cc;text-decoration:none">enterprise.colaberry.ai</a></td></tr><tr><td><a href="https://enterprise.colaberry.ai" style="display:inline-block;padding:8px 18px;background-color:#1a8fb5;color:#ffffff;text-decoration:none;border-radius:20px;font-size:13px">&#128640; Design Your AI Organization</a></td></tr></table>`;

const BODY_HTML = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222222;line-height:1.55;max-width:680px">
  <p>Percy,</p>

  <p>Got everything. The master pricing doc + the BookRides quote PDF + the calculator tabs gave me enough to build the quote engine. I'm starting on it today.</p>

  <p>Three quick questions before I lock the logic. None of these block me from starting &mdash; they're flags for when you set up the concierge team call.</p>

  <p><strong>1. How does the AI detect customer category?</strong></p>

  <p>I have rate cards for John Deere employees ($200 base, $2.20/mi), JD Shuttle ($250 base, $1.65/mi), Lockton, Investors, and LJ Members. But the AI needs a way to know when to apply each. Three options:</p>

  <ol style="padding-left:24px;margin:8px 0">
    <li>Email domain match (e.g., <code>@johndeere.com</code> triggers JD pricing)</li>
    <li>Pre-set customer list in the platform (you tag customers as "JD Employee" or "Member")</li>
    <li>Concierge picks the rate manually before sending the quote</li>
  </ol>

  <p>My default plan is (1) for known domains plus (3) for everything else. Tell me if you want different.</p>

  <p><strong>2. "Iowa-only trip" for the 7% tax &mdash; when does it apply?</strong></p>

  <p>Both pickup AND dropoff in Iowa, or just origin in Iowa?</p>

  <p><strong>3. Kansas City "needs approval" items</strong></p>

  <p>The KC rate card says Additional Driver, Fuel Surcharge, and CC Fee all "need approval." When the AI generates a KC quote, should it:</p>

  <ol style="padding-left:24px;margin:8px 0">
    <li>Skip those line items entirely (clean quote, lower number)</li>
    <li>Apply the corp market default (3% CC, $0.10/mi fuel) and flag for Holly/Scott to confirm</li>
    <li>Leave a placeholder ("$X &mdash; pending Holly's approval") for the concierge to fill in</li>
  </ol>

  <p><strong>One observation while I'm in here:</strong> the John Deere round-trip quote you sent me showed the Base Rate applied to BOTH legs ($200 + $200 = $400). But the master pricing doc says base rate is "applied to the initial leg of round-trip transportation, not applied to the return leg." That would have made the JD quote $200 base instead of $400 base. Either the JD quote was correct (JD employees get base on both legs) or the master doc applies and the quote was over-charged. Want to flag this for Lorie or Holly to confirm.</p>

  <p>Looking forward to the concierge team call. In the meantime I'll start building based on what I have, with flags in the code where any of the above are still open.</p>

  <p>Best,</p>
</div>${SIGNATURE_HTML}`;

const BODY_TEXT = `Percy,

Got everything. The master pricing doc + the BookRides quote PDF + the calculator tabs gave me enough to build the quote engine. I'm starting on it today.

Three quick questions before I lock the logic. None of these block me from starting -- they're flags for when you set up the concierge team call.

1. How does the AI detect customer category?

I have rate cards for John Deere employees ($200 base, $2.20/mi), JD Shuttle ($250 base, $1.65/mi), Lockton, Investors, and LJ Members. But the AI needs a way to know when to apply each. Three options:

  1) Email domain match (e.g., @johndeere.com triggers JD pricing)
  2) Pre-set customer list in the platform (you tag customers as "JD Employee" or "Member")
  3) Concierge picks the rate manually before sending the quote

My default plan is (1) for known domains plus (3) for everything else. Tell me if you want different.

2. "Iowa-only trip" for the 7% tax -- when does it apply?

Both pickup AND dropoff in Iowa, or just origin in Iowa?

3. Kansas City "needs approval" items

The KC rate card says Additional Driver, Fuel Surcharge, and CC Fee all "need approval." When the AI generates a KC quote, should it:

  1) Skip those line items entirely (clean quote, lower number)
  2) Apply the corp market default (3% CC, $0.10/mi fuel) and flag for Holly/Scott to confirm
  3) Leave a placeholder ("$X -- pending Holly's approval") for the concierge to fill in

One observation while I'm in here: the John Deere round-trip quote you sent me showed the Base Rate applied to BOTH legs ($200 + $200 = $400). But the master pricing doc says base rate is "applied to the initial leg of round-trip transportation, not applied to the return leg." That would have made the JD quote $200 base instead of $400 base. Either the JD quote was correct (JD employees get base on both legs) or the master doc applies and the quote was over-charged. Want to flag this for Lorie or Holly to confirm.

Looking forward to the concierge team call. In the meantime I'll start building based on what I have, with flags in the code where any of the above are still open.

Best,
Ali Muwwakkil
Managing Director -- AI Systems Architect
Colaberry Inc.
ali@colaberry.com`;

async function send() {
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

  const boundary = '----=_LandJet_' + Date.now();
  const headers = [
    'From: Ali Muwwakkil <ali@colaberry.com>',
    `To: ${TO}`,
    `Cc: ${CC.join(', ')}`,
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
