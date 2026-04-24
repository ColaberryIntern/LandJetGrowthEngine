'use client';

import { useEffect } from 'react';
import { login } from '@/lib/api';

export default function AutoLogin() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    async function ensureToken() {
      const existing = localStorage.getItem('token');

      if (existing) {
        try {
          const payload = JSON.parse(atob(existing.split('.')[1]));
          if (payload.exp * 1000 > Date.now()) return; // still valid
        } catch {}
        localStorage.removeItem('token');
      }

      try {
        const res = await login('admin@landjet.com', 'Admin123!');
        localStorage.setItem('token', res.token);
        // Reload so all components pick up the new token
        window.location.reload();
      } catch {
        // Silent fail -- backend may not be running
      }
    }

    // Small delay to let page components attempt their own auth first
    const timer = setTimeout(ensureToken, 500);
    return () => clearTimeout(timer);
  }, []);

  return null;
}
