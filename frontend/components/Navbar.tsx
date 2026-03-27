'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/campaigns', label: 'Campaigns' },
  { href: '/drafts', label: 'Drafts' },
  { href: '/activity', label: 'Activity' },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-5xl px-6">
        <div className="flex h-14 items-center justify-between">
          <Link href="/" className="text-lg font-semibold tracking-tight text-gray-900">
            LandJet Growth Engine
          </Link>
          <div className="flex gap-1">
            {NAV_ITEMS.map(({ href, label }) => {
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
          </div>
        </div>
      </div>
    </nav>
  );
}
