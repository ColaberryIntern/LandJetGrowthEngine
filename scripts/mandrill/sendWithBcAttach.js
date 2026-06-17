/**
 * sendWithBcAttach - canonical helper for outbound Ali Personal emails.
 *
 * PORTABLE VERSION (for installation in any Claude Code project via the
 * Mandrill Email Setup BC ticket at:
 *   https://app.basecamp.com/3945211/buckets/7463955/todos/9981757450
 *
 * Drop this file at: <your-project>/backend/src/scripts/lib/sendWithBcAttach.js
 *
 * Dependencies (install in your project):
 *   npm install nodemailer
 *
 * Requires env vars at runtime:
 *   MANDRILL_API_KEY
 *   BASECAMP_ACCESS_TOKEN  (pull both from prod container; see SKILL.md)
 *
 * Operating doctrine enforced (per Ali's memory):
 * every outbound email + produced document is attached to its originating BC ticket.
 *
 * - REQUIRES a ticketId. Throws if omitted.
 * - Sends the email via Mandrill SMTP.
 * - Uploads `vaultAttachments` to the project's "CB Context Dossiers" vault folder.
 * - Posts a structured comment on the ticket with subject, recipients, Mandrill ID,
 *   summary, and links to the vault uploads.
 * - Returns { mandrillId, commentUrl, vaultUploads }.
 *
 * Usage:
 *
 *   const { sendWithBcAttach } = require('./lib/sendWithBcAttach');
 *
 *   const result = await sendWithBcAttach({
 *     ticketId: 9981757450,            // REQUIRED. BC todo id this email belongs to.
 *     bucketId: 7463955,               // OPTIONAL. Defaults to Ali Personal (7463955).
 *     to: 'recipient@example.com',
 *     cc: ['ram@colaberry.com'],
 *     bcc: ['ali@colaberry.com'],
 *     subject: 'Subject line',
 *     html: '<html>...</html>',
 *     text: '...',                     // plaintext fallback
 *     attachments: [                   // nodemailer-style email attachments
 *       { filename: 'foo.pdf', content: buf, contentType: 'application/pdf' },
 *     ],
 *     vaultAttachments: [              // OPTIONAL. Files ALSO uploaded to BC Vault.
 *       { filename: 'foo.pdf', content: buf, contentType: 'application/pdf',
 *         vaultDescription: 'Dossier synthesized 2026-06-09' },
 *     ],
 *     bcSummary: '<p>Short HTML summary of what the email contains.</p>',
 *   });
 */

const nodemailer = require('nodemailer');
const { validateBeforeSend } = require('./mandrillPreflight');

const BC_ACCOUNT = '3945211';
const BC_BASE = `https://3.basecampapi.com/${BC_ACCOUNT}`;
const DEFAULT_BUCKET = 7463955; // Ali Personal
const VAULT_FOLDER_NAME = 'CB Context Dossiers';

function bcAuthHeaders(extra = {}) {
  const token = (process.env.BASECAMP_ACCESS_TOKEN || '').replace(/^bearer\s+/i, '').trim();
  if (!token) throw new Error('BASECAMP_ACCESS_TOKEN not set (or expired - refresh from CCPP.Basecamp_AuthInfo)');
  return { Authorization: `Bearer ${token}`, 'User-Agent': 'Colaberry sendWithBcAttach', Accept: 'application/json', ...extra };
}

function strip(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }
function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

