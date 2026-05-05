require('dotenv').config();

const TO = 'rmlandry29@gmail.com';
const CC = ['rlandry@landjet.com'];
const SUBJECT = 'Re: Apollo connection -- here\'s how it works now';

const BODY = `Ryan,

Good questions, and I built out some new functionality so the answers are more interesting than they would have been an hour ago.

AUTO-REPLENISHMENT? SORT OF -- NOW IT'S ON-DEMAND, ON YOUR TERMS

I just deployed a new "+ Pull from Apollo" button on every cold outreach campaign. Open any cold campaign and you'll see it at the top right next to the Activate button. Click it, enter how many leads you want (up to 100 at a time), and the system pulls them directly from Apollo into that campaign with verified emails. Multi-location scoring is applied automatically.

I went with on-demand instead of full auto-replenishment because I wanted you to control the credit spend. Each lead costs 1 Apollo credit. If you click "Pull 50" twice today, that's 50 credits. If you don't click, no credits used.

If you'd rather have it fully automated -- "when campaign drops below 20 active leads, auto-pull 30 more" -- I can layer that on. Just let me know.

CREDIT BUDGET? NOW VISIBLE ON THE SYSTEM PAGE

Go to System and you'll see a new "Apollo Lead Sourcing Credits" widget at the top showing how many credits you've used this month vs your 5,000 limit. Color-coded green/amber/red so you can see at a glance if you're approaching the cap. Right now you're at roughly 1,377 of 5,000 used (about 28%).

INDUSTRY-SPECIFIC PULLS? CONFIRMED YES

Each cold campaign has its own filter set:
- Industry (Manufacturing -> manufacturing, machinery, automotive; Construction -> civil engineering, architecture, etc.)
- Titles (CEO, COO, VP Ops, Owner, Travel Coordinator, etc.)
- Markets (Iowa/Quad Cities, Dallas MSA, San Antonio MSA)
- Company size (50-1000 employees)

The multi-location scoring applies after the pull -- it boosts companies with multiple offices/sub-orgs higher in your daily Outreach queue, but doesn't filter the pull itself.

VARIABLE CONSISTENCY -- FOUND AND FIXED AN ISSUE

While I had the hood up, I audited every campaign to verify that the variables you set in Settings (pain_point, positioning, proof_customer, similar_companies, etc.) were actually being woven into the AI prompts. Found that 15 of your 18 campaigns had variables defined but the prompts didn't reference them. So when the AI wrote an email, it was winging it with whatever it knew about LandJet rather than using your specific messaging.

I just ran "Rewrite Prompts with AI" on all 15 affected campaigns. Re-audit confirms zero campaigns still have unused variables. From now on, when you change a value in a campaign's variables (like updating "$350B" to "$10B" or swapping out a proof_customer), it will actually drive the messaging across that campaign's system prompt and every sequence step. Click "Rewrite Prompts with AI" any time you change a variable and want it pushed through.

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
