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
          <button class="landjet-auto">&#9889; Open Connect &amp; Paste</button>
          <button class="landjet-insert landjet-insert-secondary">Paste only (dialog already open)</button>
          <p class="landjet-hint">Click the lightning button -- it opens LinkedIn's Connect &raquo; Add a note dialog and pastes the message for you. Then just click LinkedIn's Send to mark Done.</p>
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

    const autoBtn = panel.querySelector('.landjet-auto');
    if (autoBtn) {
      autoBtn.addEventListener('click', async () => {
        const textarea = panel.querySelector('.landjet-msg');
        const text = textarea.value;
        autoBtn.disabled = true;
        autoBtn.textContent = 'Opening...';
        try {
          await openConnectAndPaste(text);
          autoBtn.textContent = '⚡ Open Connect & Paste';
        } catch (e) {
          setStatus(e.message || 'Could not auto-open the Connect dialog.', 'error');
        } finally {
          autoBtn.disabled = false;
          autoBtn.textContent = '⚡ Open Connect & Paste';
        }
      });
    }
  }

  // ----- Auto flow: click LinkedIn's Connect -> Add a note -> paste -----

  function waitFor(checkFn, { timeout = 4000, interval = 100 } = {}) {
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      const tick = () => {
        const result = checkFn();
        if (result) return resolve(result);
        if (Date.now() - t0 > timeout) return reject(new Error('waitFor timeout'));
        setTimeout(tick, interval);
      };
      tick();
    });
  }

  function findMoreActionsButton() {
    // The "..." overflow button on the profile header. Multiple aria-labels
    // across LinkedIn versions: "More actions", "More", "More profile actions".
    const candidates = document.querySelectorAll('main button[aria-label], header button[aria-label]');
    for (const b of candidates) {
      const label = (b.getAttribute('aria-label') || '').toLowerCase();
      if (label.includes('more') && b.offsetParent !== null) return b;
    }
    return null;
  }

  // LinkedIn renders many "Connect" buttons on a single profile page (sidebar:
  // "More profiles for you", "People similar to..."). We need to specifically
  // target the one for THIS profile. Two paths:
  //   (a) A "Connect" button on the profile header itself (2nd-degree shows it
  //       directly; 3rd-degree hides it behind "...")
  //   (b) A "Connect" menu item inside the dropdown that opens after "..."
  // We scope to those two locations and ignore everything else.

  function isInSidebar(el) {
    // LinkedIn's sidebars sit inside <aside> or sections with these classes.
    // Walking up the parent chain is the cheapest reliable detector.
    let p = el;
    while (p && p !== document.body) {
      if (p.tagName === 'ASIDE') return true;
      const cls = (p.getAttribute && p.getAttribute('class')) || '';
      if (/right-rail|browsemap|pymk|aside|sidebar|similar/i.test(cls)) return true;
      const aria = (p.getAttribute && p.getAttribute('aria-label')) || '';
      if (/similar to|more profiles|people you|people also/i.test(aria)) return true;
      p = p.parentElement;
    }
    return false;
  }

  function matchesConnectLabel(label) {
    const t = label.trim().toLowerCase();
    if (!t) return false;
    if (t === 'connect') return true;
    // "Connect with Bill Polk", "Invite to connect" -- yes
    if (/^connect( with|$| to)/.test(t)) return true;
    if (/^invite .* to connect/.test(t)) return true;
    return false;
  }

  function findConnectInOpenDropdown() {
    // After "..." is clicked LinkedIn renders an artdeco-dropdown menu. Items
    // are inside a [role="menu"] or .artdeco-dropdown__content container.
    const menus = document.querySelectorAll('[role="menu"], .artdeco-dropdown__content, [role="menuitem"]');
    for (const menu of menus) {
      if (menu.offsetParent === null) continue;
      const items = menu.querySelectorAll('button, [role="menuitem"], [role="button"], div, span, a');
      for (const it of items) {
        if (it.offsetParent === null) continue;
        const label = (it.getAttribute('aria-label') || '') + ' ' + (it.textContent || '');
        if (matchesConnectLabel(label)) {
          // Click the smallest clickable ancestor.
          return it.closest('button, [role="menuitem"], [role="button"], a') || it;
        }
      }
    }
    return null;
  }

  function findConnectOnProfileHeader() {
    // The main profile action row sits at the top of <main>. Restrict to
    // buttons within the first ~700px of viewport so sidebar matches are
    // excluded, and additionally reject anything that lives in a sidebar
    // container via isInSidebar().
    const buttons = document.querySelectorAll('main button, header button');
    for (const b of buttons) {
      if (b.offsetParent === null) continue;
      if (isInSidebar(b)) continue;
      const rect = b.getBoundingClientRect();
      if (rect.top > 700 || rect.top < 0) continue;
      const label = (b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '');
      if (matchesConnectLabel(label) && !label.toLowerCase().includes('connection')) {
        return b;
      }
    }
    return null;
  }

  function findAddNoteButton() {
    // In the post-Connect modal LinkedIn shows two buttons: "Send without a note"
    // and "Add a note". Pick the latter. LinkedIn's modal uses `artdeco-modal`
    // classes and a mix of role="dialog", role="alertdialog", or sometimes no
    // role at all. Easiest: scan ALL visible buttons on the page for the label
    // and pick the first visible match.
    const buttons = document.querySelectorAll('button, [role="button"]');
    for (const b of buttons) {
      if (b.offsetParent === null) continue;
      const label = ((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')).toLowerCase().trim();
      // Match "Add a note", "add note", but NOT "Send without a note".
      if (/add a note|add note/.test(label) && !/without/.test(label)) {
        return b;
      }
    }
    return null;
  }

  // Orchestrator: progressively click through Connect -> Add a note, then paste.
  // Resilient to LinkedIn modal timing -- each step uses a 6s waitFor and the
  // flow can resume mid-state (e.g. if the "Add a note" modal is already open
  // when user clicks our button, we skip the earlier steps).
  async function openConnectAndPaste(text) {
    setStatus('Opening Connect...', 'info');

    // STEP 1: already at the final state? (note textarea visible)
    if (findConnectNoteTextarea()) {
      pasteIntoTextarea(findConnectNoteTextarea(), text);
      setStatus('Inserted. Click LinkedIn Send to mark Done.', 'success');
      return;
    }

    // STEP 2: at the "Add a note?" modal? Just click Add a note + paste.
    let addNote = findAddNoteButton();
    if (addNote) {
      addNote.click();
      const textarea = await waitFor(findConnectNoteTextarea, { timeout: 6000 });
      pasteIntoTextarea(textarea, text);
      setStatus('Inserted. Click LinkedIn Send to mark Done.', 'success');
      return;
    }

    // STEP 3: full flow -- need to click Connect first.
    // First try the profile header (2nd-degree shows Connect directly there).
    // Otherwise click "..." and look for Connect inside that dropdown only.
    let connect = findConnectOnProfileHeader();
    if (!connect) {
      const more = findMoreActionsButton();
      if (!more) throw new Error('Could not find LinkedIn\'s Connect button or "..." menu. The profile may not be connectable.');
      more.click();
      try {
        connect = await waitFor(findConnectInOpenDropdown, { timeout: 3000 });
      } catch {
        throw new Error('Opened the "..." menu but no Connect option appeared. The lead may already be a 1st-degree connection (try Message instead).');
      }
    }
    connect.click();

    // STEP 4: wait for the "Add a note" button -- modal can take 1-2s to render.
    setStatus('Choosing "Add a note"...', 'info');
    try {
      addNote = await waitFor(findAddNoteButton, { timeout: 6000 });
    } catch {
      throw new Error('Clicked Connect but the "Add a note" button did not appear in 6s. Click it yourself, then hit ⚡ again or use "Paste only".');
    }
    addNote.click();

    // STEP 5: wait for textarea and paste.
    let textarea;
    try {
      textarea = await waitFor(findConnectNoteTextarea, { timeout: 6000 });
    } catch {
      throw new Error('The note field did not appear within 6s. LinkedIn may have rate-limited you.');
    }
    pasteIntoTextarea(textarea, text);

    setStatus('Inserted. Click LinkedIn Send to mark Done.', 'success');
  }

  function pasteIntoTextarea(textarea, text) {
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    nativeSetter.call(textarea, text);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.focus();
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
