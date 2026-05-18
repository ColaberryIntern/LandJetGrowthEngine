require('dotenv').config();

const SHOULD_SEND = process.argv.includes('--send');

const TO = 'rlandry@landjet.com';
const CC = ['rmlandry29@gmail.com'];
const BCC = ['ali@colaberry.com'];
const SUBJECT = "Re: QUESTIONS: OpenAI + URL";
const THREAD_ID = '19e2ba3b1010fde8';

const SIGNATURE_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#333333;line-height:1.5;margin-top:24px"><tr><td style="padding-bottom:6px"><strong style="font-size:15px;color:#000000">Ali Muwwakkil</strong><br><span style="color:#1a8fb5">Managing Director &mdash; AI Systems Architect</span></td></tr><tr><td style="padding-bottom:6px;color:#666666">Colaberry Inc.</td></tr><tr><td style="padding-bottom:4px"><span>&#128205; 200 Chisholm Place, Suite 200 &middot; Plano, TX 75075</span></td></tr><tr><td style="padding-bottom:8px"><a href="mailto:ali@colaberry.com" style="color:#0066cc;text-decoration:none">ali@colaberry.com</a> &nbsp;&middot;&nbsp; <a href="https://enterprise.colaberry.ai" style="color:#0066cc;text-decoration:none">enterprise.colaberry.ai</a></td></tr><tr><td><a href="https://enterprise.colaberry.ai" style="display:inline-block;padding:8px 18px;background-color:#1a8fb5;color:#ffffff;text-decoration:none;border-radius:20px;font-size:13px">&#128640; Design Your AI Organization</a></td></tr></table>`;

const BODY_HTML = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222222;line-height:1.55;max-width:680px">
<p>Ryan,</p>

<p><strong>Locked in 2pm CT Tuesday 5/19 for the screen share.</strong> Calendar invite coming separately. 5 minutes max, we&#39;ll do the OpenAI API billing + key generation live on your screen.</p>

<p>Three things on your weekend WhatsApp messages while I have you. Sorry I missed responding sooner, see below for status on each:</p>

<ol>
<li><strong>LinkedIn DMs reading like emails:</strong> fixed and deployed Saturday. The step 3 follow-up DMs were running 700-1100 chars (email length) because of a cap I set wrong two days earlier. They&#39;re now back to 130-200 chars, 2-3 sentences, conversational. Nothing to do with the ownership swap, that hasn&#39;t happened yet. Refresh and you&#39;ll see the difference.</li>

<li><strong>&quot;Already reached out&quot; leads at step 1:</strong> those are actually brand new leads, not repeats. I checked the data. The email-shaped DMs on the same screen made the queue feel broken, which I get. Should look right after refresh.</li>

<li><strong>Wrong-bucket contacts (staffing in manufacturing, memorial in construction):</strong> you can fix these yourself right now. On every outreach card there&#39;s a campaign dropdown right next to the Skip button. Pick the right campaign from the list and the lead swaps over immediately. Try it on the next one you see.</li>
</ol>

<p><strong>No need to pause anymore.</strong> The bug only affected step 3 LinkedIn DMs. Step 1 connect requests and email steps were always clean. Keep going.</p>

<p>Your &quot;Broad Business Services&quot; campaign suggestion for the identity-crisis prospects is a good one. I&#39;ll spin that up this week so the staffing/memorial-service edge cases have somewhere to live.</p>

<p>And yes, I am long overdue for that LandJet ride. Pick a city and I&#39;ll show up.</p>

<p>Talk tomorrow at 2.</p>

<p>Best,</p>
</div>${SIGNATURE_HTML}`;

const BODY_TEXT = `Ryan,

Locked in 2pm CT Tuesday 5/19 for the screen share. Calendar invite coming separately. 5 minutes max, we'll do the OpenAI API billing + key generation live on your screen.

Three things on your weekend WhatsApp messages while I have you. Sorry I missed responding sooner, see below for status on each:

1. LinkedIn DMs reading like emails: fixed and deployed Saturday. The step 3 follow-up DMs were running 700-1100 chars (email length) because of a cap I set wrong two days earlier. They're now back to 130-200 chars, 2-3 sentences, conversational. Nothing to do with the ownership swap, that hasn't happened yet. Refresh and you'll see the difference.

2. "Already reached out" leads at step 1: those are actually brand new leads, not repeats. I checked the data. The email-shaped DMs on the same screen made the queue feel broken, which I get. Should look right after refresh.

3. Wrong-bucket contacts (staffing in manufacturing, memorial in construction): you can fix these yourself right now. On every outreach card there's a campaign dropdown right next to the Skip button. Pick the right campaign from the list and the lead swaps over immediately. Try it on the next one you see.

No need to pause anymore. The bug only affected step 3 LinkedIn DMs. Step 1 connect requests and email steps were always clean. Keep going.

Your "Broad Business Services" campaign suggestion for the identity-crisis prospects is a good one. I'll spin that up this week so the staffing/memorial-service edge cases have somewhere to live.

And yes, I am long overdue for that LandJet ride. Pick a city and I'll show up.

Talk tomorrow at 2.

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
    body: JSON.stringify({ raw: encoded, threadId: THREAD_ID }),
  });
  const result = await resp.json();
  if (resp.ok) console.log('SENT! Message ID:', result.id);
  else console.log('Failed:', resp.status, JSON.stringify(result));
}

send().catch(e => console.error('Error:', e.message));
