require('dotenv').config();

// SAFETY: Set DRAFT_MODE=true to print the email instead of sending.
// To actually send: node scripts/send-percy-decisions-locked.js --send
const SHOULD_SEND = process.argv.includes('--send');

const TO = 'pkapadia@landjet.com';
const CC = ['rlandry@landjet.com'];
const BCC = ['ali@colaberry.com'];
const SUBJECT = "Re: AI In-Bound Email Engine -- Decisions locked in, one question still open";

const SIGNATURE_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#333333;line-height:1.5;margin-top:24px"><tr><td style="padding-bottom:6px"><strong style="font-size:15px;color:#000000">Ali Muwwakkil</strong><br><span style="color:#1a8fb5">Managing Director &mdash; AI Systems Architect</span></td></tr><tr><td style="padding-bottom:6px;color:#666666">Colaberry Inc.</td></tr><tr><td style="padding-bottom:4px"><span>&#128205; 200 Chisholm Place, Suite 200 &middot; Plano, TX 75075</span></td></tr><tr><td style="padding-bottom:8px"><a href="mailto:ali@colaberry.com" style="color:#0066cc;text-decoration:none">ali@colaberry.com</a> &nbsp;&middot;&nbsp; <a href="https://enterprise.colaberry.ai" style="color:#0066cc;text-decoration:none">enterprise.colaberry.ai</a></td></tr><tr><td><a href="https://enterprise.colaberry.ai" style="display:inline-block;padding:8px 18px;background-color:#1a8fb5;color:#ffffff;text-decoration:none;border-radius:20px;font-size:13px">&#128640; Design Your AI Organization</a></td></tr></table>`;

const BODY_HTML = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222222;line-height:1.55;max-width:680px">
  <p>Percy,</p>

  <p>Thanks for the fast turnaround. Your three answers are now wired into the pricing engine. Quick recap so you have a record:</p>

  <p><strong>1. Customer category detection</strong></p>
  <p>Email-domain match on <code>@johndeere.com</code> auto-flags the rider as a JD employee and applies the JD rate card ($200 base, $2.20/mi). Every other inbound goes to the standard rate, and the concierge can override the category before the quote goes out. The Lockton domain rule is parked in code as a harmless extra in case it ever helps.</p>

  <p><strong>2. Iowa 7% sales tax</strong></p>
  <p>Tax applies only when pickup, dropoff, AND every intermediate stop are in Iowa. A single stop outside IA (even a brief one in IL) disqualifies the trip from Iowa tax. The engine reads the full stops list off the inbound trip, so this is automatic. Tax is also gated by market, so QC and Des Moines apply it but TX and NE never will, even on an all-IA itinerary.</p>

  <p><strong>3. Kansas City</strong></p>
  <p>The AI does not generate KC quotes. Any inbound routed to Kansas City returns a "forward only" signal with the destination address set to <a href="mailto:holly@kclandjet.com">holly@kclandjet.com</a> and <a href="mailto:scott@kclandjet.com">scott@kclandjet.com</a>. The Reservations Inbound page will forward the original email instead of drafting a quote.</p>

  <p>All three are covered by unit tests (57 passing) and pushed to main. Nothing here goes live to customers until we wire it into the Inbound page and you sign off on a few sample quote drafts side by side with Lorie's voice.</p>

  <p><strong>One question still open from my last note:</strong></p>

  <p>JD round-trip base rate. The master pricing doc says base rate applies to the initial leg only on round-trips. But the John Deere sample quote you sent (Praful Kolte) showed the base rate on BOTH legs ($200 + $200 = $400). Default behavior in code today follows the master doc (initial leg only); I left a flag <code>apply_base_to_return_leg</code> so we can flip it without a code change once you or Lorie confirm. No rush, just want it on your radar for the next concierge team call.</p>

  <p>Best,</p>
</div>${SIGNATURE_HTML}`;

const BODY_TEXT = `Percy,

Thanks for the fast turnaround. Your three answers are now wired into the pricing engine. Quick recap so you have a record:

1. Customer category detection

Email-domain match on @johndeere.com auto-flags the rider as a JD employee and applies the JD rate card ($200 base, $2.20/mi). Every other inbound goes to the standard rate, and the concierge can override the category before the quote goes out. The Lockton domain rule is parked in code as a harmless extra in case it ever helps.

2. Iowa 7% sales tax

Tax applies only when pickup, dropoff, AND every intermediate stop are in Iowa. A single stop outside IA (even a brief one in IL) disqualifies the trip from Iowa tax. The engine reads the full stops list off the inbound trip, so this is automatic. Tax is also gated by market, so QC and Des Moines apply it but TX and NE never will, even on an all-IA itinerary.

3. Kansas City

The AI does not generate KC quotes. Any inbound routed to Kansas City returns a "forward only" signal with the destination address set to holly@kclandjet.com and scott@kclandjet.com. The Reservations Inbound page will forward the original email instead of drafting a quote.

All three are covered by unit tests (57 passing) and pushed to main. Nothing here goes live to customers until we wire it into the Inbound page and you sign off on a few sample quote drafts side by side with Lorie's voice.

One question still open from my last note:

JD round-trip base rate. The master pricing doc says base rate applies to the initial leg only on round-trips. But the John Deere sample quote you sent (Praful Kolte) showed the base rate on BOTH legs ($200 + $200 = $400). Default behavior in code today follows the master doc (initial leg only); I left a flag apply_base_to_return_leg so we can flip it without a code change once you or Lorie confirm. No rush, just want it on your radar for the next concierge team call.

Best,
Ali Muwwakkil
Managing Director -- AI Systems Architect
Colaberry Inc.
ali@colaberry.com`;

async function send() {
  if (!SHOULD_SEND) {
    console.log('=== DRAFT MODE (no email sent) ===');
    console.log('To:', TO);
    console.log('Cc:', CC.join(', '));
    console.log('Bcc:', BCC.join(', '));
    console.log('Subject:', SUBJECT);
    console.log('---');
    console.log(BODY_TEXT);
    console.log('---');
    console.log('To actually send: node scripts/send-percy-decisions-locked.js --send');
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
