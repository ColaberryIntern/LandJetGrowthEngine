// LandJet extension presence marker.
//
// Runs on growth.landjet.com (and the local/IP dev URLs) at document_start.
// Drops a marker into the page that the admin app can detect, so the "Download
// Chrome Extension" button can hide itself when the extension is already
// installed. No data is read from the page; no requests are made.
//
// The script injects an inline <script> to set window.__LANDJET_EXT__ because
// content scripts live in an isolated world and can't directly set window
// variables on the page. We also dispatch a CustomEvent that React can listen
// for, which solves the race where the page mounts before the marker runs.

(function () {
  try {
    const VERSION = chrome.runtime.getManifest().version;
    const ID = chrome.runtime.id || '';

    // 1. Set the window variable via injected <script> so the page's JS sees it.
    const s = document.createElement('script');
    s.textContent =
      'window.__LANDJET_EXT__ = { installed: true, version: ' + JSON.stringify(VERSION) +
      ', id: ' + JSON.stringify(ID) + ' };' +
      'window.dispatchEvent(new CustomEvent("landjet-ext-ready", { detail: window.__LANDJET_EXT__ }));';
    (document.head || document.documentElement).appendChild(s);
    s.remove();

    // 2. Also set a data attribute on <html> as a fallback that does NOT
    //    require the page to listen for the event.
    document.documentElement.setAttribute('data-landjet-ext-version', VERSION);
  } catch (e) {
    // Never throw out of a content script; the page must keep working.
  }
})();
