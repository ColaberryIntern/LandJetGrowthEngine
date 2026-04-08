'use client';

import { useState, useEffect } from 'react';
import { getHealth } from '@/lib/api';

interface HealthData {
  status: string;
  db: string;
  uptime: number;
}

const ENGAGEMENT_FEATURES = [
  { name: 'Contact Import', description: 'Import contacts from CSV files into campaigns', status: 'active', type: 'Data Pipeline' },
  { name: 'Engagement Tracking', description: 'Track opens, clicks, replies, and page visits per lead', status: 'active', type: 'Analytics' },
  { name: 'Hot Lead Detection', description: '2+ opens or any click flags lead as hot', status: 'active', type: 'Intelligence' },
  { name: 'In-App Notifications', description: 'Real-time alerts for admin when engagement signals detected', status: 'active', type: 'Notifications' },
  { name: 'Email Notifications', description: 'Draft-ready and response alerts via email', status: 'planned', type: 'Notifications' },
  { name: 'Feature Tour', description: 'Guided tour of system features for new users', status: 'planned', type: 'Onboarding' },
];

const ENGAGEMENT_SIGNALS = [
  { signal: 'Email Opened', weight: '+10 per open', threshold: '2+ opens = warming' },
  { signal: 'Link Clicked', weight: '+20 per click', threshold: 'Any click = hot' },
  { signal: 'Email Replied', weight: '+40', threshold: 'Any reply = active' },
  { signal: 'Pricing Page View', weight: '+25', threshold: 'Immediate hot flag' },
  { signal: 'Strategy Call Page', weight: '+25', threshold: 'Immediate hot flag' },
  { signal: 'Meeting Booked', weight: '+50', threshold: 'Escalate to CEO' },
];

export default function EngagementPage() {
  const [isUp, setIsUp] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getHealth()
      .then((res) => setIsUp((res as HealthData).status === 'ok'))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const activeCount = ENGAGEMENT_FEATURES.filter(f => f.status === 'active').length;
  const plannedCount = ENGAGEMENT_FEATURES.filter(f => f.status === 'planned').length;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Engagement Features</h1>
      <p className="mt-1 text-sm text-gray-500">Outreach tracking, notifications, and lead engagement intelligence</p>

      {/* Summary Cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Active Features</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">{activeCount}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Planned</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{plannedCount}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Engagement Agent</p>
          <p className={`mt-1 text-2xl font-semibold ${isUp ? 'text-emerald-600' : 'text-gray-400'}`}>
            {loading ? '—' : isUp ? 'Active' : 'Offline'}
          </p>
        </div>
      </div>

      {/* Feature List */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Features</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3">Feature</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Description</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {ENGAGEMENT_FEATURES.map((f) => (
                <tr key={f.name} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-5 py-3 font-medium text-gray-900">{f.name}</td>
                  <td className="px-5 py-3 text-gray-500">{f.type}</td>
                  <td className="px-5 py-3 text-gray-500">{f.description}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      f.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {f.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Engagement Signals */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Engagement Scoring Rules</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3">Signal</th>
                <th className="px-5 py-3">Weight</th>
                <th className="px-5 py-3">Threshold</th>
              </tr>
            </thead>
            <tbody>
              {ENGAGEMENT_SIGNALS.map((s) => (
                <tr key={s.signal} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-5 py-3 font-medium text-gray-900">{s.signal}</td>
                  <td className="px-5 py-3 text-gray-500">{s.weight}</td>
                  <td className="px-5 py-3 text-gray-500">{s.threshold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
