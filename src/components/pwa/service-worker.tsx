'use client';

import { useEffect } from 'react';
import { syncPush } from '@/lib/push-client';

/** Registers /sw.js once per page load and re-syncs this device's push subscription. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then(() => syncPush())
      .catch((err) => console.warn('Service worker registration failed:', err));
  }, []);
  return null;
}
