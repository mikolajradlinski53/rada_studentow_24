'use client';

import { useEffect } from 'react';

/**
 * Keeps the phone screen on while `active` (e.g. during a live sitting, so a
 * member doesn't miss a vote to auto-lock). The browser drops the lock when the
 * tab is hidden, so it is re-acquired on return. No-op where unsupported.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const l = await navigator.wakeLock.request('screen');
        if (cancelled) l.release();
        else lock = l;
      } catch {
        // Denied (battery saver, iframe…) — harmless.
      }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') acquire(); };

    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, [active]);
}
