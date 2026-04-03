import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
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

  // Check both message IDs for attachments
  const messageIds = ['19d4f1b9a3625558', '19d47d679842d264'];
  const outputDir = path.resolve(__dirname, '..', 'data', 'ryan-attachments');
  fs.mkdirSync(outputDir, { recursive: true });

  for (const msgId of messageIds) {
    console.log(`\nChecking message ${msgId}...`);
    const msg = await gmail.users.messages.get({ userId: 'me', id: msgId, format: 'full' });
    const parts = msg.data.payload?.parts || [];

    for (const part of flattenParts(parts)) {
      if (part.filename && part.body?.attachmentId) {
        console.log(`  Downloading: ${part.filename} (${part.body.size} bytes)`);
        const attachment = await gmail.users.messages.attachments.get({
          userId: 'me',
          messageId: msgId,
          id: part.body.attachmentId,
        });

        const data = attachment.data.data || '';
        const buffer = Buffer.from(data, 'base64url');
        const filePath = path.join(outputDir, part.filename);
        fs.writeFileSync(filePath, buffer);
        console.log(`    Saved to: ${filePath}`);
      }
    }
  }

  console.log('\nAll attachments downloaded.');
  console.log(`Output directory: ${outputDir}`);

  // List what we got
  const files = fs.readdirSync(outputDir);
  console.log(`\nFiles (${files.length}):`);
  for (const f of files) {
    const stats = fs.statSync(path.join(outputDir, f));
    console.log(`  ${f} (${(stats.size / 1024).toFixed(1)} KB)`);
  }
}

function flattenParts(parts: any[]): any[] {
  const result: any[] = [];
  for (const p of parts) {
    result.push(p);
    if (p.parts) {
      result.push(...flattenParts(p.parts));
    }
  }
  return result;
}

main().catch(e => { console.error(e.message); process.exit(1); });
