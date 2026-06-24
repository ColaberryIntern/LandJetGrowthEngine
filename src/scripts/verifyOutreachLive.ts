import '../config/environment';
import { getSequelize } from '../config/database';
import { initModels, User } from '../models';
import { refreshToken } from '../services/authService';
import { hasPermission } from '../config/roles';
import { getSenderProfile, detectIdentityConflict, getSendersConfig } from '../services/senderProfileService';
import { sendOutreachEmail, isAllowedSender } from '../services/outreachEmailService';
import { personalize, findUnresolvedTokens } from '../services/outreachPersonalization';

/**
 * verifyOutreachLive.ts
 * "Log in as each rep" and run a 25-point release checklist against the LIVE
 * API + services, end to end. Proves: each person can authenticate; sees ONLY
 * their area across every surface (list, today queue, export, detail, filter
 * chips); can send; sends from the right mailbox with the right signature; and
 * personalization is safe.
 *
 *   docker exec landjet-backend npx tsx /app/src/scripts/verifyOutreachLive.ts
 *   docker exec -e SEND_TEST_EMAILS=1 landjet-backend npx tsx /app/src/scripts/verifyOutreachLive.ts
 *
 * Read-only except for the 3 signature test-emails, which only send when
 * SEND_TEST_EMAILS=1 (to TEST_EMAIL_TO, default ali@colaberry.com).
 */

const BASE = process.env.API_BASE || 'http://localhost:4000/api';
const TEST_TO = process.env.TEST_EMAIL_TO || 'ali@colaberry.com';
const SEND = process.env.SEND_TEST_EMAILS === '1';

const isTX = (s?: string | null) => /^(tx|texas)$/i.test((s || '').trim());
const isIA = (s?: string | null) => /^(ia|iowa)$/i.test((s || '').trim());

interface ApiResp { status: number; body: any }
async function api(path: string, token?: string, opts: { method?: string; body?: any } = {}): Promise<ApiResp> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const body = await r.json().catch(() => null);
  return { status: r.status, body };
}
const leadsOf = (r: ApiResp): any[] => (r.body?.leads || []);
const statesOf = (leads: any[]): string[] => [...new Set(leads.map(l => (l.state || '(none)')))];

interface Check { n: number; label: string; pass: boolean | null; detail: string }
const results: Check[] = [];
function record(n: number, label: string, pass: boolean | null, detail: string) {
  results.push({ n, label, pass, detail });
}

