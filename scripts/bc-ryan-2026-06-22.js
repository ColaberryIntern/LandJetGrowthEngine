/**
 * bc-ryan-2026-06-22.js
 * Process Ryan's inbound comms:
 *   1. Archive the 2026-06-22 WhatsApp message to the LandJet message board.
 *   2. Archive the 2026-06-19 Grant Necker intro email to the message board.
 *   3. Create the todos that came out of them.
 *
 * BC_TOKEN env (advisor grant). Idempotent: message posts and todo creates
 * skip if a record with the same subject/title already exists.
 */
const BASE = 'https://3.basecampapi.com/3945211';
const P = 46699826;            // LandJet project
const BOARD = 9734054836;      // message board
const ALI = 17454835;
const L = { quoting: 10015474321, outreach: 10015474303, multi: 10015474343, platform: 10015474349, reporting: 10015474328 };
const TOKEN = (process.env.BC_TOKEN || '').replace(/^bearer\s+/i, '').trim();
if (!TOKEN) { console.error('BC_TOKEN not set'); process.exit(1); }
const H = (e = {}) => ({ Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'Colaberry Internal Tools (ali@colaberry.com)', Accept: 'application/json', ...e });
const get = async (p) => { const r = await fetch(`${BASE}${p}`, { headers: H() }); if (!r.ok) throw new Error(`GET ${p} ${r.status}`); return r.json(); };
const post = async (p, b) => { const r = await fetch(`${BASE}${p}`, { method: 'POST', headers: H({ 'Content-Type': 'application/json' }), body: JSON.stringify(b) }); if (!r.ok) throw new Error(`POST ${p} ${r.status}: ${(await r.text()).slice(0,200)}`); return r.status === 204 ? null : r.json(); };

// --- Message-board posts: [subject, html] ---
const MESSAGES = [
  ['INBOUND 2026-06-22: Ryan WhatsApp (outreach model, email-validation ask, proposal call)',
    `<div>
      <p><strong>From:</strong> Ryan Landry (WhatsApp) &nbsp; <strong>Date:</strong> 2026-06-22</p>
      <p>Three messages over the afternoon. Verbatim:</p>
      <p><strong>[1:09 PM]</strong><br>
      A. Yes I'm doing some of my own outreach as well. I'm a member of some investor groups where I'm doing outreach to as I get introductions.<br>
      B. I respond to everyone and will reach out to anyone from my main inbox, rlandry@landjet.com. If it helps we can move investor outreach to a different email, such as ryan@landjet.com but as of now I've always worked out of my main email.<br>
      C. If someone wants to book a trip I pull into an email with LJReservations@LandJet.com and the reservation team will take care of it. If a potential investor wants to chat I book a meeting with them directly. Because I don't really have a CRM outside of our booking software, BookRidesOnline, I just manage my outlook mail folders and inbox. In a perfect world we have one single operating system that connects booking software, QuickBooks for billing, outreach like what we are testing out now, which I'd love for each market to have their own person doing the same thing (minus investor outreach), as well as paid digital marketing campaigns connect to each markets Google, Meta and LinkedIn pages, but we aren't there yet.</p>
      <p><strong>[1:10 PM]</strong><br>
      I had a handful of undeliverable emails today. People will always leave jobs so I expect that. Is there a way to have an email validation tool make sure that the emails are legitimate before they get sent anything?</p>
      <p><strong>[2:46 PM]</strong><br>
      Also could you and I connect at some point to talk about the proposal? I know you and Percy stayed back. I'm going to be in Florida for a conference wed-Fri and will not be able to make our Friday. Would you have any time tomorrow?</p>
      <hr>
      <p><strong>Resulting actions:</strong></p>
      <ul>
        <li><strong>Email validation (built 2026-06-22):</strong> pre-send guard wired into the outreach send path (format + MX, with DNS timeout + transient fail-open); proactive pool sweep script added; 16 unit tests + tsc clean. See the [Platform] todo. Mailbox-level verification (the "person left the job" case) needs a paid validator, raised as a decision below.</li>
        <li><strong>Proposal call:</strong> [Ali] todo to find time Tuesday 2026-06-23 (Ryan is in FL Wed-Fri, cannot make the recurring Friday call).</li>
        <li><strong>Investor-outreach email split:</strong> [Ali] decision todo on whether to move investor outreach to ryan@landjet.com vs staying on rlandry@.</li>
        <li><strong>Context noted:</strong> Ryan runs his own investor outreach from rlandry@; bookings funnel to LJReservations@; long-term vision is one operating system (booking + QuickBooks + per-market outreach + paid digital).</li>
      </ul>
    </div>`],
  ['INBOUND 2026-06-19: Ryan intro of Grant Necker (Iowa Regional Representative)',
    `<div>
      <p><strong>From:</strong> Ryan Landry (email, reply on the Friday briefing thread) &nbsp; <strong>Date:</strong> 2026-06-19</p>
      <p>Ryan introduced and CC'd a new regional rep. Verbatim:</p>
      <blockquote>Grant Necker (also CC'd)<br>Gnecker@landjet.com<br>563-940-1746<br>Iowa Regional Representative</blockquote>
      <p><strong>Status:</strong> Grant's account was already provisioned on the 2026-06-20 Percy call (login gnecker@landjet.com, Iowa scope, admin; M365 mailbox confirmed readable; see completed todo #10016294654). <strong>Open item:</strong> Percy referred to the Iowa rep as "Brandon" on the 6/20 call while Ryan's email says "Grant Necker", both pointing to gnecker@landjet.com. Confirm the correct first name before any outbound uses it.</p>
    </div>`],
];

