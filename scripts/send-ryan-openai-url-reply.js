require('dotenv').config();

const SHOULD_SEND = process.argv.includes('--send');

const TO = 'rlandry@landjet.com';
const CC = ['rmlandry29@gmail.com'];
const BCC = ['ali@colaberry.com'];
const SUBJECT = "Re: QUESTIONS: OpenAI + URL";
// Thread reply: Gmail will thread by participant + subject for in-thread replies.
const THREAD_ID = '19e2ba3b1010fde8';

const SIGNATURE_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#333333;line-height:1.5;margin-top:24px"><tr><td style="padding-bottom:6px"><strong style="font-size:15px;color:#000000">Ali Muwwakkil</strong><br><span style="color:#1a8fb5">Managing Director &mdash; AI Systems Architect</span></td></tr><tr><td style="padding-bottom:6px;color:#666666">Colaberry Inc.</td></tr><tr><td style="padding-bottom:4px"><span>&#128205; 200 Chisholm Place, Suite 200 &middot; Plano, TX 75075</span></td></tr><tr><td style="padding-bottom:8px"><a href="mailto:ali@colaberry.com" style="color:#0066cc;text-decoration:none">ali@colaberry.com</a> &nbsp;&middot;&nbsp; <a href="https://enterprise.colaberry.ai" style="color:#0066cc;text-decoration:none">enterprise.colaberry.ai</a></td></tr><tr><td><a href="https://enterprise.colaberry.ai" style="display:inline-block;padding:8px 18px;background-color:#1a8fb5;color:#ffffff;text-decoration:none;border-radius:20px;font-size:13px">&#128640; Design Your AI Organization</a></td></tr></table>`;

const BODY_HTML = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222222;line-height:1.55;max-width:680px">
<p>Ryan,</p>

<p>Both questions answered.</p>

<p><strong>OpenAI privacy:</strong> zero crossover risk. ChatGPT (chat.openai.com) and the OpenAI API (platform.openai.com) are completely separate products even on the same login. Your wife won&#39;t see any API usage and you won&#39;t see her ChatGPT chats. They don&#39;t share history, billing, or anything else. So yes, you can use your existing account login. We just need to enable API billing (separate line from your $20/mo ChatGPT sub) and generate an API key. About $15-20/mo on top at our current usage.</p>

<p><strong>5-min screen share is the cleanest path.</strong> I&#39;ll walk you through the four clicks live, you generate the key on your screen, hand it to me directly. No sending keys around. Send me a few days and times that work for you over the next week and I&#39;ll schedule it.</p>

<p><strong>URL:</strong> growth.landjet.com locked in. I&#39;m sending Percy a separate email with the DNS record he needs to add (one line, takes a minute). Once that&#39;s in I&#39;ll handle nginx and the SSL cert on the server side.</p>

<p>Best,</p>
</div>${SIGNATURE_HTML}`;

const BODY_TEXT = `Ryan,

Both questions answered.

OpenAI privacy: zero crossover risk. ChatGPT (chat.openai.com) and the OpenAI API (platform.openai.com) are completely separate products even on the same login. Your wife won't see any API usage and you won't see her ChatGPT chats. They don't share history, billing, or anything else. So yes, you can use your existing account login. We just need to enable API billing (separate line from your $20/mo ChatGPT sub) and generate an API key. About $15-20/mo on top at our current usage.

5-min screen share is the cleanest path. I'll walk you through the four clicks live, you generate the key on your screen, hand it to me directly. No sending keys around. Send me a few days and times that work for you over the next week and I'll schedule it.

URL: growth.landjet.com locked in. I'm sending Percy a separate email with the DNS record he needs to add (one line, takes a minute). Once that's in I'll handle nginx and the SSL cert on the server side.

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
