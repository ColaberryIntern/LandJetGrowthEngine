'use client';

import { useEffect, useState } from 'react';
import { getExtensionVersion, ExtensionVersion } from './api';

// Shape the extension's marker.js sets on window. Kept loose so old extension
// versions that don't set every field still parse.
interface ExtensionMarker {
  installed: boolean;
  version?: string;
  id?: string;
}

declare global {
  interface Window {
    __LANDJET_EXT__?: ExtensionMarker;
  }
}

export interface ExtensionState {
  loading: boolean;
  installed: boolean;
  installedVersion: string | null;
  latest: ExtensionVersion | null;
  needsUpdate: boolean;
}

// Compares two semver strings (X.Y.Z). Returns true if `a` < `b`.
function isOlder(a: string | null, b: string): boolean {
  if (!a) return true;
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0);
  }
  return false;
}

// Detect the LandJet Chrome extension. The extension's marker.js content
// script runs at document_start on growth.landjet.com and sets
// `window.__LANDJET_EXT__` + dispatches `landjet-ext-ready`. We check both
// (current value + future event) to handle the race where React mounts
// before the extension script has injected.
export function useExtensionInstalled(): ExtensionState {
  const [installedVersion, setInstalledVersion] = useState<string | null>(null);
  const [latest, setLatest] = useState<ExtensionVersion | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // 1. Synchronous check -- already injected?
    if (typeof window !== 'undefined' && window.__LANDJET_EXT__?.installed) {
      setInstalledVersion(window.__LANDJET_EXT__.version || 'unknown');
    } else if (typeof document !== 'undefined') {
      // Fallback: <html data-landjet-ext-version="X.Y.Z">
      const attr = document.documentElement.getAttribute('data-landjet-ext-version');
      if (attr) setInstalledVersion(attr);
    }

    // 2. Listen for the ready event in case the script hasn't fired yet.
    function onReady(e: Event) {
      const detail = (e as CustomEvent<ExtensionMarker>).detail;
      if (!cancelled && detail?.version) setInstalledVersion(detail.version);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('landjet-ext-ready', onReady as EventListener);
    }

    // 3. Fetch the current available version so we can also surface
    //    "update available" if the installed copy is behind.
    getExtensionVersion()
      .then(v => { if (!cancelled) setLatest(v); })
      .catch(() => { /* No build available, button just shows download attempt */ })
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
