// This file is overwritten with `window.LANDJET_CONFIG = { apiToken, apiBase, ... }`
// at download time by the backend. The version checked into the repo is a no-op
// so loading the extension from an unpacked checkout doesn't bake in a fake token.
// If you see this content in your installed extension, it means the zip wasn't
// personalized -- use the in-app Download button (which authenticates and
// personalizes) instead of pulling files manually.
globalThis.LANDJET_CONFIG = null;
