/**
 * bc-ryan-split-decision-2026-06-22.js
 * Record Ryan's decision on the investor-outreach email split: KEEP everything
 * on rlandry@ (no ryan@ split). Comment + complete todo #10022194556.
 *
 * BC_TOKEN env (advisor grant). Idempotent: completion is a no-op if already done.
 */
const BASE = 'https://3.basecampapi.com/3945211', P = 46699826, T_SPLIT = 10022194556;
const T = (process.env.BC_TOKEN || '').replace(/^bearer\s+/i, '').trim();
if (!T) { console.error('BC_TOKEN not set'); process.exit(1); }
const H = (e = {}) => ({ Authorization: `Bearer ${T}`, 'User-Agent': 'Colaberry Internal Tools (ali@colaberry.com)', Accept: 'application/json', ...e });
const get = async (p) => { const r = await fetch(`${BASE}${p}`, { headers: H() }); if (!r.ok) throw new Error(`GET ${p} ${r.status}`); return r.json(); };
const post = async (p, b) => { const r = await fetch(`${BASE}${p}`, { method: 'POST', headers: H(b ? { 'Content-Type': 'application/json' } : {}), body: b ? JSON.stringify(b) : undefined }); if (!r.ok) throw new Error(`POST ${p} ${r.status}: ${(await r.text()).slice(0, 160)}`); return r.status === 204 ? null : r.json(); };

const COMMENT = `<div><strong>Decided 2026-06-22 (Ryan, WhatsApp).</strong> Ryan is keeping all outreach on his main inbox: "I'm fine keeping it all on my main email." So NO split to ryan@landjet.com; everything continues from rlandry@. No mailbox provisioning or ALLOWED_SENDERS change needed. Closing.</div>`;

(async () => {
  await post(`/buckets/${P}/recordings/${T_SPLIT}/comments.json`, { content: COMMENT });
  const t = await get(`/buckets/${P}/todos/${T_SPLIT}.json`);
  if (!t.completed) { await post(`/buckets/${P}/todos/${T_SPLIT}/completion.json`); console.log('investor-split todo completed'); }
  else console.log('investor-split todo already complete');
  console.log('DONE');
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
