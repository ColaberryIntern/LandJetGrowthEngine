// LandJet LinkedIn Assistant popup.
//
// Two modes:
//   - "Baked" mode: the zip was downloaded via the in-app Download button,
//     which injected config.js with the user's apiToken + apiBase. We hide
//     the token fields, show a "Connected" banner with the user's email,
//     and only let them toggle Test Mode.
//   - "Manual" mode: legacy / unpacked install. We show the token + URL
//     fields and the user pastes their token (original v1.0.x flow).

const $ = (id) => document.getElementById(id);

async function load() {
  // Ask background for the merged config -- it tells us if a token was baked
  // in at download time and supplies the user's email for the banner.
  const ping = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'PING' }, (resp) => resolve(resp || {}));
  });
  const baked = !!ping.bakedIn;
  const stored = await chrome.storage.local.get(['apiToken', 'apiBase', 'testMode']);

  if (baked) {
    $('baked-section').classList.remove('hidden');
    $('manual-section').classList.add('hidden');
    $('baked-email').textContent = ping.bakedEmail || '';
    $('save').textContent = 'Save settings';
  } else {
    $('baked-section').classList.add('hidden');
    $('manual-section').classList.remove('hidden');
    if (stored.apiToken) $('api-token').value = stored.apiToken;
    $('api-base').value = stored.apiBase || (ping.apiBase || 'http://95.216.199.47:3011/api');
  }
  $('test-mode').checked = !!stored.testMode;
}

function setStatus(text, kind) {
  const s = $('status');
  s.textContent = text;
  s.className = 'status status-' + (kind || 'ok');
}

$('save').addEventListener('click', async () => {
  // Re-read baked status so the right path runs on save.
  const ping = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'PING' }, (resp) => resolve(resp || {}));
  });
  const baked = !!ping.bakedIn;
  const testMode = $('test-mode').checked;

  if (baked) {
    // Token comes from config.js -- only persist test mode.
    await chrome.storage.local.set({ testMode });
    setStatus('Saved. Connected as ' + (ping.bakedEmail || 'configured user') + '.', 'ok');
    return;
  }

  // Manual mode: validate the pasted token by hitting a known endpoint.
  const apiToken = $('api-token').value.trim();
  const apiBase = $('api-base').value.trim();
  if (!apiToken) { setStatus('Token required', 'err'); return; }
  if (!apiBase) { setStatus('API base URL required', 'err'); return; }
  await chrome.storage.local.set({ apiToken, apiBase, testMode });

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
