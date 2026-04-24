require('dotenv').config();

const body = `Ryan,

Thanks for the kind words -- really glad this resonates. I wanted to follow up on the three things you mentioned while you were on the plane with a more detailed breakdown of each one.

---

1. SEPARATING LANDJET FROM MB CAPITAL VENTURES

Completely understood and already planned for. Here is how we handle this:

Right now, the two MB Capital campaigns (Real Estate Developers and Public Co Growth Capital) are just campaign records inside the LandJet Growth Engine. They share the same database and currently would send from rlandry@landjet.com. That is not ideal for the reasons you mentioned -- different business, different brand, different scoring criteria.

What we will do:

Short-term (this week): We will deactivate the MB Capital campaigns so they do not appear in your LandJet outreach queue at all. LandJet stays 100% focused.

Long-term (when you are ready): We spin up a completely separate Growth Engine instance for MB Capital Ventures. This means:
- Its own database (separate lead pool, separate scoring)
- Its own email domain (whatever MBCV email your IT firm manages)
- Its own campaign prompts and variables tailored to capital advisory
- Its own AI agents tuned for investor/developer outreach
- Completely independent from LandJet -- no shared data

The technology is identical -- same system, same AI, same interface you are learning now. But the data and operations are fully separated.

When you are ready to activate MBCV, we will connect with your IT firm the same way we did with Percy. They will need to:
1. Set up an Azure AD App Registration (5 minutes)
2. Add Mail.Send permission and grant admin consent
3. Share the client ID, secret, and tenant ID with us

That is it. Same process, takes about 15 minutes on a call.

LandJet is the priority. MBCV is parked and ready for when the time is right.

---

2. WEBSITE VISITOR INTELLIGENCE AND LOOKALIKE AUDIENCES

This absolutely makes sense and it is a high-value feature. Here is how it works:

The Problem You Are Solving:
Right now, people visit landjet.com, look around, and leave. You have no idea who they were, what company they work for, or what they were interested in. That is lost opportunity.

How We Solve It:

Step 1 -- Visitor Identification
We connect a visitor deanonymization service to landjet.com. Tools like Clearbit Reveal, RB2B, or 6sense can identify roughly 30-40% of your website visitors by matching their IP address and device fingerprint to business profiles. For each identified visitor, we get:
- Company name
- Industry and company size
- Location
- Sometimes the specific person (name, title, LinkedIn)

We already have a Visitor tracking model built into the Growth Engine (we track page views, sessions, and visitor fingerprints). We just need to connect it to an enrichment service.

Step 2 -- Pattern Analysis
Once we have a few weeks of visitor data, the AI analyzes the patterns:
- "Your website visitors are mostly VP-level executives at manufacturing companies with 200-500 employees in the Dallas-Fort Worth area"
- "62% of visitors who view the pricing page are in the insurance vertical"
- "Weekend visitors tend to be C-suite researching for Monday meetings"

Step 3 -- Lookalike Audience Building
Based on those patterns, we query our lead database (or Apollo) to find similar profiles who have NOT visited your site yet. These become a new prospecting list that automatically gets added to the appropriate campaign.

Example: If the AI sees that manufacturing VPs in Texas are your most engaged website visitors, it builds a list of manufacturing VPs in Texas who have not been contacted yet and adds them to the Manufacturing Outreach campaign.

Step 4 -- Social Media Intelligence
LinkedIn Company Page analytics and Meta Business insights both provide demographic data about who is engaging with your content. We can pull this data and combine it with website visitor data to build an even richer picture.

What It Costs:
- Visitor ID tool: roughly $99-199/month depending on the provider
- Apollo API access for lookalike building: roughly $49/month (you may already have this)
- Everything else uses the existing Growth Engine infrastructure

Timeline: This is a Phase 2 feature. We would build it after the core outreach system is running and generating data. Estimated 1-2 sprints to implement.

---

3. SEO, GEO, AND CONTENT MARKETING FROM OUTREACH DATA

This is where the system becomes a true competitive advantage. Here is the concept:

The Insight:
Every email you send through the Growth Engine generates data. We track which subjects get opened, which body copy gets replies, which proof points drive meetings, and which verticals engage fastest. Most companies never connect their outreach data to their content strategy. You will.

How It Works:

Step 1 -- Engagement Pattern Analysis
After you have sent 500-1000 emails across your campaigns, the AI has enough data to identify patterns:
- "The phrase 'mobile boardroom' gets 3x more opens than 'executive transportation' in Manufacturing"
- "Mentioning the John Deere case study doubles reply rates for Insurance prospects"
- "Emails under 80 words get 40% higher response rates than emails over 120 words"

Step 2 -- Content Generation
The AI takes those winning themes and reverse-engineers content:
- Blog post: "Why Manufacturing Executives Are Replacing Shuttle Programs with Mobile Boardrooms"
- LinkedIn article: "The Hidden Cost of Executive Travel Time in Multi-Facility Operations"
- Landing page: "LandJet for Insurance Brokers -- Client-Ready Travel Between Appointments"

Each piece of content is built from real engagement data, not guesses. You know these themes resonate because they already got replies from real prospects.

Step 3 -- GEO (Generative Engine Optimization)
This is the newest frontier. When someone asks ChatGPT, Perplexity, or Google AI "What is the best executive ground transportation company?" -- you want LandJet to appear in that answer. GEO-optimized content is structured specifically to be picked up by AI search engines. We would generate content that answers the exact questions your prospects are asking, formatted so AI engines cite LandJet as the authority.

Step 4 -- Distribution
- Blog posts published directly to your website CMS
- LinkedIn posts drafted for your approval (you post manually to keep it authentic)
- Landing pages generated for each vertical
- Google Search Console monitoring to track keyword rankings

What This Looks Like Monthly:
- Week 1: AI generates content suggestions based on outreach data
- Week 2: You approve or edit the top 3-4 pieces
- Week 3: Content published and distributed
- Week 4: Performance review -- what drove traffic, what ranked, what converted

Timeline: Phase 3 feature. Requires enough outreach data to identify patterns (roughly 2-3 months of active sending). The content engine would then run continuously, getting smarter as more data flows in.

---

SUMMARY AND NEXT STEPS

Right now, your only focus should be:
1. Log in and test the outreach system (test mode is on, nothing goes to real people)
2. Get comfortable with the workflow: review, edit, rewrite, approve
3. Let me know when you are ready to flip test mode off and start real outreach

Everything else -- MBCV separation, visitor intelligence, content engine -- is planned and ready to build when the time is right. The foundation we have built supports all of it.

Let me know when you have had a chance to test it and we will schedule a walkthrough call.

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
        subject: 'Re: Growth Engine -- MBCV Separation, Visitor Intelligence, and Content Strategy',
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
