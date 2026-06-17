#!/usr/bin/env node
/**
 * MINIMAL WORKING EXAMPLE - send one email via the Mandrill kit.
 *
 * Drop this file at: <your-project>/backend/src/scripts/sampleSend.js
 *
 * Source of truth: Ali Personal BC ticket 9981757450.
 *
 * Run:
 *   MANDRILL_API_KEY=... BASECAMP_ACCESS_TOKEN=... node backend/src/scripts/sampleSend.js
 *
 * What it does:
 *   1. Imports the helper + signature
 *   2. Constructs a tiny HTML + text body
 *   3. Appends the branded signature to both
 *   4. Sends via sendWithBcAttach attached to a known BC ticket
 *
 * Before running:
 *   - Replace TICKET_ID with a real BC todo id you own
 *   - Replace TO with the recipient (use your own email for first test)
 */

const { sendWithBcAttach } = require('./lib/sendWithBcAttach');
const { SIG_HTML, SIG_TEXT } = require('./lib/emailSignature');

const TICKET_ID = 9981757450;      // CHANGE ME: BC todo id this email belongs to
const TO = 'ali@colaberry.com';    // CHANGE ME: recipient

const HTML = `<div style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.6; max-width: 720px;">
<p>This is a smoke test of the Mandrill kit installed in this project.</p>
<p>If you receive this, the kit is wired correctly: helper imports work, preflight passes, Mandrill SMTP delivers, BC ticket attach succeeds.</p>
</div>`;

const TEXT = `This is a smoke test of the Mandrill kit installed in this project.

If you receive this, the kit is wired correctly: helper imports work, preflight passes, Mandrill SMTP delivers, BC ticket attach succeeds.`;

(async () => {
  if (!process.env.MANDRILL_API_KEY) throw new Error('MANDRILL_API_KEY required');
  if (!process.env.BASECAMP_ACCESS_TOKEN) throw new Error('BASECAMP_ACCESS_TOKEN required');

  const result = await sendWithBcAttach({
    ticketId: TICKET_ID,
    to: TO,
    bcc: 'ali@colaberry.com',
    subject: 'Mandrill kit smoke test',
    html: HTML + SIG_HTML,
    text: TEXT + '\n\n' + SIG_TEXT,
    bcSummary: '<p>Smoke test from the portable Mandrill kit. Verifies install is correct.</p>',
  });

  console.log('Sent.');
  console.log('Mandrill ID:', result.mandrillId);
  console.log('BC comment :', result.commentUrl);
})().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
