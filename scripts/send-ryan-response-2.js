require('dotenv').config();

const body = `Ryan,

Thank you for the detailed feedback. You are thinking about this exactly right. Here is where everything stands.

3-LAYER STRATEGY

I have organized your campaigns into three layers:

Layer 1 -- Current/Past Customers (existing campaigns):
Manufacturing, Insurance Broker, Banking & Finance, Sports & Events, Legal, Healthcare, Construction & Engineering, and Technology & Staffing. These already have your past customers loaded. We can refine the messaging to acknowledge the existing relationship.

Layer 2 -- Cold Outreach (just created):
I have already built 6 cold outreach campaign variants: Cold Outreach - Manufacturing, Cold Outreach - Insurance, Cold Outreach - Banking & Finance, Cold Outreach - Sports & Events, Cold Outreach - Legal, and Cold Outreach - Healthcare. Each has its own prompts tailored for first contact with people who have never heard of LandJet. The Apollo API is now fully connected and working. I ran a test search and found 15,938 matching leads (VPs, CEOs, and Executive Assistants at companies with 50-500 employees in Texas alone). Once we define the exact target criteria per campaign, I can start pulling leads in automatically.

Layer 3 -- Investor Outreach + General:
Keeping Investor Outreach active. I imported all 35 investors from your Excel file into the Investor Outreach campaign. That includes 20 direct contacts (named partners and directors with verified emails) and 15 general/IR contacts. The 5 upcoming events from the EVENTS tab are noted as well (Multi-Unit Franchising Conference, ACG DealMAX, IFA Legal Symposium, IPW, GBTA Convention). For General Outreach, I like your idea of using it as a newsletter/brand touchpoint channel. We can set that up on our next call once you decide whether it should be brand-wide or franchisee-specific.

APOLLO API

Fully connected and tested on the Basic plan. Both endpoints work:
- People Search: finds leads by title, industry, location, company size (does not cost credits)
- People Enrichment: pulls verified email addresses (costs 1 credit per lead, you have 5,000/month)

I can now search Apollo's database of 275M+ people and pull targeted leads directly into your cold outreach campaigns.

EXCEL UPLOAD

Your investor file has been imported. For future uploads, I can either take Excel files from you directly or build an upload feature in the Growth Engine. Happy to walk through it on the next call.

Apollo can also enrich the contacts that are missing LinkedIn URLs or direct emails. That is something I can do now that the API is connected.

EMAIL SIGNATURE

I pulled your signature from the email and loaded it into the system as the global signature. It includes your name, title, phone numbers, website, tagline, and a Book a Meeting link. You can see it in the outreach settings.

WEBSITE VISITOR TRACKING

Ready to set up. I can add landjet.com to Apollo's visitor tracking and install the tracking script through your CMS. Just say the word and I will turn it on.

NEXT STEPS
1. I will start pulling cold leads from Apollo into the cold outreach campaigns. What markets do you want to target first? (Iowa, San Antonio, Dallas as you mentioned on the call?)
2. Let me know if you want to schedule a call to walk through the new campaign structure and the upload process.
3. Website visitor tracking -- want me to go ahead and turn it on?

Best,
Ali`;

async function send() {
  const tokenResp = await fetch('https://login.microsoftonline.com/' + process.env.OAUTH_TENANT_ID + '/oauth2/v2.0/token', {
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
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject: 'Re: Growth Engine -- Apollo Connected + Investor Leads Imported',
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
