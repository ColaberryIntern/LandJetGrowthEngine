/**
 * Forwards the email I just sent to Percy (Message ID 19dfe611c5db838d) back to ali@colaberry.com
 * since the original send did not BCC ali@colaberry.com.
 */
require('dotenv').config();

async function getAccessToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }).toString(),
  });
  const d = await r.json();
  return d.access_token;
}

async function main() {
  const token = await getAccessToken();

  // Fetch the original message (raw)
  const fetchResp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/19dfe611c5db838d?format=raw', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const msgData = await fetchResp.json();
  if (!msgData.raw) {
    console.log('Could not fetch original message:', JSON.stringify(msgData).substring(0, 200));
    return;
  }

  // Decode raw, prepend a "Fwd: " note, re-encode and send
  const original = Buffer.from(msgData.raw, 'base64').toString('utf-8');

  const noteHeader = [
    'From: Ali Muwwakkil <ali@colaberry.com>',
    'To: ali@colaberry.com',
    'Subject: Fwd: Re: AI In-Bound Email Engine -- Got everything, 3 questions before I lock the pricing engine',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    'Forwarded copy of the email I sent to Percy (CC: Ryan) at your request.',
    '',
    '--- Original message follows ---',
    '',
    original,
  ].join('\r\n');

  const encoded = Buffer.from(noteHeader).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const sendResp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encoded }),
  });

  const result = await sendResp.json();
  if (sendResp.ok) {
    console.log('FORWARDED to ali@colaberry.com! Message ID:', result.id);
  } else {
    console.log('Failed:', sendResp.status, JSON.stringify(result));
  }
}

main().catch(e => console.error('Error:', e.message));
