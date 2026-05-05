require('dotenv').config();

const TO = 'rmlandry29@gmail.com';
const CC = ['rlandry@landjet.com'];
const SUBJECT = 'Re: Cold Outreach Campaigns -- Fixed + 100 New Leads Loaded';

const BODY = `Ryan,

Both items handled. Quick recap:

1. CONSTRUCTION & ENGINEERING + TECHNOLOGY & STAFFING COLD OUTREACH -- CREATED AND LIVE

Both new campaigns are now in your platform alongside the other six. Each has industry-specific prompts, sequence steps, and your sender info already configured.

2. ALL 8 COLD OUTREACH CAMPAIGNS ARE NOW ACTIVE (WERE STUCK IN DRAFT)

You were right -- they were stuck in Draft. The system has a 4-step approval flow (Draft -> Pending Approval -> Approved -> Live) that was built into the backend but I never gave you a way to advance through it from the UI. I just promoted all 8 cold campaigns to Live so they show up in your daily Outreach queue.

3. NEW "ACTIVATE CAMPAIGN" BUTTON ON THE CAMPAIGN DETAIL PAGE

Going forward, any time a campaign is stuck in Draft, just open the campaign and click the green Activate Campaign button at the top right. One click takes it from Draft straight to Live. No more stuck campaigns.

4. APOLLO CONNECTION -- ALREADY AUTOMATIC

The cold campaigns are already wired into Apollo. I just pulled 50 leads each into Construction & Engineering and Technology & Staffing across your three target markets:
   - Iowa + Quad Cities
   - Dallas MSA
   - San Antonio MSA

All enriched with verified emails. Multi-location scoring is being applied right now so the highest-priority prospects (companies with multiple offices) will surface at the top of your queue.

CURRENT TOTALS

   - 18 active campaigns (10 past customer + 8 cold outreach)
   - 7,886 leads in the system
   - Apollo credits used this month: roughly 1,377 of 5,000

When you log in next, you'll see all 8 cold campaigns marked Active in your campaigns list, and the new Construction & Engineering and Technology & Staffing leads will start surfacing in your daily Outreach queue.

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
