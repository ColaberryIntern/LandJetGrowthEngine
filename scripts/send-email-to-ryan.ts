import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { google } from 'googleapis';

async function main() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI,
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const profile = await gmail.users.getProfile({ userId: 'me' });
  console.log(`Sending as: ${profile.data.emailAddress}`);

  const subject = 'Quick question on email sending + demo update';
  const body = `Ryan,

We're getting very close to having the system ready for a live demo. Wanted to give you a quick update and ask one question.

The outreach engine is built. Your contacts are imported, classified by vertical (manufacturing, insurance, healthcare, etc.), and organized into campaigns with AI-generated messaging tailored to each industry. The system generates drafts, lets you review them, and is ready to send on your approval.

The one thing I need from you to make it fully live: how do you want emails sent?

You mentioned using SendGrid for newsletters. I can connect to either SendGrid or your Gmail account for outreach. Each has tradeoffs:

- SendGrid: better for volume, has open/click tracking built in, protects your personal inbox reputation
- Gmail: emails come directly from your inbox, feels more personal, but has daily send limits (~500/day)

Which would you prefer? If SendGrid, I just need the API key. If Gmail, I'll need to connect to your account (we're currently connected to ours for monitoring, but sending would need to come from you).

I'll have the demo ready for you this week.

Ali`;

  const rawEmail = [
    `To: rmlandry29@gmail.com`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    '',
    body,
  ].join('\r\n');

  const encodedEmail = Buffer.from(rawEmail)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedEmail },
  });

  console.log(`Email sent! Message ID: ${result.data.id}`);
  process.exit(0);
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });
