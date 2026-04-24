require('dotenv').config();

const body = `Ryan,

Thank you for the detailed feedback. You are thinking about this exactly right. Let me address everything and share what has been built since your last email.

CAMPAIGN STRATEGY -- 3 LAYERS

You nailed it. Here is how I have organized everything:

Layer 1 -- Current/Past Customers (existing campaigns):
Manufacturing, Insurance Broker, Banking & Finance, Sports & Events, Legal, Healthcare, Construction & Engineering, and Technology & Staffing. These already have your past customers loaded. We will refine the messaging to acknowledge the existing relationship so it does not read like a cold email to someone who already knows LandJet.

Layer 2 -- Cold Outreach (just created):
I built 6 new cold outreach campaigns: Cold Outreach - Manufacturing, Cold Outreach - Insurance, Cold Outreach - Banking & Finance, Cold Outreach - Sports & Events, Cold Outreach - Legal, and Cold Outreach - Healthcare. Each has its own prompts written for first contact with people who have never heard of LandJet. The Apollo API is now fully connected and tested. I ran a search and found 15,938 matching leads just in Texas alone (VPs, CEOs, Executive Assistants at companies with 50-500 employees). Once you confirm which markets to target first (Iowa, San Antonio, Dallas?), I will start pulling leads in.

Layer 3 -- Investor Outreach + General:
I am keeping Investor Outreach active. I imported all 35 investors from your Excel file into the campaign. That includes 20 direct contacts (named partners and directors with verified emails like Adam VeVerka at NewSpring, Alisa Carmichael at VMG Partners, Tim Doyle at Destiny Capital) and 15 general/IR contacts. I also captured the 5 upcoming events from your EVENTS tab:
  - 2026 Multi-Unit Franchising Conference (Las Vegas)
  - ACG DealMAX 2026 (Las Vegas)
  - IFA26 Legal Symposium (Washington DC)
  - U.S. Travel Association IPW (Fort Lauderdale)
  - GBTA Convention 2026 (Chicago)

For General Outreach, I like your idea of using it as a newsletter/brand touchpoint channel. We can set that up on our next call. It could be brand-wide for all of LandJet or franchisee-specific. Either way the system supports it.

INVESTOR OUTREACH -- YOUR EXCEL FILE

Imported and ready. For future uploads, you can either send me the Excel files directly or use the "Upload CSV" button on the campaign Leads tab. I can walk you through it on our next call.

For the contacts missing LinkedIn URLs or direct emails, Apollo can now fill those in automatically. I can run an enrichment pass on all 35 investor contacts to pull verified emails and LinkedIn profiles from Apollo's database. Just say the word.

APOLLO API

Fully connected and tested on the Basic plan. Both critical endpoints work:
- People Search: finds leads by title, industry, location, company size (does not cost credits)
- People Enrichment: pulls verified email addresses (costs 1 credit per lead, you have 5,000/month)

You do not need to connect Gmail or Outlook to Apollo. All sending goes through our system.

One note: the API key I created on the free plan had limited permissions. Now that you are on Basic, I created a new key with full access. Everything is working. Next time I need to log in I will give you a heads up for the verification code.

EMAIL SIGNATURE

Done. I pulled your signature from the email (name, title, phone numbers, website, tagline, Book a Meeting link) and loaded it as the global default. Every outgoing email will now include it. If any campaign needs a different signature, you can set an override in that campaign's Settings tab.

NEW FEATURES SINCE YOUR LAST EMAIL

Here is what has been built and deployed:

1. Campaign Variables in Prompts -- When you go to a campaign's Overview tab, you will now see green badges showing which campaign variables (like pain_point, value_prop, proof_point) are being used in the AI prompt. Gray badges show variables that are defined but not yet referenced. When you click "Rewrite Prompts with AI" on the Strategy tab, it now guarantees that every single variable gets included in the rewritten prompts.

2. Strategy Tab Upgrades -- You can now add steps, remove steps, and auto-generate prompts:
   - "+ Add Step" button lets you add new sequence steps (email, LinkedIn, SMS, voice)
   - "Remove" button on each step lets you delete it (remaining steps renumber automatically)
   - "Auto-Generate Prompts" button uses AI to write prompts for all steps based on your campaign variables
   - Step count is no longer limited to 3. You can have as many steps as you want.

3. Rewrite Buttons on LinkedIn -- The Shorter, More Personal, and More Direct buttons now work on LinkedIn messages too, not just emails. You also have "Reset to Original" on both email and LinkedIn.

4. Customizable Rewrite Buttons -- In the Outreach settings (gear icon), there is now a "Rewrite Buttons" section where you can rename the buttons (e.g., change "Shorter" to "Punchier" or "Add Stats") or add new rewrite styles. This way as you get used to how you like messages rewritten, you can set it up exactly how you want.

5. Dynamic Step Tracking -- The Leads tab now shows the correct step count for each lead based on the actual number of steps in the campaign, not a hardcoded "1/3". If you add a 4th or 5th step, leads will track through all of them.

WEBSITE VISITOR TRACKING

Ready to set up. I can add landjet.com to Apollo's visitor tracking and install the script through your CMS. Want me to go ahead?

NEXT STEPS
1. Which markets do you want cold leads from first? (Iowa, San Antonio, Dallas?)
2. Want me to run the Apollo enrichment on your 35 investor contacts to fill in missing LinkedIn and emails?
3. Want me to turn on website visitor tracking for landjet.com?
4. Let me know when works for a call to walk through the new campaign structure and upload process.

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
        subject: 'Re: Growth Engine -- Full Update + New Features',
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
