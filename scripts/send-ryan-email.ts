/**
 * Send email to Ryan via Gmail API and post update to Basecamp.
 */
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

  // Verify we're authenticated
  const profile = await gmail.users.getProfile({ userId: 'me' });
  console.log(`Sending as: ${profile.data.emailAddress}`);

  const to = 'rmlandry29@gmail.com';
  const subject = 'Getting Started + Basecamp Project Setup';
  const body = `Ryan,

Hope you're doing well. Wanted to give you a quick update on where things stand and introduce the project hub we've set up for you.

What I'm working on now:

1. I've gone through your N8N account and reviewed David's workflows. I can see what was built and where things stalled out. We're going to carry over the parts that worked and rebuild the rest on a more flexible stack.

2. I'm building out the outreach system using the ICPs, sales playbooks, and competitive analysis you shared in the Dropbox folder. The investor deck and strategic partnerships doc are especially helpful for understanding who we're targeting across all three categories (customer, franchisee, investor).

3. First priority is getting the investor outreach and customer acquisition pipelines running for LandJet. Once those are proven out, we'll extend to MB Capital Ventures and Broadhill.

Basecamp Project Hub:

I've set up a Basecamp project called "LandJet Growth Engine" where you can track everything we're doing in real time. You should already have access. Here's how it works:

- Message Board - This is where we post updates, summaries from our calls, and any decisions that get made. You can comment directly on any post if you have questions or want to weigh in.

- To-dos - Action items are tracked here with assignees and status. You'll be able to see what's in progress, what's completed, and what's coming up next.

- Docs & Files - I've uploaded the Build Guide (full requirements doc), your N8N workflows link, and the Dropbox folder link here for reference. Any new documents will go here as well.

You'll get notifications when things are posted or updated. If something needs your input, I'll tag you directly. You can reply to any notification by email or jump into Basecamp to comment.

Here's the direct link: https://3.basecamp.com/3945211/projects/46699826

What I need from you (when you get a chance):

- The 4,000 past customer list you mentioned on our call. That data will be key for the re-engagement campaigns.

- Confirmation on which verticals you want us to target first (healthcare, logistics, entertainment, or others from your playbook).

I'll have the first pipeline ready for you to review within the week. In the meantime, feel free to poke around Basecamp and let me know if you have any questions.

Talk soon,

Ali Muwwakkil
Managing Director
Data Scientist | Data Analytics Architect
200 Chisholm Place, Suite 200 Plano, TX 75075
Email: ali@colaberry.com
Web: www.colaberry.com`;

  // Build the raw email
  const emailLines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    '',
    body,
  ];
  const rawEmail = emailLines.join('\r\n');
  const encodedEmail = Buffer.from(rawEmail)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  // Send via Gmail API
  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedEmail },
  });

  console.log(`Email sent! Message ID: ${result.data.id}`);

  // Now post to Basecamp
  const basecampToken = process.env.BASECAMP_ACCESS_TOKEN;
  const basecampUrl = `https://3.basecampapi.com/3945211/buckets/46699826/message_boards/9734054836/messages.json`;

  const basecampContent = `<h2>Project Kickoff Update - Sent to Ryan</h2>

<p>Email sent to Ryan Landry on ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} with the following update:</p>

<hr>

<h3>What We're Working On</h3>
<ol>
<li><strong>N8N Review:</strong> Reviewed David Vela's workflows in Ryan's N8N account. Identified what worked and where things stalled. Carrying over successful components, rebuilding the rest on a more flexible stack.</li>
<li><strong>Outreach System Build:</strong> Using Ryan's ICPs, sales playbooks, competitive analysis, investor deck, and strategic partnerships doc from the Dropbox folder to build targeting across all three categories (customer, franchisee, investor).</li>
<li><strong>Priority Order:</strong> LandJet investor outreach and customer acquisition pipelines first. Then extend to MB Capital Ventures and Broadhill once proven.</li>
</ol>

<h3>Basecamp Access</h3>
<p>Ryan has been given access to this Basecamp project as a client. He can:</p>
<ul>
<li>View and comment on Message Board posts</li>
<li>Track To-dos and their status</li>
<li>Access Docs & Files (Build Guide, N8N link, Dropbox link)</li>
<li>Reply to notifications via email or directly in Basecamp</li>
</ul>

<h3>Outstanding Items from Ryan</h3>
<ul>
<li>The 4,000 past customer list (needed for re-engagement campaigns)</li>
<li>Confirmation on which verticals to target first (healthcare, logistics, entertainment, or others)</li>
</ul>

<h3>Timeline</h3>
<p>First pipeline ready for Ryan's review within the week.</p>`;

  const basecampResponse = await fetch(basecampUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${basecampToken}`,
      'Content-Type': 'application/json',
      'User-Agent': 'LandJet Growth Engine (support@colaberry.com)',
    },
    body: JSON.stringify({
      subject: 'Project Kickoff Update - Email Sent to Ryan',
      content: basecampContent,
      status: 'active',
    }),
  });

  const basecampResult = await basecampResponse.json() as any;
  console.log(`Basecamp post created! ID: ${basecampResult.id}`);

  console.log('\nDone. Email sent and Basecamp updated.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
