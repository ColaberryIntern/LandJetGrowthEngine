/**
 * Gmail OAuth Setup Script (Simple Version)
 *
 * Usage:
 *   npx ts-node scripts/setup-gmail-oauth.ts
 *
 * This script will:
 * 1. Start a tiny local server on port 3456
 * 2. Print a URL for you to open in your browser
 * 3. After you authorize, capture the token automatically
 * 4. Save the refresh token to your .env file
 */

import { google } from 'googleapis';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

const envPath = path.resolve(__dirname, '..', '.env');
dotenv.config({ path: envPath });

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'];
const PORT = 3456;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

async function main() {
  console.log('\n=== Gmail OAuth Setup ===\n');

  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('ERROR: Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env first');
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  // Start local server FIRST, then show URL
  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url || !req.url.startsWith('/callback')) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Gmail OAuth server is running. Complete authorization in your browser.');
        return;
      }

      const urlObj = new URL(req.url, `http://localhost:${PORT}`);
      const code = urlObj.searchParams.get('code');
      const error = urlObj.searchParams.get('error');

      if (error) {
        console.error(`\nOAuth error: ${error}`);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<html><body><h2>OAuth Error: ${error}</h2><p>Please try again.</p></body></html>`);
        server.close();
        process.exit(1);
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing authorization code');
        return;
      }

      console.log('Authorization code received, exchanging for tokens...');

      const { tokens } = await oauth2Client.getToken(code);

      if (!tokens.refresh_token) {
        console.error('\nNo refresh token received. Go to https://myaccount.google.com/permissions');
        console.error('Remove the "Landjet" app, then run this script again.\n');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<html><body>
          <h2 style="color:red">No Refresh Token</h2>
          <p>Go to <a href="https://myaccount.google.com/permissions">Google Permissions</a>, remove this app, then try again.</p>
        </body></html>`);
        server.close();
        process.exit(1);
        return;
      }

      // Verify it works
      oauth2Client.setCredentials(tokens);
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const profile = await gmail.users.getProfile({ userId: 'me' });

      // Save to .env
      let envContent = fs.readFileSync(envPath, 'utf-8');
      envContent = envContent.replace(
        /GMAIL_REFRESH_TOKEN=.*/,
        `GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`,
      );
      fs.writeFileSync(envPath, envContent);

      console.log(`\nAuthenticated as: ${profile.data.emailAddress}`);
      console.log('Refresh token saved to .env');
      console.log('\nSetup complete! You can close the browser tab.\n');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html><body style="font-family:sans-serif;padding:40px;text-align:center">
        <h2 style="color:#27ae60">Gmail OAuth Setup Complete!</h2>
        <p>Authenticated as: <strong>${profile.data.emailAddress}</strong></p>
        <p>Refresh token saved. You can close this tab.</p>
      </body></html>`);

      server.close();
      process.exit(0);
    } catch (err: any) {
      console.error('Error:', err.message);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Error: ${err.message}`);
      server.close();
      process.exit(1);
    }
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Local server listening on port ${PORT}`);
    console.log(`\nOpen this URL in your browser:\n`);
    console.log(`  ${authUrl}\n`);
    console.log('Waiting for authorization...\n');
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Kill the process using it and try again.`);
    } else {
      console.error('Server error:', err.message);
    }
    process.exit(1);
  });

  // Timeout after 5 minutes
  setTimeout(() => {
    console.error('\nTimed out after 5 minutes. Run the script again.');
    server.close();
    process.exit(1);
  }, 5 * 60 * 1000);
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
