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
          <div class="landjet-steps">
            <button class="landjet-step landjet-step-1" data-step="1">
              <span class="landjet-step-num">1</span>
              <span class="landjet-step-label">Open Connect dialog</span>
            </button>
            <button class="landjet-step landjet-step-2" data-step="2">
              <span class="landjet-step-num">2</span>
              <span class="landjet-step-label">Click Add a note</span>
            </button>
            <button class="landjet-step landjet-step-3" data-step="3">
              <span class="landjet-step-num">3</span>
              <span class="landjet-step-label">Paste message</span>
            </button>
          </div>
          <p class="landjet-hint">Click each step. After step 3, click LinkedIn's <strong>Send</strong> to mark Done. If a step does nothing, do it manually on LinkedIn and the next step will light up.</p>
        ` : `
          <div class="landjet-warning">Next step for this lead is <strong>${escapeHtml(channel)}</strong>, not LinkedIn. Open the outreach page to handle.</div>
        `}
        <div class="landjet-status" id="landjet-status"></div>
      </div>
    `;

    panel.querySelector('.landjet-close').addEventListener('click', () => {
      panel.remove();
    });

    // Wire up the 3-step stepwise UI. Each step does exactly ONE LinkedIn
    // action. If a step's auto-click silently fails (LinkedIn's React handler
    // rejected our synthetic event), the user can do that ONE click on
    // LinkedIn manually, and the state detector advances the active step.
    const stepBtns = panel.querySelectorAll('.landjet-step');
    stepBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const step = parseInt(btn.getAttribute('data-step'), 10);
        const textarea = panel.querySelector('.landjet-msg');
        const text = textarea ? textarea.value : '';
        await runStep(step, text);
        // Re-detect state after the action and update step highlighting.
        updateStepHighlight();
      });
    });

    // Initial highlight + start auto-detect of state transitions so the
    // active step lights up as soon as the user manually moves LinkedIn
    // forward.
    updateStepHighlight();
    startStateWatcher();
  }

  // ----- Step state machine -----

  function detectFlowState() {
    if (findConnectNoteTextarea()) return 'TEXTAREA_OPEN';   // step 3 active
    if (findAddNoteButton()) return 'MODAL_OPEN';            // step 2 active
    if (findConnectInOpenDropdown()) return 'DROPDOWN_OPEN'; // step 1.5 active (Connect visible in menu)
    if (findConnectOnProfileHeader()) return 'CONNECT_VISIBLE'; // step 1.5 active (2nd-degree direct)
    return 'INITIAL';                                         // step 1 active
  }

  function activeStepFromState(state) {
    if (state === 'TEXTAREA_OPEN') return 3;
    if (state === 'MODAL_OPEN') return 2;
    return 1; // INITIAL, DROPDOWN_OPEN, CONNECT_VISIBLE -- still on step 1
  }

  function updateStepHighlight() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const active = activeStepFromState(detectFlowState());
    panel.querySelectorAll('.landjet-step').forEach(btn => {
      const n = parseInt(btn.getAttribute('data-step'), 10);
      btn.classList.toggle('landjet-step-active', n === active);
      btn.classList.toggle('landjet-step-done', n < active);
    });
  }

  let _watcher = null;
  function startStateWatcher() {
    if (_watcher) _watcher.disconnect();
    _watcher = new MutationObserver(() => updateStepHighlight());
    _watcher.observe(document.body, { childList: true, subtree: true, attributes: false });
  }

  async function runStep(step, text) {
    if (step === 1) return runStepOpenConnect();
    if (step === 2) return runStepClickAddANote();
    if (step === 3) return runStepPaste(text);
  }

  // Step 1: get LinkedIn into a state where the "Add a note?" modal is open.
  // Tries: (a) click an already-visible Connect on the header, or (b) click
  // "..." and then click Connect inside the dropdown. If our clicks don't
  // fire LinkedIn's React handlers, the user does it manually -- the state
  // watcher will advance the highlight to step 2.
  async function runStepOpenConnect() {
    setStatus('Step 1: opening Connect...', 'info');

    // Already past this step?
    const state = detectFlowState();
    if (state === 'MODAL_OPEN' || state === 'TEXTAREA_OPEN') {
      setStatus('Step 1 already done. Move to step 2.', 'success');
      return;
    }

    let connect = findConnectOnProfileHeader();
    if (!connect) {
      const more = findMoreActionsButton();
      if (!more) {
        setStatus('Could not find "..." menu. Click Connect on LinkedIn yourself, then hit step 2.', 'error');
        return;
      }
      aggressiveClick(more);
      // Give the menu time to render + animate in.
      await new Promise(r => setTimeout(r, 600));
      try {
        connect = await waitFor(findConnectInOpenDropdown, { timeout: 3000 });
      } catch {
        setStatus('Menu opened but Connect did not appear. Click Connect manually on LinkedIn, then hit step 2.', 'error');
        return;
      }
    }
    aggressiveClick(connect);
    await new Promise(r => setTimeout(r, 400));

    // Did the "Add a note?" modal open?
    if (findAddNoteButton()) {
      setStatus('Step 1 done. Now click step 2.', 'success');
    } else {
      setStatus('Clicked Connect but the modal did not open. If LinkedIn shows the dialog now, click step 2. Otherwise click Connect manually.', 'info');
    }
  }

  // Step 2: click "Add a note" in the LinkedIn modal.
  async function runStepClickAddANote() {
    setStatus('Step 2: clicking Add a note...', 'info');

    // Already past this step?
    if (findConnectNoteTextarea()) {
      setStatus('Step 2 already done. Move to step 3.', 'success');
      return;
    }

    const btn = findAddNoteButton();
    if (!btn) {
      setStatus('Click LinkedIn\'s "Add a note" button yourself -- the textarea will appear, step 3 lights up automatically.', 'info');
      // Start polling for the textarea to appear so step 3 advances on its own.
      const start = Date.now();
      const poll = setInterval(() => {
        if (findConnectNoteTextarea()) {
          clearInterval(poll);
          updateStepHighlight();
          setStatus('Got it. Now click step 3 to paste.', 'success');
        } else if (Date.now() - start > 30000) {
          clearInterval(poll);
        }
      }, 400);
      return;
    }
    aggressiveClick(btn);
    // Wait briefly for the textarea to render.
    try {
      await waitFor(findConnectNoteTextarea, { timeout: 3000 });
      setStatus('Step 2 done. Now click step 3.', 'success');
    } catch {
      setStatus('Clicked Add a note but the textarea did not appear. If you see it now, click step 3. Otherwise click Add a note manually.', 'info');
    }
  }

  // Step 3: paste the message into the connect-note textarea.
  function runStepPaste(text) {
    setStatus('Step 3: pasting message...', 'info');
    const textarea = findConnectNoteTextarea();
    if (!textarea) {
      setStatus('LinkedIn\'s note textarea is not visible. Make sure step 2 worked or click Add a note manually.', 'error');
      return;
    }
    pasteIntoTextarea(textarea, text);
    setStatus('Done! Click LinkedIn\'s Send button to mark this lead as completed.', 'success');
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
    // Strategy 1 (most precise -- confirmed against Bill Polk DOM 2026-06-01):
    // LinkedIn's overflow dropdown's Connect item is an <a role="menuitem">
    // with href "/preload/custom-invite/?vanityName=...". The href is unique
    // to that exact link -- no sidebar Connect button or other action has it.
    const direct = document.querySelector('a[role="menuitem"][href*="custom-invite"]');
    if (direct && direct.offsetParent !== null) return direct;

    // Strategy 2 (fallback for DOM shifts): scan visible elements inside any
    // visible menu container for "Connect" label, walk up to the clickable.
    const menus = document.querySelectorAll('[role="menu"], .artdeco-dropdown__content, [role="menuitem"]');
    for (const menu of menus) {
      if (menu.offsetParent === null) continue;
      const items = menu.querySelectorAll('button, [role="menuitem"], [role="button"], div, span, a');
      for (const it of items) {
        if (it.offsetParent === null) continue;
        const label = (it.getAttribute('aria-label') || '') + ' ' + (it.textContent || '');
        if (matchesConnectLabel(label)) {
          return it.closest('a[role="menuitem"], button, [role="menuitem"], [role="button"], a') || it;
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

  // Stronger visibility check than offsetParent !== null. LinkedIn modals are
  // sometimes nested inside aria-hidden / display:none ancestors during their
  // open animation, which trips offsetParent but the user CAN see + click them.
  function isActuallyVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    if (rect.bottom < 0 || rect.right < 0) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return true;
  }

  // v1.0.18: bulletproof direct-text finder. Walks every element and checks
  // its IMMEDIATE child text (not descendants). If "Add a note" is the exact
  // direct text of any visible element, returns it. Because direct-text
  // excludes nested screen-reader spans, this is immune to LinkedIn's
  // aria-hidden / sr-only wrapper text that polluted textContent matches.
  function _directText(el) {
    let s = '';
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) s += node.textContent;
    }
    return s.trim();
  }

  function findAddNoteButton() {
    // STRATEGY 0 (bulletproof, v1.0.18): direct-text exact match anywhere
    // on the page. Walk up to the nearest button/link/role=button so the
    // React fiber click has something solid to grab.
    for (const el of document.querySelectorAll('*')) {
      if (!isActuallyVisible(el)) continue;
      const direct = _directText(el).toLowerCase();
      if (direct !== 'add a note') continue;
      // Walk up to a clickable ancestor (button, a, role=button) -- the
      // React onClick handler usually lives there, not on the inner span.
      let p = el;
      for (let i = 0; i < 6 && p && p !== document.body; i++) {
        const tag = p.tagName;
        const role = p.getAttribute && p.getAttribute('role');
        if (tag === 'BUTTON' || tag === 'A' || role === 'button' || role === 'menuitem') {
          return p;
        }
        p = p.parentElement;
      }
      // No clickable ancestor found -- return the inner element. The React
      // fiber walk in aggressiveClick will scan up to 4 ancestors anyway.
      return el;
    }

    // v1.0.17 strategy retained as a fallback in case LinkedIn changes the
    // button text wording slightly.
    //
    // This is dramatically simpler than trying to text-match across the
    // whole document and bypasses any screen-reader-only text wrappers
    // that might pollute textContent.

    // Strategy 1: find the dialog by title text, then pick its
    // non-"without" button.
    const titles = [...document.querySelectorAll('h1, h2, h3, [role="heading"]')];
    const dialogTitle = titles.find(h => {
      if (!isActuallyVisible(h)) return false;
      const t = (h.textContent || '').trim().toLowerCase();
      return /add a note to your invitation/.test(t);
    });
    if (dialogTitle) {
      // Walk up to find the modal/dialog container.
      let modal = dialogTitle;
      for (let i = 0; i < 8 && modal && modal !== document.body; i++) {
        if (modal.getAttribute && (modal.getAttribute('role') === 'dialog' ||
            modal.getAttribute('role') === 'alertdialog' ||
            /modal|dialog|artdeco/i.test(modal.getAttribute('class') || ''))) {
          break;
        }
        modal = modal.parentElement;
      }
      const scope = (modal && modal !== document.body) ? modal : dialogTitle.parentElement || document.body;
      const buttons = scope.querySelectorAll('button, [role="button"], a');
      for (const b of buttons) {
        if (!isActuallyVisible(b)) continue;
        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
        const text = (b.textContent || '').toLowerCase();
        if (/without/.test(aria) || /without/.test(text)) continue;
        if (/close|dismiss|cancel|×/i.test(aria + ' ' + text)) continue;
        // Whatever's left in a 2-button modal is "Add a note".
        if (/add.*note|note/.test(aria + ' ' + text) || (b.textContent || '').trim().length < 30) {
          return b;
        }
      }
    }

    // Strategy 2 (fallback): scan all visible role=dialog/alertdialog
    // containers + any artdeco-modal element for the non-"without" button.
    const modals = [
      ...document.querySelectorAll('[role="dialog"], [role="alertdialog"]'),
      ...document.querySelectorAll('[class*="artdeco-modal"], [class*="modal"]'),
    ];
    for (const m of modals) {
      if (!isActuallyVisible(m)) continue;
      const buttons = m.querySelectorAll('button, [role="button"]');
      for (const b of buttons) {
        if (!isActuallyVisible(b)) continue;
        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
        const text = (b.textContent || '').toLowerCase();
        if (/without|close|dismiss|cancel|×/.test(aria + ' ' + text)) continue;
        if (/add.*note|^add a note/.test(text)) return b;
        if (/add.*note|^add a note/.test(aria)) return b;
      }
    }

    // Strategy 3 (final fallback): the old exact-text scan across all elements.
    const all = document.querySelectorAll('button, [role="button"], a, span, div, li, [role="menuitem"]');
    for (const el of all) {
      if (!isActuallyVisible(el)) continue;
      const aria = (el.getAttribute('aria-label') || '').trim().toLowerCase();
      const text = (el.textContent || '').trim().toLowerCase();
      if (/without/.test(aria) || /without/.test(text)) continue;
      if (text === 'add a note' || aria === 'add a note') return el;
      if (/^add a note\s*$/i.test(text)) return el;
    }

    return null;
  }

  // LinkedIn's React handlers are gated against synthetic clicks -- isTrusted
  // is false on any event dispatched from a content script, and React's
  // accessible menu components check that. Mouse, pointer, and keyboard event
  // sequences all silently no-op against the gated handlers.
  //
  // The reliable workaround: walk the React fiber (stored on the DOM node
  // under a `__reactProps$xxx` key) and call onClick directly. Bypasses the
  // event system entirely. Proven to work on the Connect menuitem 2026-06-01.
  //
  // Falls back to the mouse/keyboard sequence if no React props are present
  // (so non-React buttons like LinkedIn's textarea actions still work).
  function findReactProps(el) {
    if (!el) return null;
    const key = Object.keys(el).find(k => k.startsWith('__reactProps$'));
    return key ? el[key] : null;
  }

  function tryReactOnClick(el) {
    const props = findReactProps(el);
    if (!props || typeof props.onClick !== 'function') return false;
    try {
      props.onClick({
        preventDefault() {},
        stopPropagation() {},
        currentTarget: el,
        target: el,
        type: 'click',
        isTrusted: true,
        nativeEvent: { type: 'click' },
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  function aggressiveClick(el) {
    if (!el) return;
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    try { el.focus(); } catch {}

    // STRATEGY 1 (preferred): React fiber direct onClick call. Works on
    // every gated React handler we have encountered on LinkedIn so far.
    if (tryReactOnClick(el)) return;

    // STRATEGY 2: walk up to the nearest ancestor that has React props
    // (sometimes the onClick is on a parent like a wrapper button/div).
    let p = el.parentElement;
    for (let i = 0; i < 4 && p; i++, p = p.parentElement) {
      if (tryReactOnClick(p)) return;
    }

    // STRATEGY 3 (fallback for non-React targets): full event sequence.
    const rect = el.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);
    const mouseOpts = {
      bubbles: true, cancelable: true, composed: true,
      view: window, detail: 1, button: 0, buttons: 1,
      clientX: x, clientY: y, screenX: x, screenY: y,
    };
    try { el.dispatchEvent(new PointerEvent('pointerdown', { ...mouseOpts, pointerType: 'mouse', pointerId: 1, isPrimary: true })); } catch {}
    el.dispatchEvent(new MouseEvent('mousedown', mouseOpts));
    try { el.dispatchEvent(new PointerEvent('pointerup', { ...mouseOpts, pointerType: 'mouse', pointerId: 1, isPrimary: true })); } catch {}
    el.dispatchEvent(new MouseEvent('mouseup', mouseOpts));
    el.dispatchEvent(new MouseEvent('click', mouseOpts));

    const keyOpts = {
      bubbles: true, cancelable: true, composed: true,
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
    };
    el.dispatchEvent(new KeyboardEvent('keydown', keyOpts));
    el.dispatchEvent(new KeyboardEvent('keypress', keyOpts));
    el.dispatchEvent(new KeyboardEvent('keyup', keyOpts));

    try { el.click(); } catch {}
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
      aggressiveClick(addNote);
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
      aggressiveClick(more);
      // LinkedIn's dropdown animates in over ~300ms. Give it room.
      await new Promise(r => setTimeout(r, 500));
      try {
        connect = await waitFor(findConnectInOpenDropdown, { timeout: 3000 });
      } catch {
        throw new Error('Opened the "..." menu but no Connect option appeared. The lead may already be a 1st-degree connection (try Message instead).');
      }
    }
    aggressiveClick(connect);

    // STEP 4: wait for the "Add a note" button -- modal can take 1-2s to render.
    // Give the modal animation 300ms head start before polling.
    setStatus('Choosing "Add a note"...', 'info');
    await new Promise(r => setTimeout(r, 300));
    try {
      addNote = await waitFor(findAddNoteButton, { timeout: 7000 });
    } catch {
      throw new Error('Clicked Connect but the "Add a note" button did not appear in 7s. Click it yourself, then hit ⚡ again or use "Paste only".');
    }
    aggressiveClick(addNote);

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
