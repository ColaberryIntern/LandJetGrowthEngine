/**
 * Auth helpers shared across pages. Replaces the per-page ensureAuth()
 * functions that were auto-logging as admin@landjet.com (which made
 * every audit log entry attribute to "admin" regardless of who was
 * actually clicking).
 *
 * Usage:
 *   import { ensureAuth } from '@/lib/auth';
 *   ...
 *   await ensureAuth(); // redirects to /login if no valid token
 */

export function getValidToken(): string | null {
  if (typeof window === 'undefined') return null;
  const t = localStorage.getItem('token');
  if (!t) return null;
  try {
    const payload = JSON.parse(atob(t.split('.')[1]));
    if (payload.exp * 1000 > Date.now()) return t;
  } catch {
    /* fall through */
  }
  localStorage.removeItem('token');
  return null;
}

/**
 * Ensures the user has a valid token. Returns true if authenticated.
 * Returns false (and redirects to /login) if not.
 *
 * Pages should `await ensureAuth()` before fetching data. After redirect
 * the page won't continue executing in any meaningful way.
 */
export async function ensureAuth(): Promise<boolean> {
  if (typeof window === 'undefined') return true;
  if (getValidToken()) return true;
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/login?next=${next}`;
  return false;
}

export function logout(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('token');
  window.location.href = '/login';
}
