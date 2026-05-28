// LandJet extension presence marker.
//
// Runs on growth.landjet.com (and the local/IP dev URLs) at document_start.
// Tells the admin app the extension is installed so the "Download" button
// can hide itself. No data is read from the page; no requests are made.
//
// We CANNOT inject an inline <script> here because the admin app is Next.js
// and its Content-Security-Policy blocks inline scripts. Instead we use two
// CSP-safe signals that the React hook listens for:
//   1. A data attribute on <html data-landjet-ext-version="X.Y.Z">. Setting
//      an attribute on an existing element does not trip CSP.
//   2. A CustomEvent dispatched on window. Events dispatched from a content
//      script DO fire on listeners registered by the page (the DOM is shared
//      across worlds; only the JS contexts are isolated).
//
// The event carries no `detail` payload because cross-world structured-clone
// of detail objects has historically been quirky -- the hook reads the
// version from the data attribute when the event fires.

(function () {
  try {
    const VERSION = chrome.runtime.getManifest().version;
    document.documentElement.setAttribute('data-landjet-ext-version', VERSION);
    window.dispatchEvent(new CustomEvent('landjet-ext-ready'));
  } catch (e) {
    // Never throw out of a content script; the page must keep working.
  }
})();
