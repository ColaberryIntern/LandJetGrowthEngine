'use client';

import { useState, useEffect } from 'react';

interface Notification {
  id: string;
  subject: string;
  body: string;
  type: 'email' | 'in_app';
  status: 'pending' | 'sent' | 'read' | 'failed';
  created_at: string;
  read_at: string | null;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  async function fetchNotifications() {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = filter === 'unread' ? '?status=sent' : '';
      const res = await fetch(`/api/notifications${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setTotal(data.total || 0);
      }
    } catch {}
    setLoading(false);
  }

  async function markAsRead(id: string) {
    try {
      const token = localStorage.getItem('token');
      await fetch(`/api/notifications/${id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchNotifications();
    } catch {}
  }

  useEffect(() => { fetchNotifications(); }, [filter]);

  const unreadCount = notifications.filter(n => n.status !== 'read').length;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="mt-1 text-sm text-gray-500">System alerts and engagement notifications</p>
        </div>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
              {unreadCount} unread
            </span>
          )}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as 'all' | 'unread')}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
          >
            <option value="all">All</option>
            <option value="unread">Unread</option>
          </select>
        </div>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="py-8 text-center text-sm text-gray-400">Loading...</div>
        ) : notifications.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center">
            <p className="text-sm text-gray-500">No notifications</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`rounded-lg border bg-white p-4 transition-colors ${
                  n.status !== 'read' ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {n.status !== 'read' && <div className="h-2 w-2 rounded-full bg-blue-500" />}
                      <p className="font-medium text-gray-900">{n.subject}</p>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{n.body}</p>
                    <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                      <span>{new Date(n.created_at).toLocaleString()}</span>
                      <span className="rounded bg-gray-100 px-1.5 py-0.5">{n.type}</span>
                    </div>
                  </div>
                  {n.status !== 'read' && (
                    <button
                      onClick={() => markAsRead(n.id)}
                      className="ml-3 shrink-0 rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
