// LandJet LinkedIn Assistant -- content script.
// Runs on every linkedin.com/in/* page. Asks the backend if the current
// profile matches a lead in the outreach queue. If yes, injects an overlay
// panel with the AI-drafted message and a button to paste it into the
// connect note. Listens for the user's click on LinkedIn's native Send
// button to mark the lead Done.
//
// This script does NOT auto-click LinkedIn buttons. It only writes text
// into a field when the user clicks our Insert button, and listens for
// LinkedIn's own Send click to call our backend. Everything else is the
// user's action.

(function () {
  if (window.__landjetExtensionLoaded) return;
  window.__landjetExtensionLoaded = true;

  const PANEL_ID = 'landjet-extension-panel';
  let currentLead = null; // { lead_id, name, company, draft_body, ... }
  let lastLookupUrl = '';

  // ----- Lookup -----

  function normalizeUrl() {
    // Strip query/hash + trailing slash so the backend match is reliable
    return location.origin + location.pathname.replace(/\/+$/, '');
  }

  async function lookupCurrentProfile() {
    const url = normalizeUrl();
    if (url === lastLookupUrl) return; // already looked this one up
    lastLookupUrl = url;
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'LOOKUP_LEAD_BY_URL', url }, (resp) => {
        if (!resp || !resp.ok) {
          currentLead = null;
          renderPanel();
          resolve(null);
          return;
        }
        currentLead = resp.data;
        renderPanel();
        resolve(currentLead);
      });
    });
  }

  // ----- Panel UI -----

  function renderPanel() {
    let panel = document.getElementById(PANEL_ID);
    // If no match for this profile, hide entirely (no friction during regular browsing)
    if (!currentLead) {
      if (panel) panel.remove();
      return;
    }

    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
      panel.className = 'landjet-panel';
      document.body.appendChild(panel);
    }

    const channel = currentLead.channel || 'unknown';
    const isLinkedInStep = channel.startsWith('linkedin');
    const hasError = !!currentLead.ai_error;
    const messageBody = currentLead.draft_body || '';

    panel.innerHTML = `
      <div class="landjet-header">
        <span class="landjet-logo">LJ</span>
        <span class="landjet-title">LandJet</span>
        <button class="landjet-close" title="Hide for this page">&times;</button>
      </div>
      <div class="landjet-body">
        <div class="landjet-lead-meta">
          <div class="landjet-lead-name">${escapeHtml(currentLead.name || '')}</div>
          <div class="landjet-lead-sub">${escapeHtml(currentLead.company || '')} &middot; ${escapeHtml(currentLead.campaign_name || 'No campaign')}</div>
          <div class="landjet-lead-stage">Step ${currentLead.sequence_stage || '?'} &middot; ${escapeHtml(channel)}</div>
        </div>
        ${hasError ? `<div class="landjet-warning">${escapeHtml(currentLead.ai_error)}</div>` : ''}
        ${isLinkedInStep ? `
          <textarea class="landjet-msg" rows="5">${escapeHtml(messageBody)}</textarea>
          <div class="landjet-char-count">${messageBody.length} chars</div>
          <button class="landjet-insert">Insert into Connect Note</button>
          <p class="landjet-hint">Open LinkedIn's "Connect &raquo; Add a note" dialog first, then click above to paste. After you click LinkedIn's Send button, the lead will be marked Done automatically.</p>
        ` : `
          <div class="landjet-warning">Next step for this lead is <strong>${escapeHtml(channel)}</strong>, not LinkedIn. Open the outreach page to handle.</div>
        `}
        <div class="landjet-status" id="landjet-status"></div>
      </div>
    `;

    panel.querySelector('.landjet-close').addEventListener('click', () => {
      panel.remove();
    });

    const insertBtn = panel.querySelector('.landjet-insert');
    if (insertBtn) {
      insertBtn.addEventListener('click', () => {
        const textarea = panel.querySelector('.landjet-msg');
        const text = textarea.value;
        const inserted = insertIntoConnectNote(text);
        if (inserted) {
          setStatus('Inserted. Click LinkedIn Send to mark Done.', 'success');
        } else {
          setStatus('Could not find the LinkedIn note field. Open "Connect" then "Add a note" first.', 'error');
        }
      });
    }
  }

  function setStatus(text, kind = 'info') {
    const s = document.getElementById('landjet-status');
    if (!s) return;
    s.textContent = text;
    s.className = `landjet-status landjet-status-${kind}`;
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ----- LinkedIn DOM integration -----

  function findConnectNoteTextarea() {
    // LinkedIn's connect-note dialog uses one of these patterns. List multiple
    // fallbacks because the DOM shifts every few months.
    const candidates = [
      'textarea[name="message"]',
      'textarea#custom-message',
      '[role="dialog"] textarea',
      'div[aria-labelledby*="add-a-note"] textarea',
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return el; // visible
    }
    return null;
  }

  function insertIntoConnectNote(text) {
    const textarea = findConnectNoteTextarea();
    if (!textarea) return false;
    // React-controlled inputs require the native setter + bubbling input event
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    nativeSetter.call(textarea, text);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.focus();
    return true;
  }

  function findSendButton() {
    // Send button in the connect dialog usually says "Send" or "Send invitation"
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return null;
    const buttons = dialog.querySelectorAll('button');
    for (const b of buttons) {
      const label = (b.getAttribute('aria-label') || b.textContent || '').toLowerCase();
      if (label.includes('send') || label.includes('connect')) return b;
    }
    return null;
  }

  // Watch for LinkedIn Send click. Use event delegation on document so we
  // catch the click even if the dialog is re-rendered.
  document.addEventListener('click', async (ev) => {
    if (!currentLead) return;
    const target = ev.target;
    if (!target) return;
    const btn = target.closest && target.closest('button');
    if (!btn) return;
    const label = (btn.getAttribute('aria-label') || btn.textContent || '').toLowerCase();
    // Only fire on Send buttons inside a LinkedIn dialog (not random page buttons)
    const inDialog = btn.closest('[role="dialog"]');
    if (!inDialog) return;
    if (!(label.includes('send') || label === 'connect' || label.includes('send invitation'))) return;

    // Fire-and-forget advance
    const leadId = currentLead.lead_id;
    chrome.runtime.sendMessage({ type: 'ADVANCE_LEAD', leadId }, (resp) => {
      if (resp && resp.ok) {
        const label = resp.testMode
          ? 'TEST MODE: Send detected. No advance happened, lead stays in queue.'
          : 'Sent! Marked Done in the outreach queue.';
        setStatus(label, 'success');
        currentLead = null;
        setTimeout(() => {
          const panel = document.getElementById(PANEL_ID);
          if (panel) panel.remove();
        }, 2500);
      } else {
        setStatus('Mark Done failed: ' + (resp && resp.error ? resp.error : 'unknown'), 'error');
      }
    });
  }, true);

  // ----- Watch for navigation (LinkedIn is a SPA) -----

  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      lastLookupUrl = '';
      currentLead = null;
      const panel = document.getElementById(PANEL_ID);
      if (panel) panel.remove();
      // small delay so LinkedIn's own DOM has caught up
      setTimeout(lookupCurrentProfile, 800);
    }
  }, 1000);

  // Initial lookup
  setTimeout(lookupCurrentProfile, 1200);
})();
