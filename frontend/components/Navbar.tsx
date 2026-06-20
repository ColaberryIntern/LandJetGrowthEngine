'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const PRIMARY_ITEMS = [
  { href: '/outreach', label: 'Outreach' },
  { href: '/campaigns', label: 'Campaigns' },
  { href: '/inbound', label: 'Inbound' },
  { href: '/reservations', label: 'Reservations' },
  { href: '/quote-tester', label: 'Quote Tester' },
  { href: '/agents', label: 'Agents' },
];

const ADMIN_ITEMS = [
  { href: '/activity', label: 'Activity' },
  { href: '/incidents', label: 'Incidents' },
  { href: '/integrations', label: 'Integrations' },
  { href: '/qa', label: 'QA' },
  { href: '/performance', label: 'Performance' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/infrastructure', label: 'Infrastructure' },
  { href: '/system', label: 'System' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/docs', label: 'API Docs' },
  { href: '/logs', label: 'Audit Logs' },
  { href: '/deployments', label: 'Deployments' },
];

export default function Navbar() {
  const pathname = usePathname();
  const [adminOpen, setAdminOpen] = useState(false);
  const [me, setMe] = useState<{ name: string; states: string[] } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load the signed-in user once so the nav can show who is logged in + their
  // territory (personalization for account managers like Percy).
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) return;
    (async () => {
      try {
        const r = await fetch('/api/users/me/profile', { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) return;
        const d = await r.json();
        const u = d.user || {};
        const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || 'Account';
        const states = Array.isArray(u.default_filters?.states) ? u.default_filters.states : [];
        setMe({ name, states });
      } catch { /* non-fatal: nav still renders without the chip */ }
    })();
  }, []);

  // Close dropdown on route change
  useEffect(() => { setAdminOpen(false); }, [pathname]);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setAdminOpen(false);
      }
    }
    if (adminOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [adminOpen]);

  const isAdminPage = ADMIN_ITEMS.some(item => pathname.startsWith(item.href));

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-5xl px-6">
        <div className="flex h-14 items-center justify-between">
          <Link href="/" className="text-lg font-semibold tracking-tight text-gray-900">
            LandJet Growth Engine
          </Link>
          <div className="flex gap-1 items-center">
            {PRIMARY_ITEMS.map(({ href, label }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  {label}
                </Link>
              );
            })}

            {/* Admin dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setAdminOpen(!adminOpen)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isAdminPage
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                Admin
                <span className="ml-1 text-xs">{adminOpen ? '\u25B2' : '\u25BC'}</span>
              </button>

              {adminOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg z-50">
                  {ADMIN_ITEMS.map(({ href, label }) => {
                    const active = pathname.startsWith(href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        className={`block px-4 py-2 text-sm transition-colors ${
                          active
                            ? 'bg-gray-100 text-gray-900 font-medium'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                      >
                        {label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Signed-in user + territory */}
            {me && (
              <div className="ml-2 flex items-center gap-2 border-l border-gray-200 pl-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
                  {me.name.split(' ').filter(Boolean).map(s => s[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div className="leading-tight">
                  <div className="text-sm font-medium text-gray-900">{me.name}</div>
                  <div className="text-[11px] text-gray-500">
                    {me.states.length ? `📍 ${me.states.join(', ')}` : 'All regions'}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
