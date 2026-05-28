'use client';

import { useEffect, useState } from 'react';
import { getExtensionVersion, ExtensionVersion } from './api';

// Detect the LandJet Chrome extension via the marker.js content script.
//
// marker.js sets <html data-landjet-ext-version="X.Y.Z"> at document_start
// and dispatches a `landjet-ext-ready` CustomEvent on window. We check the
// attribute synchronously on mount AND listen for the event in case React
// rendered before marker.js ran. We do NOT read window.__LANDJET_EXT__:
// setting that would require an inline script, which the app's CSP blocks.

export interface ExtensionState {
  loading: boolean;
  installed: boolean;
  installedVersion: string | null;
  latest: ExtensionVersion | null;
  needsUpdate: boolean;
}

function isOlder(a: string | null, b: string): boolean {
  if (!a) return true;
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0);
  }
  return false;
}

function readMarker(): string | null {
  if (typeof document === 'undefined') return null;
  return document.documentElement.getAttribute('data-landjet-ext-version');
}

export function useExtensionInstalled(): ExtensionState {
  const [installedVersion, setInstalledVersion] = useState<string | null>(null);
  const [latest, setLatest] = useState<ExtensionVersion | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // 1. Synchronous check.
    const initial = readMarker();
    if (initial) setInstalledVersion(initial);

    // 2. Late arrivals: marker.js may run after this effect if React mounted
    //    very fast. Listen for the event to re-check.
    function onReady() {
      if (cancelled) return;
      const v = readMarker();
      if (v) setInstalledVersion(v);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('landjet-ext-ready', onReady as EventListener);
    }

    // 3. Fetch the latest available version so we can surface "update
    //    available" if the installed copy is behind.
    getExtensionVersion()
      .then(v => { if (!cancelled) setLatest(v); })
      .catch(() => { /* No build available -- button just shows download */ })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => {
      cancelled = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('landjet-ext-ready', onReady as EventListener);
      }
    };
  }, []);

  const installed = !!installedVersion;
  const needsUpdate = installed && !!latest && isOlder(installedVersion, latest.version);

  return { loading, installed, installedVersion, latest, needsUpdate };
}
