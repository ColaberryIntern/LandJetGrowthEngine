require('dotenv').config();

const body = `Ryan,

Thank you for the detailed feedback. Here is where everything stands.

SAVE BUG -- FIXED

That was a real bug on our end, not user error. The system was replacing your campaign settings instead of merging them, so when one field saved, it would wipe out edits you made to other fields. This is now fixed. Your edits will stick.

STEP REORDER -- DONE

You can now move steps up and down with arrow buttons on each step in the Strategy tab. Add a step anywhere and reorder it to the position you want.

COLD OUTREACH MARKETS -- LOADED

I pulled 154 cold leads from Apollo across your three target markets:
- Iowa + Quad Cities (including Rock Island, Henry, and Mercer counties in Illinois)
- Dallas MSA (Dallas, Fort Worth, Plano, Arlington, Irving, Frisco, McKinney, Denton, Richardson, Garland, Grand Prairie, and surrounding cities)
- San Antonio MSA (San Antonio, New Braunfels, San Marcos, Seguin, Schertz, Cibolo, Boerne)

Titles included: CEO, COO, VP Operations, President, Owner (under 250 employees), Executive Assistant, Travel Coordinator, Travel Manager, Regional Director, Managing Director, Partner.

Used 294 of your 5,000 monthly Apollo credits. The leads are distributed across your 6 cold outreach campaigns by industry.

NARROWING THE LIST

You asked great questions about prioritization. Here are the options:

1. Multi-location companies: Apollo can filter by companies with multiple office locations. I can run a search specifically for companies with 2+ locations in your target markets.

2. Lookalike audiences from current customers: I can analyze your existing customer base (industry, company size, title patterns, geography) and build a scoring model that ranks cold leads by how similar they are to your best customers.

3. Website visitor lookalike: Once Percy installs the Apollo tracking script (I sent him instructions), we will start collecting data on who visits landjet.com. After 2-3 weeks of data, the AI can identify patterns and auto-add similar profiles to your cold campaigns.

Happy to walk through the scoring approach on our next call.

INVESTOR CONTACTS -- 1,600 NEW

You were right that we missed contacts. The original import only pulled from one sheet (35 contacts from Capital Navigator). I found the full Investor Database file with 2,356 potential fits across Tier 1, Tier 2, and Tier 3. After deduplication, I imported 1,600 new investor contacts into your Investor Outreach campaign.

Your Investor Outreach campaign now has over 2,500 contacts total.

You also mentioned 2-3K contacts across all the Excel docs. Let us go through those on the next call to make sure nothing else was missed.

EVENTS

I captured the 5 events from your spreadsheet. We can discuss on the next call how you want to use those -- whether as a separate campaign, as context for investor outreach timing, or both.

WEBSITE VISITOR TRACKING

landjet.com is registered in Apollo. I sent Percy the tracking script to install on the website. Once he adds it (one line of code in the CMS), Apollo will start identifying companies visiting your site. The status will change from "Inactive" to "Active" in your Apollo dashboard under Inbound > Website Visitors.

CAMPAIGN PROMPT WORD COUNT

The word count in the prompt (like "under 120 words") is just an instruction to the AI, not a hard system limit. You can change it to 300 or whatever you want. The save issue you experienced was the same bug I fixed above -- your edits were reverting. Try it again now and it should stick.

SYSTEM TOTALS

- 7,782 total leads (up from 5,831)
- 16 active LandJet campaigns (10 existing + 6 cold outreach)
- Apollo: 294 of 5,000 monthly credits used
- Email signature loaded as global default

NEXT STEPS
1. Want me to run the multi-location company filter on your cold leads?
2. Percy tracking script -- once installed, visitor tracking goes live automatically
3. Let me know when works for a call to walk through the new structure and the upload process

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
        subject: 'Re: Growth Engine -- All Items Addressed + 1,600 New Investor Contacts Loaded',
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
