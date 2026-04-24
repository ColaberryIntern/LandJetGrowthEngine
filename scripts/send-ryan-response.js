require('dotenv').config();

const body = `Ryan,

Thank you again for the kind words and for diving in. Really glad to see you already in there making edits. Here are my responses to each of your items:

1. Campaign edits and email updates -- Great, those are saved. The system picked up your changes.

2. Existing customer leads -- Understood. The industry campaigns (Manufacturing, Insurance, Banking, Sports, Legal) are solid frameworks. We will duplicate each one as a "Cold Outreach" version with messaging tailored for first contact rather than returning customers.

3. Cold outreach strategy -- Agreed. We will keep the existing industry campaigns as-is for past customers and create parallel cold versions. We will also deactivate General Outreach and Investor Outreach from the active queue.

4. Apollo account -- I was able to get into your account and set up the API key. Here is what I found:

   - You are on the Free plan (80 credits). The free plan lets us manage contacts and search your saved data, but the key endpoints we need for prospecting (searching Apollo's full database of 275M+ people and enriching them with verified emails) require the Basic plan.
   - Basic plan is $49/month (billed annually) or $59/month billed monthly. It gives you 5,000 credits per month. Each lead we pull an email for costs 1 credit, so that is 5,000 new leads per month with verified emails.
   - You do NOT need to connect your Gmail or Outlook to Apollo. All email sending goes through our Growth Engine, not Apollo. Apollo is just our lead database.
   - Once you upgrade, I will have full API access and can start pulling cold leads by industry, title, company size, and location directly into your campaigns.

5. Website visitor tracking -- Great news here. Apollo has a built-in website visitor tracking feature (I saw it in your account under Inbound > Website Visitors). Once you upgrade, we can add landjet.com and it will automatically identify companies visiting your website. This means we do NOT need a separate tool like Clearbit or RB2B. Apollo handles it all in one place.

6. Other tools -- For now, Apollo is the only tool you need. Down the road we may add People Data Labs for extra email validation, but Apollo's enrichment should be sufficient to start.

7. Sending test emails -- Go to the Outreach page and look for the yellow "TEST MODE" banner at the top. When test mode is on, every email you approve goes to your Gmail (rmlandry29@gmail.com) instead of the actual lead. Just click "Approve & Send" on any email card. I will also make the test mode flow more obvious in the UI.

8. Email signature -- I see the issue. The signature field was only accepting plain text. I am updating it to support HTML formatting so your Outlook signature pastes correctly with logos and links. In the meantime, if you forward me an email with your signature, I can pull the HTML and load it in for you.

9. CMS access -- Thank you for sending the login. I have reviewed the guide and have access. Once we set up Apollo's website visitor tracking, I can add the tracking script through your CMS. No changes needed from TAG at this point.

Next step from you: Upgrade to the Apollo Basic plan ($49/mo annual). Once that is done, I will have everything I need to start pulling cold leads into your campaigns and setting up the website visitor tracking.

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
        subject: 'Re: Growth Engine -- Responses to Your Items',
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
