require('dotenv').config();

const body = `Percy,

Quick request. We need to add a website visitor tracking script to landjet.com. This is Apollo's tracking pixel that identifies companies visiting the site.

All you need to do is add this script to the site, right before the closing </head> tag in the main layout template:

<script>function initApollo(){var n=Math.random().toString(36).substring(7),o=document.createElement("script");o.src="https://assets.apollo.io/micro/website-tracker/tracker.iife.js?nocache="+n,o.async=!0,o.defer=!0,o.onload=function(){window.trackingFunctions.onLoad({appId:"69e86f8856e65b000d77b464"})},document.head.appendChild(o)}initApollo();</script>

In Craft CMS, the main layout template is usually at templates/_layout.html or templates/_base.html. Just paste the script before </head>.

If you use Google Tag Manager, you can add it there instead as a Custom HTML tag triggered on All Pages.

Once added, we can verify it is working from Apollo's dashboard.

Thank you,
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
        subject: 'Website Tracking Script for landjet.com',
        body: { contentType: 'Text', content: body },
        toRecipients: [{ emailAddress: { address: 'pkapadia@landjet.com' } }],
        ccRecipients: [
          { emailAddress: { address: 'rmlandry29@gmail.com' } },
          { emailAddress: { address: 'rlandry@landjet.com' } },
          { emailAddress: { address: 'ali@colaberry.com' } },
        ],
      },
    }),
  });

  if (sendResp.status === 202) {
    console.log('EMAIL SENT to pkapadia@landjet.com (CC: Ryan + Ali)');
  } else {
    const err = await sendResp.json().catch(() => ({}));
    console.log('Failed:', sendResp.status, JSON.stringify(err));
  }
}

send().catch(e => console.error(e.message));
