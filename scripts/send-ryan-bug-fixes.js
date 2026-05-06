require('dotenv').config();

const TO = 'rmlandry29@gmail.com';
const CC = ['rlandry@landjet.com'];
const SUBJECT = 'Campaign bugs fixed -- Save All + Auto-Generate now channel-aware';

const BODY = `Ryan,

Both bugs you flagged are fixed and deployed. Quick rundown of what was happening and what changed.

1. PROMPT EDITS NOT STICKING WHEN YOU COME BACK

What was happening: the "Save Steps" button only saved your sequence steps. It ignored anything you had typed in the prompt textarea. So when you typed "300 words / CEO style" in the prompt, then changed a step's channel and clicked Save Steps (or Auto-Generate), your prompt edits were never sent to the server. When you came back to the screen, the prompt re-loaded from the database, which still had the old value.

Two fixes:
   - The button is now called "Save All" -- one click saves both the prompt and the sequence steps together.
   - The "Auto-Generate Prompts" button now saves your current prompt textarea BEFORE regenerating, so the AI builds on your latest manual edits instead of reading the old saved value.

2. AUTO-GENERATE IGNORING CHANNEL CHANGES

What was happening: the Auto-Generate logic was channel-blind. When you switched step 2 from "LinkedIn Connection Request" to "LinkedIn Message", the regenerator still produced "let's connect" style copy because it had no idea the channel had changed.

Fixes:
   - Auto-Generate now sees the channel for each step and applies channel-specific rules: connection requests stay under 280 characters and never pitch services; LinkedIn Messages assume you're already connected and never say "let's connect"; Email steps use full email format.
   - Bonus: Auto-Generate now PRESERVES your tone preference (CEO style vs founder-direct) and length preference (300 vs 120 words) by reading them out of your existing prompt before regenerating. So your style choices won't get overwritten anymore when you click the button.

3. ONE OTHER FIX (THE LINKEDIN MESSAGE THAT WAS BACKWARDS)

You flagged earlier today that one LinkedIn message had the sender and recipient swapped (Ariel writing to Ryan instead of Ryan writing to Ariel). Same root cause family. The AI didn't have explicit context about who is the sender vs the recipient. I made the LinkedIn message generator pass that explicitly: "You are writing FROM [sender] TO [recipient]. Greet the recipient. Sign off as the sender. Never write as if you are the recipient." The next time you refresh that contact, the message should generate correctly.

Refresh the campaign and try editing the prompt and the steps. Both should stick now. Let me know if anything still looks off.

Best,
Ali`;

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

  const headers = [
    'From: Ali Muwwakkil <ali@colaberry.com>',
    `To: ${TO}`,
    `Cc: ${CC.join(', ')}`,
    `Subject: ${SUBJECT}`,
    'Content-Type: text/plain; charset=UTF-8',
    'MIME-Version: 1.0',
  ].join('\r\n');

  const message = headers + '\r\n\r\n' + BODY;
  const encoded = Buffer.from(message).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const sendResp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
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
