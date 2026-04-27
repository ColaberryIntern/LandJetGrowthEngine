require('dotenv').config();

const body = `Ryan,

Thanks for catching the MB Capital campaigns showing up in QA. They are now fully removed from the system across all admin pages, not just hidden. I went through every table in the database to make sure no traces remain. When MBCV is ready to launch, we will spin up that completely separate instance we discussed.

MULTI-LOCATION SCORING -- LIVE

Great call on scoring vs excluding. The system now boosts leads from multi-location companies instead of filtering single-location companies out:

- Major multi-location enterprise (10+ sub-orgs or 50+ retail locations): +8 priority points
- Mid-size multi-location (3+ sub-orgs or 5+ retail): +5 points
- Likely multi-location (1+ sub-org or 1000+ employees): +2 points

I ran the enrichment on a sample of your cold outreach leads using Apollo. Some standout multi-location prospects already identified:
- Cummins Southern Plains (29 sub-orgs, 31 retail locations)
- Lubys Restaurant Company (84 retail locations)
- Chicken Salad Chick (38 retail locations)
- Johnstone Supply (37 retail locations)
- Zachry Hospitality (17 sub-orgs)
- XPEL (8 sub-orgs)

These will now surface higher in your daily Outreach queue automatically. Want me to run the enrichment on all cold leads so the entire queue is properly scored? It would cost roughly 100-150 Apollo credits.

PERCY -- TRACKING SCRIPT

Got it, thanks. Looking forward to his ops thoughts as well.

CALL -- TUESDAY 2PM CT

Sending you a calendar invite for Tuesday at 2pm CT for you, me, and Percy.

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
        subject: 'Re: Growth Engine -- MB Capital Removed + Multi-Location Scoring Live',
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
