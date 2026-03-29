'use client';

import { useEffect } from 'react';
import { login } from '@/lib/api';

export default function AutoLogin() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem('token')) return;

    login('admin@landjet.com', 'Admin123!')
      .then((res) => {
        localStorage.setItem('token', res.token);
      })
      .catch(() => {
        // Silent fail — backend may not be running
      });
  }, []);

  return null;
}