async function bcPost(p, body, extraHeaders = {}) {
  const r = await fetch(`${BC_BASE}${p}`, {
    method: 'POST',
    headers: bcAuthHeaders({ 'Content-Type': 'application/json', ...extraHeaders }),
    body: typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${p} -> ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
async function bcGet(p) {
  const r = await fetch(`${BC_BASE}${p}`, { headers: bcAuthHeaders() });
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function ensureVaultFolder(bucketId) {
  const proj = await bcGet(`/projects/${bucketId}.json`);
  const root = (proj.dock || []).find((d) => d.name === 'vault');
  if (!root) throw new Error(`bucket ${bucketId} has no vault dock`);
  const subs = await bcGet(`/buckets/${bucketId}/vaults/${root.id}/vaults.json`);
  let folder = Array.isArray(subs) ? subs.find((v) => v.title === VAULT_FOLDER_NAME) : null;
  if (!folder) {
    folder = await bcPost(`/buckets/${bucketId}/vaults/${root.id}/vaults.json`, { title: VAULT_FOLDER_NAME });
  }
  return folder;
}

async function uploadToVault({ bucketId, filename, content, contentType, vaultDescription }) {
  const att = await fetch(`${BC_BASE}/attachments.json?name=${encodeURIComponent(filename)}`, {
    method: 'POST',
    headers: bcAuthHeaders({ 'Content-Type': contentType }),
    body: content,
  });
  if (!att.ok) throw new Error(`attachments.json ${att.status}: ${await att.text()}`);
  const sgid = (await att.json()).attachable_sgid;
  const folder = await ensureVaultFolder(bucketId);
  const upload = await bcPost(`/buckets/${bucketId}/vaults/${folder.id}/uploads.json`, {
    attachable_sgid: sgid,
    base_name: filename.replace(/\.[^.]+$/, ''),
    description: vaultDescription || `Attached via sendWithBcAttach on ${new Date().toISOString().slice(0, 10)}`,
  });
  return { sgid, filename, vaultUrl: upload.app_url, uploadId: upload.id };
}

async function postTicketComment({ bucketId, ticketId, html }) {
  const c = await bcPost(`/buckets/${bucketId}/recordings/${ticketId}/comments.json`, { content: html });
  return c;
}

async function sendWithBcAttach(opts = {}) {
  const {
    bucketId = DEFAULT_BUCKET,
    ticketId,
    from = '"Ali Muwwakkil" <ali@colaberry.com>',
    to, cc, bcc, replyTo = 'ali@colaberry.com',
    subject, html, text, attachments = [],
    vaultAttachments = [],
    bcSummary,
    headers,
    mandrillTrack = 'opens,clicks',
  } = opts;

  if (!ticketId) {
    throw new Error(`sendWithBcAttach: ticketId is REQUIRED. Every outbound Ali Personal email must be attached to an originating BC ticket per the operating doctrine. If this email genuinely does not belong to a ticket, use raw nodemailer.`);
  }
  if (!to) throw new Error('sendWithBcAttach: `to` is required.');
  if (!subject) throw new Error('sendWithBcAttach: `subject` is required.');
  if (!html && !text) throw new Error('sendWithBcAttach: at least one of `html` or `text` is required.');

  const cleanedHtml = html ? strip(html) : undefined;
  const cleanedText = text ? strip(text) : undefined;

  validateBeforeSend(cleanedHtml || '', cleanedText || '');

  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const sent = await transport.sendMail({
    from, to, cc, bcc, replyTo, subject,
    text: cleanedText, html: cleanedHtml, attachments,
    headers: { 'X-MC-Track': mandrillTrack, 'X-MC-AutoText': 'false', ...(headers || {}) },
  });

  const vaultUploads = [];
  for (const v of vaultAttachments) {
    const u = await uploadToVault({ bucketId, ...v });
    vaultUploads.push(u);
  }

  const recipientStr = [
    to && `<strong>To:</strong> ${escapeHtml([].concat(to).join(', '))}`,
    cc && cc.length && `<strong>Cc:</strong> ${escapeHtml([].concat(cc).join(', '))}`,
    bcc && bcc.length && `<strong>Bcc:</strong> ${escapeHtml([].concat(bcc).join(', '))}`,
  ].filter(Boolean).join(' &middot; ');
  const summary = bcSummary || `<div style="font-size:13px;color:#475569">Email sent. No additional summary provided.</div>`;
  const vaultBlock = vaultUploads.length ? `<div style="margin-top:14px"><strong>Produced documents (durable in BC Vault):</strong></div>
${vaultUploads.map((u) => `<div style="margin-top:6px"><a href="${u.vaultUrl}">${escapeHtml(u.filename)}</a> <bc-attachment sgid="${u.sgid}" caption="${escapeHtml(u.filename)}"></bc-attachment></div>`).join('')}` : '';

  const commentHtml = `<div style="background:#fef9e7;border-left:5px solid #d4a017;padding:14px 18px;border-radius:0 6px 6px 0">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#78350f;font-weight:700">Outbound email attached per operating doctrine</div>
<div style="font-size:13px;color:#78350f;margin-top:4px">Sent ${new Date().toISOString()}. Auto-attached by <code>sendWithBcAttach</code>.</div>
</div>
<div style="margin-top:12px"><strong>Subject:</strong> ${escapeHtml(subject)}</div>
<div style="margin-top:4px;font-size:13px;color:#475569">${recipientStr}</div>
<div style="margin-top:4px"><strong>Mandrill:</strong> <code>${escapeHtml(sent.messageId)}</code></div>
<hr style="border:none;border-top:1px solid #e2e8f0;margin:14px 0">
${summary}
${vaultBlock}`;

  const comment = await postTicketComment({ bucketId, ticketId, html: commentHtml });
  return { mandrillId: sent.messageId, commentUrl: comment.app_url, vaultUploads };
}

module.exports = { sendWithBcAttach };
