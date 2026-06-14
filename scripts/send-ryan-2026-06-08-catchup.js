require('dotenv').config();

const SHOULD_SEND = process.argv.includes('--send');

const TO = 'rlandry@landjet.com';
const CC = [];
const BCC = ['ali@colaberry.com'];
const SUBJECT = "Catching up on your five emails -- 2 decisions and a weekly sync";

const SIGNATURE_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,sans-serif;font-size:13px;color:#333333;line-height:1.5;margin-top:24px"><tr><td style="padding-bottom:6px"><strong style="font-size:15px;color:#000000">Ali Muwwakkil</strong><br><span style="color:#1a8fb5">Managing Director -- AI Systems Architect</span></td></tr><tr><td style="padding-bottom:6px;color:#666666">Colaberry Inc.</td></tr><tr><td style="padding-bottom:4px"><span>200 Chisholm Place, Suite 200 &middot; Plano, TX 75075</span></td></tr><tr><td style="padding-bottom:8px"><a href="mailto:ali@colaberry.com" style="color:#0066cc;text-decoration:none">ali@colaberry.com</a> &nbsp;&middot;&nbsp; <a href="https://enterprise.colaberry.ai" style="color:#0066cc;text-decoration:none">enterprise.colaberry.ai</a></td></tr><tr><td><a href="https://enterprise.colaberry.ai" style="display:inline-block;padding:8px 18px;background-color:#1a8fb5;color:#ffffff;text-decoration:none;border-radius:20px;font-size:13px">Design Your AI Organization</a></td></tr></table>`;

const BODY_HTML = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222222;line-height:1.55;max-width:680px">

<p>Ryan,</p>

<p>All five of your replies landed -- thanks for clearing the backlog.</p>

<p><strong>Confirmed and moving:</strong></p>
<ul>
  <li><strong>Sender lock:</strong> rlandry@landjet.com is canonical, whitelist guard is live. Done.</li>
  <li><strong>BookRides forwarding:</strong> your "agreed" on Option #1 is recorded (twice now).</li>
  <li><strong>Deck step assignments:</strong> investor deck on Investor Outreach step 1, intro deck on every industry / customer campaign step 1. Same answer in both your replies. We are set.</li>
  <li><strong>The five misclassified contacts:</strong> audit queued. I will patch the classifier this week.</li>
  <li><strong>Cost inputs and 10 to 15 historical trips:</strong> in motion as you asked.</li>
</ul>

<p><strong>Two quick decisions I need from you</strong></p>

<p><strong>1. Real Estate vs Construction</strong></p>

<p>Two of your five contacts (Rudy at Century Communities, Jacob at Waterton) are real estate. Our current vertical taxonomy has no Real Estate bucket. Options:</p>

<ul>
  <li>a. Add Real Estate as its own vertical (cleaner long-term, more setup).</li>
  <li>b. Fold real-estate leads into Construction (faster, and you grouped them that way in your note).</li>
</ul>

<p>My recommendation: <strong>(b) for now</strong>. If the Real Estate ICP and messaging look different from Construction once we have more leads, we revisit. Your call.</p>

<p><strong>2. Where were you when attachments were not showing?</strong></p>

<p>When you said "in the tool and not seeing attachments," which screen?</p>

<ul>
  <li>a. <strong>/admin/attachments</strong> (the deck upload page). Both decks are there as of 6/2, so if they are not visible to you, it is a bug to fix.</li>
  <li>b. <strong>A campaign step editor</strong> expecting to see the deck wired to step 1. That picker UI is not built yet -- the wiring would have to be done in the database today.</li>
</ul>

<p>If (b), I will wire both decks to step 1 manually tonight and send you a screenshot, then ship the picker UI later this week.</p>

<p><strong>On the TX split idea</strong> -- separate note coming on that. I want to think through the wiring before I respond.</p>

<p><strong>One ongoing ask:</strong> I want to put a recurring 30-minute sync on the books so we keep velocity steady instead of doing multi-week catch-ups. What days and times generally work for you week to week? Send me your preferences and I will get the invite over to you.</p>

<p>Best,</p>

</div>${SIGNATURE_HTML}`;

const BODY_TEXT = `Ryan,

All five of your replies landed -- thanks for clearing the backlog.

Confirmed and moving:
- Sender lock: rlandry@landjet.com is canonical, whitelist guard is live. Done.
- BookRides forwarding: your "agreed" on Option #1 is recorded (twice now).
- Deck step assignments: investor deck on Investor Outreach step 1, intro deck on every industry / customer campaign step 1. Same answer in both your replies. We are set.
- The five misclassified contacts: audit queued. I will patch the classifier this week.
- Cost inputs and 10 to 15 historical trips: in motion as you asked.

Two quick decisions I need from you

1. Real Estate vs Construction

Two of your five contacts (Rudy at Century Communities, Jacob at Waterton) are real estate. Our current vertical taxonomy has no Real Estate bucket. Options:

  a. Add Real Estate as its own vertical (cleaner long-term, more setup).
  b. Fold real-estate leads into Construction (faster, and you grouped them that way in your note).

My recommendation: (b) for now. If the Real Estate ICP and messaging look different from Construction once we have more leads, we revisit. Your call.

2. Where were you when attachments were not showing?

When you said "in the tool and not seeing attachments," which screen?

  a. /admin/attachments (the deck upload page). Both decks are there as of 6/2, so if they are not visible to you, it is a bug to fix.
  b. A campaign step editor expecting to see the deck wired to step 1. That picker UI is not built yet -- the wiring would have to be done in the database today.

If (b), I will wire both decks to step 1 manually tonight and send you a screenshot, then ship the picker UI later this week.

On the TX split idea -- separate note coming on that. I want to think through the wiring before I respond.

One ongoing ask: I want to put a recurring 30-minute sync on the books so we keep velocity steady instead of doing multi-week catch-ups. What days and times generally work for you week to week? Send me your preferences and I will get the invite over to you.

Best,
Ali Muwwakkil
Managing Director -- AI Systems Architect
Colaberry Inc.
ali@colaberry.com`;

async function send() {
  if (!SHOULD_SEND) {
    console.log('=== DRAFT MODE (no --send flag) ===');
    console.log('From: Ali Muwwakkil <ali@colaberry.com>');
    console.log('To:', TO);
    console.log('Cc:', CC.length ? CC.join(', ') : '(none)');
    console.log('Bcc:', BCC.join(', '));
    console.log('Subject:', SUBJECT);
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
  const tokenJson = await tr.json();
  if (!tokenJson.access_token) {
    throw new Error('Token refresh failed: ' + JSON.stringify(tokenJson));
  }
  const access_token = tokenJson.access_token;

  const altBoundary = '----=_LandJet_alt_' + Date.now();

  const headerLines = [
    'From: Ali Muwwakkil <ali@colaberry.com>',
    `To: ${TO}`,
  ];
  if (CC.length) headerLines.push(`Cc: ${CC.join(', ')}`);
  headerLines.push(`Bcc: ${BCC.join(', ')}`);
  headerLines.push(`Subject: ${SUBJECT}`);
  headerLines.push('MIME-Version: 1.0');
  headerLines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);

  const raw = [
    headerLines.join('\r\n'),
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
  ].join('\r\n');

  const encoded = Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const sendResp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + access_token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encoded }),
  });
  const result = await sendResp.json();
  if (!sendResp.ok) {
    throw new Error('Send failed: ' + JSON.stringify(result));
  }
  console.log('SENT.');
  console.log('Gmail message id:', result.id);
  console.log('Thread id:', result.threadId);
}

send().catch(e => { console.error('ERR', e); process.exit(1); });
