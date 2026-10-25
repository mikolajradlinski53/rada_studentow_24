'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { clsx } from 'clsx';
import { Bell, BellOff, BellRing, X } from 'lucide-react';
import {
  currentSubscription, disablePush, enablePush, pushBaseState, subscribeNoop, type PushSupport,
} from '@/lib/push-client';

type State = 'loading' | PushSupport | 'denied' | 'off' | 'on';
type DeviceState = 'loading' | 'on' | 'off' | 'denied';

function usePushState() {
  // null during SSR/hydration → renders as "loading" on both sides.
  const base = useSyncExternalStore(subscribeNoop, pushBaseState, () => null);
  const [device, setDevice] = useState<DeviceState>('loading');

  useEffect(() => {
    if (base !== 'supported') return;
    currentSubscription()
      .then((sub) => setDevice(sub && Notification.permission === 'granted' ? 'on' : 'off'))
      .catch(() => setDevice('off'));
  }, [base]);

  const state: State = base === null ? 'loading' : base !== 'supported' ? base : device;
  return [state, setDevice] as const;
}

/** Full settings card (profile page). */
export function NotificationSettings() {
  const [state, setState] = usePushState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const turnOn = async () => {
    setBusy(true); setError(null);
    try {
      await enablePush();
      setState('on');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się włączyć powiadomień.');
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') setState('denied');
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true); setError(null);
    try {
      await disablePush();
      setState('off');
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification('🗳️ Głosowanie jawne otwarte', {
      body: 'Tak będzie wyglądać powiadomienie o głosowaniu.',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: 'rs24-test',
    });
  };

  const description: Record<State, string> = {
    loading: 'Sprawdzanie…',
    supported: 'Sprawdzanie…',
    on: 'To urządzenie dostaje powiadomienia o otwarciu posiedzenia i każdego głosowania.',
    off: 'Dostaniesz powiadomienie, gdy prowadzący otworzy posiedzenie lub głosowanie, nawet przy zablokowanym telefonie.',
    denied: 'Powiadomienia są zablokowane dla tej strony. Odblokuj je w ustawieniach przeglądarki lub telefonu, a potem odśwież stronę.',
    'needs-install': 'Na iPhonie powiadomienia działają tylko w zainstalowanej aplikacji: Udostępnij → Do ekranu początkowego, potem otwórz ją z ikony.',
    unsupported: 'Ta przeglądarka nie obsługuje powiadomień push. Spróbuj w Chrome, Safari (iOS 16.4+) albo Firefox.',
    unconfigured: 'Powiadomienia nie są jeszcze skonfigurowane na serwerze (brak kluczy VAPID).',
  };

  const on = state === 'on';

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-start gap-3">
        <div className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
          on ? 'bg-emerald-900/40 text-emerald-300' : 'bg-zinc-800 text-zinc-400')}>
          {on ? <BellRing className="h-5 w-5" /> : state === 'denied' ? <BellOff className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-zinc-100">Powiadomienia na tym urządzeniu</h2>
            {on && <span className="rounded-full bg-emerald-900/50 px-2 py-0.5 text-[11px] font-medium text-emerald-300">Włączone</span>}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">{description[state]}</p>
        </div>
      </div>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      {(state === 'off' || state === 'on') && (
        <div className="mt-4 flex flex-wrap gap-2">
          {state === 'off' ? (
            <button onClick={turnOn} disabled={busy}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-transform hover:bg-indigo-500 active:scale-[0.98] disabled:opacity-50 sm:flex-none">
              {busy ? 'Włączanie…' : 'Włącz powiadomienia'}
            </button>
          ) : (
            <>
              <button onClick={test}
                className="flex-1 rounded-2xl border border-zinc-700 px-4 py-2.5 text-sm text-zinc-200 transition-colors hover:border-zinc-500 sm:flex-none">
                Pokaż próbne
              </button>
              <button onClick={turnOff} disabled={busy}
                className="flex-1 rounded-2xl border border-zinc-800 px-4 py-2.5 text-sm text-zinc-400 transition-colors hover:border-red-900 hover:text-red-400 disabled:opacity-50 sm:flex-none">
                {busy ? 'Wyłączanie…' : 'Wyłącz'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const NUDGE_KEY = 'rs24-push-nudge-dismissed';

function readNudgeDismissed() {
  try { return localStorage.getItem(NUDGE_KEY) === '1'; } catch { return false; }
}

/** Slim one-tap nudge (live session / sessions list) — only when it can actually work. */
export function NotificationNudge() {
  const [state, setState] = usePushState();
  const storedDismiss = useSyncExternalStore(subscribeNoop, readNudgeDismissed, () => true);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  if (storedDismiss || dismissed || state !== 'off') return null;

  const dismiss = () => {
    try { localStorage.setItem(NUDGE_KEY, '1'); } catch {}
    setDismissed(true);
  };

  const turnOn = async () => {
    setBusy(true);
    try { await enablePush(); setState('on'); } catch { setState(Notification.permission === 'denied' ? 'denied' : 'off'); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 py-2.5 pl-3 pr-2">
      <Bell className="h-4 w-4 shrink-0 text-indigo-300" />
      <p className="min-w-0 flex-1 text-xs leading-snug text-zinc-300">Dostawaj powiadomienie, gdy otworzy się głosowanie.</p>
      <button onClick={turnOn} disabled={busy}
        className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 active:scale-95 disabled:opacity-50">
        {busy ? '…' : 'Włącz'}
      </button>
      <button onClick={dismiss} aria-label="Nie teraz"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