// --- Todos: [listId, due, title, bodyHtml] ---
const TODOS = [
  [L.platform, '2026-06-22', '[Platform] Pre-send email validation guard (format + MX) so the engine never sends to dead addresses',
    `Source: Ryan WhatsApp 2026-06-22 ("a handful of undeliverable emails... an email validation tool make sure the emails are legitimate before they get sent anything"). BUILT 2026-06-22: emailValidationService hardened (DNS timeout + transient-vs-definitive classification) and wired into sendOutreachEmail as a third guard (malformed/no-MX never transmit; transient DNS failures fail open). New validateActiveLeadEmails.ts sweep cleans the active pool (dry-run default, APPLY=1 blocks via blockLead). Verified: tsc clean + 16 unit tests. PENDING: deploy to prod, then run the sweep dry-run and review counts before APPLY. Mailbox-level "person left the job" detection is NOT covered by DNS validation (see paid-validator decision todo).`],
  [L.outreach, '2026-06-23', '[Ali] Find time Tuesday 6/23 to talk proposal with Ryan (he is in FL Wed-Fri, cannot make Friday)',
    `Source: Ryan WhatsApp 2026-06-22, 2:46 PM. Ryan wants to connect on the proposal; he is at a Florida conference Wed-Fri and cannot make the recurring Friday call. Propose a Tuesday window and send the invite. The recurring Friday sync resumes the following week.`],
  [L.platform, '2026-06-27', '[Decision] Mailbox-level email verification (paid validator) vs DNS-only + bounce backstop',
    `Source: Ryan WhatsApp 2026-06-22. The shipped DNS validation (format + MX) stops malformed addresses and dead domains, but cannot detect a valid domain with a dead mailbox (a person who left the job, which is exactly the bounce type Ryan described). Catching that pre-send needs a paid validator (ZeroBounce / NeverBounce) -- a paid external dependency, which is a governance escalation, so it is a decision for Ali/Ryan, not adopted unilaterally. Current backstop: the post-send bounceProcessor auto-blocks a lead on first bounce so it is never emailed twice. Decision: adopt a paid validator (cost vs bounce volume) or rely on DNS + bounce backstop.`],
  [L.outreach, '2026-06-26', '[Decision] Split investor outreach to ryan@landjet.com, or keep on rlandry@?',
    `Source: Ryan WhatsApp 2026-06-22, item B. Ryan offered: "we can move investor outreach to a different email, such as ryan@landjet.com but as of now I've always worked out of my main email." Decide whether to separate investor-outreach sends/replies onto ryan@landjet.com (cleaner threading/attribution, but needs the mailbox provisioned + added to ALLOWED_SENDERS + signature) or keep everything on rlandry@. Note: ryan@ is referenced in the sender map but is NOT yet in ALLOWED_SENDERS, so a send from it would be blocked by the sender guard until provisioned.`],
];

(async () => {
  console.log('=== BC: Ryan 2026-06-22 intake ===');

  // Idempotent message-board posts
  const existing = await get(`/buckets/${P}/message_boards/${BOARD}/messages.json`);
  const subjects = new Set((existing || []).map((m) => m.subject));
  for (const [subject, content] of MESSAGES) {
    if (subjects.has(subject)) { console.log(`skip message (exists): ${subject}`); continue; }
    const m = await post(`/buckets/${P}/message_boards/${BOARD}/messages.json`, { subject, content, status: 'active' });
    console.log(`posted message #${m.id}: ${subject}`);
  }

  // Idempotent todo creates
  const titleCache = {};
  for (const id of new Set(TODOS.map((t) => t[0]))) {
    const todos = await get(`/buckets/${P}/todolists/${id}/todos.json`);
    titleCache[id] = new Set(todos.map((t) => t.title));
  }
  for (const [list, due, title, body] of TODOS) {
    if (titleCache[list].has(title)) { console.log(`skip todo (exists): ${title}`); continue; }
    const t = await post(`/buckets/${P}/todolists/${list}/todos.json`, { content: title, description: `<div>${body}</div>`, due_on: due, assignee_ids: [ALI] });
    console.log(`created todo #${t.id} (due ${due}): ${title}`);
  }

  console.log('=== DONE ===');
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
