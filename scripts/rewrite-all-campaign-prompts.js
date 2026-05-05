/**
 * Run "Rewrite Prompts with AI" on every campaign that has unused variables.
 * This pushes the variable values into the prompts so they actually drive the messaging.
 */
require('dotenv').config();

const BASE = 'http://95.216.199.47:3011/api';

async function login() {
  const r = await fetch(BASE + '/auth/login', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({email:'admin@landjet.com', password:'Admin123!'})
  });
  return (await r.json()).token;
}

async function findCampaignsNeedingRewrite(token) {
  const r = await fetch(BASE + '/admin/campaigns?limit=25', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const data = await r.json();
  const builtins = new Set(['first_name','last_name','company','title','sender_name','sender_first_name','sender_role','sender_email','sender_company','sender_title']);
  const result = [];
  for (const camp of data.campaigns) {
    const vars = camp.settings?.variables || {};
    if (Object.keys(vars).length === 0) continue;
    const allText = [camp.ai_system_prompt || '', ...(camp.sequence_steps || []).map(s => s.prompt || '')].join(' ');
    const usedVars = new Set();
    const matches = allText.match(/\{\{([^}]+)\}\}/g) || [];
    matches.forEach(m => usedVars.add(m.replace(/[{}]/g, '').trim()));
    const unused = Object.keys(vars).filter(v => !usedVars.has(v));
    if (unused.length > 0) {
      result.push({ id: camp.id, name: camp.name, unused, total_vars: Object.keys(vars).length });
    }
  }
  return result;
}

async function rewritePrompts(token, campaignId) {
  const r = await fetch(BASE + `/admin/outreach/campaigns/${campaignId}/rewrite-prompts`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  return r.ok ? await r.json() : { error: await r.text() };
}

async function run() {
  const token = await login();
  console.log('Finding campaigns needing rewrite...');
  const list = await findCampaignsNeedingRewrite(token);
  console.log(`Found ${list.length} campaigns needing rewrite\n`);

  for (const camp of list) {
    process.stdout.write(`Rewriting "${camp.name}" (${camp.unused.length}/${camp.total_vars} unused)... `);
    const start = Date.now();
    const result = await rewritePrompts(token, camp.id);
    const elapsed = Math.round((Date.now() - start) / 1000);
    if (result.error) {
      console.log(`FAILED in ${elapsed}s: ${result.error.substring(0, 200)}`);
    } else {
      console.log(`done in ${elapsed}s`);
    }
  }

  // Re-audit
  console.log('\nRe-auditing...');
  const stillUnused = await findCampaignsNeedingRewrite(token);
  console.log(`Campaigns still with unused variables: ${stillUnused.length}`);
  stillUnused.forEach(c => console.log(`  ${c.name}: ${c.unused.join(', ')}`));
}

run().catch(e => console.error('Error:', e.message));
