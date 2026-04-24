require('dotenv').config();

const body = `Ryan,

Hope you're doing well. I wanted to send you a detailed walkthrough of the LandJet Growth Engine -- the AI-powered outreach and lead management system we've built for you. This is a long one, so it might be a good read for the plane, but by the end you'll have a complete picture of everything that's in the system and how to use it.

---

YOUR LOGIN

URL: http://95.216.199.47:4000
Email: rlandry@landjet.com
Password: LandJet2026!

When you log in, you'll see three main tabs across the top: Outreach, Campaigns, and Inbound. There's also an Admin dropdown for the management pages, but those three tabs are your daily workflow.

---

THE BIG PICTURE

The Growth Engine is a single system that replaces what would normally be a stack of 7-10 separate tools (Apollo, Instantly.ai, Dripify, Airtable, Make.com, etc.) costing $300-500/month. Everything lives in one place:

- 5,791 leads across 12 campaigns (10 LandJet verticals + 2 MB Capital Ventures)
- AI-generated emails -- every email is written by GPT-4o specifically for that person, referencing their company and role
- Multi-channel outreach -- email, LinkedIn connection requests, and LinkedIn messages in a single sequence
- Email sending from your domain -- emails go out from rlandry@landjet.com via Microsoft 365 (set up with Percy's help)
- Test mode -- you can approve and send emails during testing and they all go to your Gmail instead of the real person, then undo everything with one click

---

1. OUTREACH (Your Daily Workflow)

This is the page you'll use most. Open it and you'll see a queue of contacts ready for outreach today.

What you see for each contact:
- Their name, email, company, vertical, and tier
- A campaign dropdown (which campaign they belong to)
- An AI-generated email draft with subject line and body
- Three buttons: Skip, Approve & Send, and the campaign selector

How the daily flow works:
1. Open the Outreach page
2. Review each contact card -- the AI has already written a personalized email
3. If you like it, click Approve & Send -- it sends immediately from rlandry@landjet.com
4. If you want to change it, edit the subject or body right in the card (they're editable fields)
5. If you want a different version, click one of three rewrite buttons: "Shorter", "More Personal", or "More Direct" -- the AI rewrites the draft in that tone
6. If you don't want to contact this person today, click Skip -- they come back tomorrow
7. If you want a different person from a specific campaign, change the campaign dropdown -- the system swaps in the next available lead from that campaign with a fresh draft

Settings (click the Settings button):
- Max emails per day -- global cap on how many go out (default 25)
- Follow-up delay -- days between sequence steps (default 4)
- AI Draft Generation -- toggle AI on/off
- Sender identity -- your name, role, and email
- Test Mode -- this is important for getting started

Test Mode (start here):
Test mode is ON by default. When it's on:
- Every email you approve goes to rmlandry29@gmail.com instead of the real lead
- The subject line shows [TEST -> real@email.com] so you know who it would have gone to
- The email body is identical to what the real person would receive
- You can test as many as you want
- When done testing, click "Undo Test Sends" -- all leads reset to their original state as if nothing happened
- When you're ready to go live, flip Test Mode OFF and emails go to real leads

Campaign Priority & Daily Limits:
Each campaign has a priority (higher = surfaces first) and a daily limit. For example, Investor Outreach has priority 90 and sends up to 10/day, while General Outreach has priority 30 and sends 2/day. This means your most important campaigns always get attention first. You can adjust these in each campaign's Settings tab.

---

2. CAMPAIGNS (Your 12 Outreach Programs)

The Campaigns page shows all your active outreach programs as cards. You have:

LandJet Campaigns (10):
- Investor Outreach (961 leads, priority 90)
- Manufacturing (111 leads)
- Insurance Broker (67 leads)
- Healthcare (11 leads)
- General (4,576 leads)
- Sports & Events (25 leads)
- Banking & Finance (19 leads)
- Legal (9 leads)
- Technology & Staffing (9 leads)
- Construction & Engineering (3 leads)

MB Capital Ventures Campaigns (2):
- Real Estate Developers (ready for leads)
- Public Co Growth Capital (ready for leads)

Click any campaign to see four tabs:

Overview -- Total leads, active, contacted, completed. Progress bar. Pipeline stages. Vertical distribution.

Leads -- Searchable table of every lead in the campaign. Click a lead to expand and see their timeline. You can upload new leads via CSV (just needs a column called "email" and optionally "name" and "company").

Strategy -- The AI prompt that controls how emails are written for this campaign. Each campaign has a system prompt plus 3 sequence steps (initial outreach, follow-up, final touch). Each step can be email or LinkedIn. The prompts use variables like {{first_name}} and {{company}} that get filled in automatically for each lead.

Settings -- Sender identity (name, role, email), emails per day slider, campaign priority slider, follow-up delay, AI toggle, and prompt variables. Prompt variables are values specific to this campaign (like "pain_point", "positioning", "proof_revenue") that get woven into the AI's writing.

"Rewrite Prompts with AI" button -- At the bottom of Settings, this button tells GPT-4o to rewrite all the prompts using only the defined variables. This is how you keep prompts clean.

---

3. INBOUND (Quote Requests & Business Inquiries)

This is the newest feature -- built based on Percy's suggestion about automating lead responses and quoting.

How it works:
1. Click Scan Emails -- the system reads your rlandry@landjet.com inbox
2. AI classifies each email into categories: quote request, service inquiry, partnership inquiry, lead referral, investor inquiry, or deal opportunity
3. Each inquiry appears as a card on the left side with a colored badge showing its type
4. Click any inquiry -- AI instantly drafts a professional response on the right side
5. Edit the subject and body if needed
6. Click Send Response -- it sends from rlandry@landjet.com

What Percy needs to do to make this fully operational:
The Inbound page reads from your LandJet Outlook inbox using the same Microsoft 365 connection Percy set up for email sending. But it needs one more permission:

1. Go to entra.microsoft.com > App registrations > LandJet Outreach_RL
2. API permissions > Add a permission > Microsoft Graph > Application permissions
3. Search "Mail.Read" > check it > Add
4. Click "Grant admin consent for LandJet"

Once that's done, the Inbound page will work immediately. The same step for "Calendars.Read" will enable the daily morning briefing feature we have ready to go.

---

OTHER FEATURES (Behind the Admin Dropdown)

These are management and analytics pages:
- QA -- Campaign health scores, QA scan results, agent activity
- Performance -- Request latency, throughput, capacity planning
- Infrastructure -- Deployments, resource allocation
- System -- Backend health, locale settings, AI agent status
- Jobs -- Background job executions with retry capability
- Docs -- Complete API documentation for the entire system

---

WHAT'S COMING NEXT

We have several features already built on the backend, ready to activate:

1. Daily Morning Briefing -- Every morning at 7am, you'll get an email with today's meetings, who you're meeting with, what their company does, and suggested conversation openers. (Needs Calendars.Read permission from Percy)

2. Weekly KPI Report -- Automated email with leads contacted, response rates, pipeline progression, and campaign performance breakdown.

3. Deal-to-Investor Matching -- Paste a deal summary and the AI scans your 961+ investor leads, ranks the top matches by fit, and drafts personalized outreach to each one.

4. Auto-Draft Email Replies -- AI reads your unread emails, drafts replies with confidence scores, and you approve before sending. (Needs Mail.Read permission from Percy)

---

HOW TO GET STARTED

1. Log in at http://95.216.199.47:4000 with rlandry@landjet.com / LandJet2026!
2. Go to Outreach -- test mode is already ON
3. Review a few contacts, click Approve & Send on ones you like
4. Check your Gmail (rmlandry29@gmail.com) -- the test emails will be there
5. Try the rewrite buttons (Shorter, More Personal, More Direct)
6. Try editing a draft directly
7. Try changing the campaign dropdown to swap in a different lead
8. When you're comfortable, go to Settings and flip Test Mode OFF

Let me know what you think and if you have any questions. Happy to walk through it on a call anytime.

Best,
Ali`;

async function send() {
  const tokenResp = await fetch(`https://login.microsoftonline.com/${process.env.OAUTH_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.OAUTH_CLIENT_ID,
      client_secret: process.env.OAUTH_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }).toString(),
  });
  const token = (await tokenResp.json()).access_token;

  const sendResp = await fetch('https://graph.microsoft.com/v1.0/users/rlandry@landjet.com/sendMail', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject: 'LandJet Growth Engine - Complete System Walkthrough (Read on the Plane)',
        body: { contentType: 'Text', content: body },
        toRecipients: [{ emailAddress: { address: 'rmlandry29@gmail.com' } }],
        ccRecipients: [{ emailAddress: { address: 'rlandry@landjet.com' } }],
      },
    }),
  });

  if (sendResp.status === 202) {
    console.log('EMAIL SENT to rmlandry29@gmail.com (CC: rlandry@landjet.com)');
  } else {
    const err = await sendResp.json().catch(() => ({}));
    console.log('Failed:', sendResp.status, JSON.stringify(err));
  }
}

send().catch(e => console.error(e.message));
