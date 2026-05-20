// LandJet LinkedIn Assistant popup. Stores API token + base URL in
// chrome.storage.local. Tests the token by calling the PING message.

const $ = (id) => document.getElementById(id);

async function load() {
  const stored = await chrome.storage.local.get(['apiToken', 'apiBase']);
  if (stored.apiToken) $('api-token').value = stored.apiToken;
  if (stored.apiBase) $('api-base').value = stored.apiBase;
  else $('api-base').value = 'http://95.216.199.47:3011/api';
}

function setStatus(text, kind) {
  const s = $('status');
  s.textContent = text;
  s.className = 'status status-' + (kind || 'ok');
}

$('save').addEventListener('click', async () => {
  const apiToken = $('api-token').value.trim();
  const apiBase = $('api-base').value.trim();
  if (!apiToken) { setStatus('Token required', 'err'); return; }
  if (!apiBase) { setStatus('API base URL required', 'err'); return; }
  await chrome.storage.local.set({ apiToken, apiBase });

  // Quick health check: call lookup with a known LinkedIn URL pattern and
  // expect either a 404 (token valid, no match) or 200. A 401 means the
  // token is wrong.
  try {
    const r = await fetch(apiBase.replace(/\/+$/, '') + '/admin/outreach/lookup-by-linkedin-url?url=https://linkedin.com/in/__health_check__', {
      headers: { 'X-API-Token': apiToken },
    });
    if (r.status === 200 || r.status === 404) {
      setStatus('Saved and verified. You\'re good.', 'ok');
    } else if (r.status === 401) {
      setStatus('Saved, but the token was rejected by the server. Check the value.', 'err');
    } else {
      setStatus('Saved. Server responded with status ' + r.status, 'err');
    }
  } catch (e) {
    setStatus('Saved, but could not reach the API. Check the URL: ' + e.message, 'err');
  }
});

load();
