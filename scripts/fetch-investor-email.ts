import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { google, gmail_v1 } from 'googleapis';

async function main() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI,
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const list = await gmail.users.messages.list({
    userId: 'me',
    q: 'subject:"investor outreach"',
    maxResults: 5,
  });

  const msgIds = list.data.messages || [];
  console.log(`Found ${msgIds.length} messages\n`);

  if (msgIds.length === 0) {
    console.log('No messages found with exact subject. Trying broader search...');
    const list2 = await gmail.users.messages.list({ userId: 'me', q: 'investor', maxResults: 10 });
    const msgs2 = list2.data.messages || [];
    console.log(`Broader "investor" search: ${msgs2.length} messages`);
    for (const m of msgs2) {
      if (!m.id) continue;
      const full = await gmail.users.messages.get({ userId: 'me', id: m.id });
      const subj = (full.data.payload?.headers || []).find((h: any) => h.name === 'Subject')?.value || '';
      const from = (full.data.payload?.headers || []).find((h: any) => h.name === 'From')?.value || '';
      console.log(`  ${m.id}: "${subj}" from ${from}`);
    }
    return;
  }

  const outputDir = path.resolve(__dirname, '..', 'data', 'investor-targets');
  fs.mkdirSync(outputDir, { recursive: true });

  for (const msgRef of msgIds) {
    if (!msgRef.id) continue;
    const full = await gmail.users.messages.get({ userId: 'me', id: msgRef.id, format: 'full' });
    const headers = full.data.payload?.headers || [];
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
    const from = headers.find((h: any) => h.name === 'From')?.value || '';
    const date = headers.find((h: any) => h.name === 'Date')?.value || '';

    console.log(`=== ${subject} ===`);
    console.log(`From: ${from}`);
    console.log(`Date: ${date}`);

    function flattenParts(parts: any[]): any[] {
      const result: any[] = [];
      for (const p of parts) {
        result.push(p);
        if (p.parts) result.push(...flattenParts(p.parts));
      }
      return result;
    }

    const allParts = flattenParts(full.data.payload?.parts || []);
    for (const part of allParts) {
      if (part.filename && part.body?.attachmentId) {
        console.log(`  Downloading: ${part.filename} (${part.body.size} bytes)`);
        const att = await gmail.users.messages.attachments.get({
          userId: 'me',
          messageId: msgRef.id,
          id: part.body.attachmentId,
        });
        const data = att.data.data || '';
        const buffer = Buffer.from(data, 'base64url');
        const filePath = path.join(outputDir, part.filename);
        fs.writeFileSync(filePath, buffer);
        console.log(`    Saved: ${filePath}`);
      }
    }

    // Get body preview
    function getBody(payload: any): string {
      if (payload.body?.data) return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
      if (payload.parts) {
        const text = payload.parts.find((p: any) => p.mimeType === 'text/plain');
        if (text?.body?.data) return Buffer.from(text.body.data, 'base64url').toString('utf-8');
      }
      return '';
    }
    const body = getBody(full.data.payload);
    if (body) console.log(`\nBody: ${body.substring(0, 500)}`);
  }

  console.log('\n=== Files Downloaded ===');
  if (fs.existsSync(outputDir)) {
    const files = fs.readdirSync(outputDir);
    if (files.length === 0) console.log('  (no files)');
    for (const f of files) {
      const stats = fs.statSync(path.join(outputDir, f));
      console.log(`  ${f} (${(stats.size / 1024).toFixed(1)} KB)`);
    }
  }
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });
