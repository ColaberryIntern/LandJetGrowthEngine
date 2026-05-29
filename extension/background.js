// LandJet LinkedIn Assistant -- background service worker.
// Holds the API token, makes backend calls, and refreshes outreach tabs
// after a successful advance.
//
// Config resolution order (per call):
//   1. config.js baked into the zip at download time (self.LANDJET_CONFIG)
//   2. chrome.storage.local (legacy manual paste, kept for back-compat)
//   3. hard-coded fallbacks below
//
// When the backend injects config.js, the user never sees a token field.

// IMPORTANT (Chrome MV3): importScripts() can ONLY be called at the top level
// of the service worker, BEFORE the SW finishes installing. Calling it later
// (e.g., on first message) throws "importScripts() of new scripts after
// service worker installation is not allowed." So we load config.js here,
// synchronously, at startup.
try {
  importScripts('config.js');
} catch (e) {
  // config.js missing -- non-personalized build. Fall back to chrome.storage.
  self.LANDJET_CONFIG = null;
}

const DEFAULT_API_BASE = 'http://95.216.199.47:3011/api';
const DEFAULT_OUTREACH_PAGE = 'http://95.216.199.47:4000/outreach';

async function getConfig() {
  const baked = self.LANDJET_CONFIG || null;
  const stored = await chrome.storage.local.get(['apiToken', 'apiBase', 'outreachPage', 'testMode']);
  return {
    apiToken: (baked && baked.apiToken) || stored.apiToken || '',
    apiBase: (baked && baked.apiBase) || stored.apiBase || DEFAULT_API_BASE,
    outreachPage: stored.outreachPage || DEFAULT_OUTREACH_PAGE,
    testMode: !!stored.testMode,
    bakedIn: !!(baked && baked.apiToken), // true => popup hides the token UI
    bakedEmail: (baked && baked.userEmail) || '',
  };
}

async function apiFetch(path, opts = {}) {
  const { apiToken, apiBase } = await getConfig();
  if (!apiToken) throw new Error('No API token configured -- open the extension popup and paste yours');
  const url = apiBase.replace(/\/+$/, '') + path;
  const r = await fetch(url, {
    ...opts,
    headers: {
      'X-API-Token': apiToken,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`API ${r.status}: ${txt.slice(0, 120)}`);
  }
  return await r.json().catch(() => ({}));
}

// Reload any tabs currently showing the outreach page so leads that were
// just advanced drop off without Ryan having to manually refresh.
async function reloadOutreachTabs() {
  const { outreachPage } = await getConfig();
  // Match by URL pattern -- both http://95.216.199.47:4000/outreach* and any
  // future growth.landjet.com/outreach* once DNS lands.
  const patterns = [
    'http://95.216.199.47:4000/outreach*',
    'http://95.216.199.47:4000/outreach',
    'https://growth.landjet.com/outreach*',
    'https://growth.landjet.com/outreach',
  ];
  for (const pattern of patterns) {
    try {
      const tabs = await chrome.tabs.query({ url: pattern });
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.reload(tab.id).catch(() => {});
        }
      }
    } catch (e) {
      // ignore -- pattern may not be a valid match pattern in some browsers
    }
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'LOOKUP_LEAD_BY_URL') {
        const data = await apiFetch(`/admin/outreach/lookup-by-linkedin-url?url=${encodeURIComponent(msg.url)}`);
        sendResponse({ ok: true, data });
      } else if (msg.type === 'ADVANCE_LEAD') {
        const { testMode } = await getConfig();
        if (testMode) {
          // Test mode: log + fake-refresh, but do NOT actually call the API
          // or advance the lead. Used to validate the UX end-to-end without
          // touching real data.
          console.log('[LandJet] TEST MODE: simulated advance for lead', msg.leadId);
          sendResponse({ ok: true, testMode: true });
          return;
        }
        await apiFetch(`/admin/outreach/${msg.leadId}/advance`, { method: 'POST', body: JSON.stringify({}) });
        // Fire-and-forget tab reloads
        reloadOutreachTabs().catch(() => {});
        sendResponse({ ok: true });
      } else if (msg.type === 'PING') {
        const { apiToken, apiBase, bakedIn, bakedEmail } = await getConfig();
        sendResponse({ ok: true, hasToken: !!apiToken, apiBase, bakedIn, bakedEmail });
      } else {
        sendResponse({ ok: false, error: 'Unknown message type' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true; // keep channel open for async response
});