async function main() {
  const sequelize = getSequelize();
  initModels(sequelize);

  const users: Record<string, { id: string; email: string; role: string; status: string; token: string }> = {};
  for (const email of ['rlandry@landjet.com', 'percy@landjet.com', 'gnecker@landjet.com']) {
    const u = await User.findOne({ where: { email } });
    if (!u) { console.error(`MISSING USER ${email}`); process.exit(1); }
    const auth = await refreshToken(u.id); // same JWT the login endpoint issues
    users[email] = { id: u.id, email, role: u.role, status: u.status, token: auth.token };
  }
  const ryan = users['rlandry@landjet.com'];
  const percy = users['percy@landjet.com'];
  const grant = users['gnecker@landjet.com'];

  // --- LOGIN / SESSION (1-4) ---
  for (const [n, u, name] of [[1, percy, 'Percy'], [2, grant, 'Grant'], [3, ryan, 'Ryan']] as const) {
    const me = await api('/admin/leads?limit=1', u.token);
    record(n, `${name} can authenticate (active session reaches the API)`, u.status === 'active' && me.status === 200, `status=${u.status} api=${me.status}`);
  }
  const badLogin = await api('/auth/login', undefined, { method: 'POST', body: { email: 'percy@landjet.com', password: 'definitely-wrong' } });
  record(4, 'Login rejects a wrong password', badLogin.status === 401, `wrong-password login -> ${badLogin.status}`);

  // --- ROLE / SEND CAPABILITY (5-7) ---
  record(5, 'Percy can send (role has campaigns:write)', hasPermission(percy.role, 'campaigns:write'), `role=${percy.role}`);
  record(6, 'Grant can send (role has campaigns:write)', hasPermission(grant.role, 'campaigns:write'), `role=${grant.role}`);
  record(7, 'Ryan can send (role has campaigns:write)', hasPermission(ryan.role, 'campaigns:write'), `role=${ryan.role}`);

  // --- AREA ISOLATION: LIST (8-13) ---
  const percyList = leadsOf(await api('/admin/leads?limit=200', percy.token));
  const grantList = leadsOf(await api('/admin/leads?limit=200', grant.token));
  record(8, 'Percy list is TX-only (no leak)', percyList.length > 0 && percyList.every(l => isTX(l.state)), `n=${percyList.length} states=${statesOf(percyList).join(',')}`);
  record(9, 'Grant list is IA-only (no leak)', grantList.length > 0 && grantList.every(l => isIA(l.state)), `n=${grantList.length} states=${statesOf(grantList).join(',')}`);
  const ryanTX = leadsOf(await api('/admin/leads?states=TX&limit=50', ryan.token));
  const ryanIA = leadsOf(await api('/admin/leads?states=IA&limit=50', ryan.token));
  record(10, 'Ryan sees BOTH TX and IA (all areas)', ryanTX.length > 0 && ryanIA.length > 0 && ryanTX.every(l => isTX(l.state)) && ryanIA.every(l => isIA(l.state)), `tx=${ryanTX.length} ia=${ryanIA.length}`);
  const percyTryIA = leadsOf(await api('/admin/leads?states=IA&limit=200', percy.token));
  record(11, 'Percy cannot widen to IA via query (clamped to TX)', percyTryIA.every(l => isTX(l.state)), `states=${statesOf(percyTryIA).join(',') || '(empty)'}`);
  const grantTryTX = leadsOf(await api('/admin/leads?states=TX&limit=200', grant.token));
  record(12, 'Grant cannot widen to TX via query (clamped to IA)', grantTryTX.every(l => isIA(l.state)), `states=${statesOf(grantTryTX).join(',') || '(empty)'}`);
  const percyClear = leadsOf(await api('/admin/leads?states=&limit=200', percy.token));
  record(13, 'Percy cannot widen by clearing the filter', percyClear.length > 0 && percyClear.every(l => isTX(l.state)), `states=${statesOf(percyClear).join(',')}`);

  // --- AREA ISOLATION: OTHER SURFACES (14-18) ---
  const percyToday = leadsOf(await api('/admin/outreach/today', percy.token));
  record(14, 'Outreach today queue: no non-TX leak for Percy', percyToday.every(l => isTX(l.state)), `n=${percyToday.length} states=${statesOf(percyToday).join(',') || '(empty)'}`);
  const percyExport = await api('/admin/leads/export?format=json', percy.token);
  const exportLeads = percyExport.body?.leads || [];
  record(15, 'Export is TX-only for Percy (no full-pool dump)', exportLeads.length > 0 && exportLeads.every((l: any) => isTX(l.state)), `n=${exportLeads.length} states=${statesOf(exportLeads).join(',')}`);

  const txId = percyList[0]?.id;
  const iaId = grantList[0]?.id;
  if (txId && iaId) {
    const grantOnTX = await api(`/admin/leads/${txId}`, grant.token);
    const percyOnTX = await api(`/admin/leads/${txId}`, percy.token);
    record(16, 'TX lead detail: blocked for Grant (404), allowed for Percy', grantOnTX.status === 404 && percyOnTX.status === 200, `grant=${grantOnTX.status} percy=${percyOnTX.status} (lead ${txId})`);
    const percyOnIA = await api(`/admin/leads/${iaId}`, percy.token);
    const grantOnIA = await api(`/admin/leads/${iaId}`, grant.token);
    record(17, 'IA lead detail: blocked for Percy (404), allowed for Grant', percyOnIA.status === 404 && grantOnIA.status === 200, `percy=${percyOnIA.status} grant=${grantOnIA.status} (lead ${iaId})`);
  } else {
    record(16, 'TX lead detail isolation', null, 'no TX/IA sample leads to test');
    record(17, 'IA lead detail isolation', null, 'no TX/IA sample leads to test');
  }
  const percyDistinct = await api('/admin/leads/distinct?field=state', percy.token);
  const distinctVals: string[] = percyDistinct.body?.values || [];
  record(18, 'Filter-bar state chips are TX-only for Percy', distinctVals.length > 0 && distinctVals.every(isTX), `values=${distinctVals.join(',')}`);

  // --- SENDER / FROM (19-20) ---
  const pProf = await getSenderProfile('percy@landjet.com');
  const gProf = await getSenderProfile('gnecker@landjet.com');
  const rProf = await getSenderProfile('rlandry@landjet.com');
  record(19, 'Each mailbox resolves to its own owner', pProf?.email === 'percy@landjet.com' && gProf?.email === 'gnecker@landjet.com' && rProf?.email === 'rlandry@landjet.com', `percy=${pProf?.name} grant=${gProf?.name} ryan=${rProf?.name}`);
  record(20, 'A non-whitelisted sender is rejected', !isAllowedSender('intruder@evil.com') && isAllowedSender('percy@landjet.com'), 'intruder blocked, percy allowed');

  // --- SIGNATURE (21-23) ---
  const pSig = pProf?.signature || '';
  record(21, 'Percy signature: own name + COO, no Ryan personal data', pSig.includes('Percy Kapadia') && pSig.includes('COO') && !pSig.includes('949.412.2682') && !pSig.includes('calendly.com/rlandry') && !pSig.includes('Chief Executive Officer'), `name+title ok, no Ryan data`);
  const gSig = gProf?.signature || '';
  record(22, 'Grant signature: own name + Business Development, no Ryan data', gSig.includes('Grant Necker') && gSig.includes('Business Development') && !gSig.includes('949.412.2682') && !gSig.includes('calendly.com/rlandry'), `name+title ok, no Ryan data`);
  const cfg = await getSendersConfig();
  const conflict = detectIdentityConflict({ fromEmail: 'percy@landjet.com', signature: rProf?.signature, displayName: 'Ryan Landry', config: cfg });
  record(23, 'Identity guard blocks percy@ carrying Ryan identity', conflict === 'Ryan Landry', `conflict=${conflict}`);

  // --- TEST EMAILS + PERSONALIZATION (24-25) ---
  if (SEND) {
    const sends: string[] = [];
    let allOk = true;
    for (const [mailbox, who] of [['rlandry@landjet.com', 'Ryan'], ['percy@landjet.com', 'Percy'], ['gnecker@landjet.com', 'Grant']] as const) {
      const r = await sendOutreachEmail({
        to: TEST_TO,
        subject: `[TEST] Outreach signature check - from ${who}`,
        body: `Hi there,\n\nThis is an automated signature + from-address test for the outreach release. It was sent from ${who}'s mailbox; the signature below should be ${who}'s.\n\nThanks,`,
        from: mailbox,
        delivery_mode: 'test',
      });
      allOk = allOk && r.success && r.from === mailbox;
      sends.push(`${who}:${r.success ? 'sent' : 'FAIL'}(from ${r.from})`);
    }
    record(24, `3 test emails sent to ${TEST_TO} (right from-address each)`, allOk, sends.join(' | '));
  } else {
    record(24, `3 test emails (right from-address each)`, null, 'skipped - set SEND_TEST_EMAILS=1 to send');
  }
  const emptyName = personalize('Hi {{first_name}}, welcome', { first_name: '' });
  const unknownTok = personalize('Hi {{firstname}}', { first_name: 'Dana' });
  record(25, 'Personalization safe (no "Hi ,", no literal {{token}})', emptyName.text.includes('Hi there,') && findUnresolvedTokens(emptyName.text).length === 0 && findUnresolvedTokens(unknownTok.text).length === 0, `empty="${emptyName.text}" unknown="${unknownTok.text}"`);

  // --- REPORT ---
  console.log('\n=== Outreach Live Release Checklist (25 points) ===\n');
  let fail = 0, skip = 0;
  for (const c of results.sort((a, b) => a.n - b.n)) {
    const tag = c.pass === null ? 'SKIP' : c.pass ? 'PASS' : 'FAIL';
    if (c.pass === false) fail++;
    if (c.pass === null) skip++;
    console.log(`  ${String(c.n).padStart(2)}. [${tag}] ${c.label}`);
    console.log(`        ${c.detail}`);
  }
  console.log(`\nRESULT: ${results.length - fail - skip} pass, ${fail} fail, ${skip} skip (of ${results.length}).`);
  if (fail > 0) console.log('NOT release-ready: fix the FAIL rows above.');
  else console.log(SEND ? 'All checks green.' : 'All checks green (test-email send skipped; re-run with SEND_TEST_EMAILS=1).');

  await sequelize.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
