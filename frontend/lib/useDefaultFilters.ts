'use client';

import { useEffect, useState } from 'react';
import type { AdminFilters } from '@/components/AdminFilterBar';

interface UserProfileResponse {
  user: {
    id: string;
    email: string;
    role: string;
    // 2026-06-14 refactor: per-user state list lives on default_filters.states.
    // The 3-value territory_default enum is deprecated and no longer exposed.
    default_filters?: { states?: string[]; [k: string]: unknown };
  };
}

/**
 * Returns the filter state to pre-apply on a page mount, based on the
 * logged-in user's `default_filters.states`. Returns undefined until the
 * profile fetch resolves so the caller can avoid an initial render with
 * the wrong scope.
 *
 * Empty states array = sees all (Ryan's mental model after the 2026-06-14
 * phone call). Percy gets `['TX']`, Iowa owner gets `['IA']`, etc.
 *
 * Consumers:
 *   const initial = useDefaultFilters();
 *   const [filters, setFilters] = useState<AdminFilters>({});
 *   useEffect(() => { if (initial) setFilters(initial); }, [initial]);
 */
export function useDefaultFilters(): AdminFilters | undefined {
  const [filters, setFilters] = useState<AdminFilters | undefined>(undefined);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) { setFilters({}); return; }

    (async () => {
      try {
        const r = await fetch('/api/users/me/profile', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) { setFilters({}); return; }
        const data = await r.json() as UserProfileResponse;
        const raw = data.user.default_filters?.states;
        const states = Array.isArray(raw) ? raw.filter((s): s is string => typeof s === 'string') : [];
        const seed: AdminFilters = { states };
        setFilters(seed);
      } catch {
        setFilters({});
      }
    })();
  }, []);

  return filters;
}
