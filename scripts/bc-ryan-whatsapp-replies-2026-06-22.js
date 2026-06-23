/**
 * bc-ryan-whatsapp-replies-2026-06-22.js
 * Archive Ryan's 2026-06-22 afternoon WhatsApp replies and record the decisions:
 *   - Meeting confirmed (12:30 PM CST Tue 6/23).
 *   - Email-validation gap: Ryan chose the free auto-block, NOT a paid validator
 *     -> close decision todo #10022194532.
 *   - Investor-outreach email split: still pending Ryan -> comment, leave open.
 *
 * BC_TOKEN env (advisor grant). Idempotent: message post skips if subject exists;
 * completion is a no-op if already complete.
 */
const BASE = 'https://3.basecampapi.com/3945211', P = 46699826, BOARD = 9734054836;
const T_PAID = 10022194532, T_SPLIT = 10022194556;
const T = (process.env.BC_TOKEN || '').replace(/^bearer\s+/i, '').trim();
if (!T) { console.error('BC_TOKEN not set'); process.exit(1); }
const H = (e = {}) => ({ Authorization: `Bearer ${T}`, 'User-Agent': 'Colaberry Internal Tools (ali@colaberry.com)', Accept: 'application/json', ...e });
const get = async (p) => { const r = await fetch(`${BASE}${p}`, { headers: H() }); if (!r.ok) throw new Error(`GET ${p} ${r.status}`); return r.json(); };
const post = async (p, b) => { const r = await fetch(`${BASE}${p}`, { method: 'POST', headers: H(b ? { 'Content-Type': 'application/json' } : {}), body: b ? JSON.stringify(b) : undefined }); if (!r.ok) throw new Error(`POST ${p} ${r.status}: ${(await r.text()).slice(0, 160)}`); return r.status === 204 ? null : r.json(); };

const MSG_SUBJECT = 'INBOUND 2026-06-22: Ryan WhatsApp replies (meeting confirmed, validator decision, outreach model)';
const MSG_BODY = `<div>
  <p><strong>From:</strong> Ryan Landry (WhatsApp) &nbsp; <strong>Date:</strong> 2026-06-22 afternoon. Follow-on to the morning thread already archived.</p>
  <p><strong>Meeting:</strong> Ali offered "after 12 and excluding 2-3:30" Tuesday 6/23. Ryan: "12 or 12:30 are perfect for me." Ali sending an invite for <strong>12:30 PM CST Tuesday 2026-06-23</strong> to talk proposal (Ryan is in FL Wed-Fri, skipping the recurring Friday call this week).</p>
  <p><strong>Email-validation gap decision:</strong> Ali laid out the one case DNS cannot catch (valid domain, dead mailbox = person left the job) with two options: a paid verification service, or rely on the existing first-bounce auto-block. Ryan chose the auto-block: <em>"thanks. the second option is fine. i don't mind someone else at the company getting the emails."</em> So NO paid validator for now; we rely on the free post-send bounce auto-block. Revisit only if bounces stay noticeable.</p>
  <p><strong>Outreach model (from the morning message, for the record):</strong> Ryan runs his own investor outreach from rlandry@; bookings funnel to LJReservations@; no CRM outside BookRidesOnline; long-term vision is one operating system (booking + QuickBooks + per-market outreach + paid digital). Open question still with Ryan: split investor outreach onto ryan@landjet.com vs keep on rlandry@.</p>
</div>`;

const PAID_COMMENT = `<div><strong>Decided 2026-06-22 (Ryan, WhatsApp).</strong> Ryan chose the FREE auto-block, not a paid validator: "the second option is fine. i don't mind someone else at the company getting the emails." So we rely on the post-send bounceProcessor (auto-blocks a lead on first bounce) for the dead-mailbox case. No paid verification service adopted. Revisit only if bounce volume stays noticeable.</div>`;
const SPLIT_COMMENT = `<div><strong>2026-06-22:</strong> Raised with Ryan on WhatsApp; awaiting his pick. Keep all outreach on rlandry@, or set up ryan@landjet.com for investor outreach (needs the mailbox provisioned + added to ALLOWED_SENDERS + signature before any send from it). No action until Ryan answers.</div>`;

(async () => {
  const existing = await get(`/buckets/${P}/message_boards/${BOARD}/messages.json`);
  if ((existing || []).some((m) => m.subject === MSG_SUBJECT)) { console.log('skip message (exists)'); }
  else { const m = await post(`/buckets/${P}/message_boards/${BOARD}/messages.json`, { subject: MSG_SUBJECT, content: MSG_BODY, status: 'active' }); console.log('posted message #' + m.id); }

  await post(`/buckets/${P}/recordings/${T_PAID}/comments.json`, { content: PAID_COMMENT });
  const tp = await get(`/buckets/${P}/todos/${T_PAID}.json`);
  if (!tp.completed) { await post(`/buckets/${P}/todos/${T_PAID}/completion.json`); console.log('paid-validator todo completed'); }
  else console.log('paid-validator todo already complete');

  await post(`/buckets/${P}/recordings/${T_SPLIT}/comments.json`, { content: SPLIT_COMMENT });
  console.log('investor-split commented (left open)');
  console.log('DONE');
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
