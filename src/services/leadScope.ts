/**
 * Per-user lead scope enforcement.
 *
 * Area scoping was a UI-only default (useDefaultFilters seeds the logged-in
 * user's states into the filter bar), but the lead list API took `states`
 * straight from the query string. So Percy (TX) could clear the filter and pull
 * IA leads, and Grant (IA) could see TX. This module computes the EFFECTIVE
 * states server-side from the authenticated user's allowed scope, so an
 * out-of-area request is clamped, not honored.
 *
 * Rule (empty allowed = sees all, matching the 2026-06-14 model):
 *   allowed empty/undefined            -> honor the request as-is (Ryan: all)
 *   allowed set, no request            -> the user's full allowed scope
 *   allowed set, request overlaps      -> the overlap only
 *   allowed set, request disjoint      -> the user's full allowed scope
 *                                         (never widen to all, never show none)
 */

import { User } from '../models/User';
import { logger } from '../config/logger';
import { buildStatesPattern } from './leadService';

function norm(states: string[] | undefined | null): string[] {
  if (!Array.isArray(states)) return [];
  const out: string[] = [];
  for (const s of states) {
    if (typeof s !== 'string') continue;
    const code = s.trim().toUpperCase();
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

/**
 * Compute the states a request is actually allowed to read. Pure.
 * Returns undefined when there is no restriction (so the caller adds no state
 * predicate), else a non-empty array.
 */
export function effectiveStates(
  allowed: string[] | undefined,
  requested: string[] | undefined,
): string[] | undefined {
  const a = norm(allowed);
  if (a.length === 0) {
    // No per-user restriction: honor whatever was requested (may be undefined).
    const r = norm(requested);
    return r.length ? r : undefined;
  }
  const r = norm(requested);
  if (r.length === 0) return a;
  const overlap = r.filter(s => a.includes(s));
  return overlap.length ? overlap : a;
}

/**
 * Whether a single lead's state is within an allowed scope. Pure.
 * Empty allowed = unrestricted (true). A scoped user does NOT see a
 * null/blank-state lead (consistent with the list, whose state predicate
 * excludes nulls) -- isolation over convenience. Matches both the 2-letter
 * code and the full state name, case-insensitively.
 */
export function isStateInScope(allowed: string[] | undefined, state: string | null | undefined): boolean {
  const a = norm(allowed);
  if (a.length === 0) return true;
  if (!state || typeof state !== 'string' || !state.trim()) return false;
  return new RegExp(buildStatesPattern(a), 'i').test(state.trim());
}

// --- allowed-states accessor (cached, DB-backed) --------------------------

const _cache = new Map<string, { states: string[]; expiresAt: number }>();
const CACHE_TTL = 30_000;

export function invalidateUserScopeCache(userId?: string): void {
  if (userId) _cache.delete(userId);
  else _cache.clear();
}

/**
 * The states an authenticated user is allowed to see. Empty array = all.
 * Cached briefly so the per-request lookup is cheap. Fails OPEN to "no
 * restriction" only on a hard DB error (logged) so a transient DB blip cannot
 * lock the whole team out of their queues; a missing user returns [] (all),
 * since auth already proved the token.
 */
export async function getUserAllowedStates(userId: string): Promise<string[]> {
  const hit = _cache.get(userId);
  if (hit && Date.now() < hit.expiresAt) return hit.states;
  try {
    const user = await User.findByPk(userId, { attributes: ['default_filters'] });
    const raw = (user?.default_filters as { states?: unknown } | undefined)?.states;
    const states = norm(Array.isArray(raw) ? (raw as string[]) : []);
    _cache.set(userId, { states, expiresAt: Date.now() + CACHE_TTL });
    return states;
  } catch (e) {
    logger.warn('getUserAllowedStates failed, treating as unrestricted', {
      userId, error: (e as Error).message,
    });
    return [];
  }
}
