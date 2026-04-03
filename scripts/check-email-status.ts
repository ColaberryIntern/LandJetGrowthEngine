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

  // Get the sent message
  const msg = await gmail.users.messages.get({
    userId: 'me',
    id: '19d40b65b39ff543',
    format: 'metadata',
    metadataHeaders: ['Subject', 'To', 'Date'],
  });

  console.log('=== Sent Email Status ===');
  for (const h of msg.data.payload!.headers || []) {
    console.log(`${h.name}: ${h.value}`);
  }
  console.log(`Labels: ${(msg.data.labelIds || []).join(', ')}`);
  console.log(`Thread ID: ${msg.data.threadId}`);

  // Check for replies in thread
  const thread = await gmail.users.threads.get({
    userId: 'me',
    id: msg.data.threadId!,
    format: 'metadata',
    metadataHeaders: ['Subject', 'From', 'Date'],
  });

  const messages = thread.data.messages || [];
  console.log(`\n=== Thread: ${messages.length} message(s) ===`);
  for (const m of messages) {
    const from = (m.payload!.headers || []).find(h => h.name === 'From')?.value || '?';
    const date = (m.payload!.headers || []).find(h => h.name === 'Date')?.value || '?';
    console.log(`  From: ${from}`);
    console.log(`  Date: ${date}`);
    console.log(`  Labels: ${(m.labelIds || []).join(', ')}`);
    console.log('');
  }

  if (messages.length > 1) {
    console.log('Ryan has replied!');
  } else {
    console.log('No reply yet.');
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
