'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Download, Share, SquarePlus, X } from 'lucide-react';
import { isIOS, isStandalone, subscribeNoop } from '@/lib/push-client';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'rs24-install-dismissed-at';
const DISMISS_DAYS = 14;

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

/**
 * "Add to home screen" card for phones. Android/Chromium gets a one-tap install
 * via beforeinstallprompt; iOS Safari gets the Share → Add to Home Screen steps
 * (it has no install API, and push notifications only work once installed).
 */
function eligibleForPrompt() {
  const mobile = window.matchMedia('(max-width: 767px)').matches || navigator.maxTouchPoints > 1;
  return mobile && !isStandalone() && !recentlyDismissed();
}

export function InstallPrompt() {
  // Browser-only facts; false during SSR so server and first client render match.
  const eligible = useSyncExternalStore(subscribeNoop, eligibleForPrompt, () => false);
  const ios = useSyncExternalStore(subscribeNoop, isIOS, () => false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (!eligible || ios) return;
    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep Chrome's mini-bar away; we show our own card
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setClosed(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [eligible, ios]);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setClosed(true);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === 'accepted') setClosed(true);
  };

  const mode = !eligible || closed ? 'hidden' : ios ? 'ios' : deferred ? 'android' : 'hidden';
  if (mode === 'hidden') return null;

  return (
    <div className="relative mb-6 overflow-hidden rounded-xl border border-indigo-800/60 bg-gradient-to-br from-indigo-950/70 to-zinc-900 p-4">
      <button
        onClick={dismiss}
        aria-label="Zamknij"
        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3 pr-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-100">Zainstaluj aplikację na telefonie</div>
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
            Ikona na ekranie głównym, pełny ekran i powiadomienia o otwartych głosowaniach.
          </p>
        </div>
      </div>

      {mode === 'android' && (
        <button
          onClick={install}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white transition-transform hover:bg-indigo-500 active:scale-[0.98]"
        >
          <Download className="h-4 w-4" /> Zainstaluj
        </button>
      )}

      {mode === 'ios' && (
        <ol className="mt-4 space-y-2 text-sm text-zinc-300">
          <li className="flex items-center gap-3 rounded-lg bg-zinc-900/70 px-3 py-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">1</span>
            <span>Stuknij <Share className="mx-0.5 inline h-4 w-4 -translate-y-px text-indigo-300" /> <b className="font-medium text-zinc-100">Udostępnij</b> na dole Safari</span>
          </li>
          <li className="flex items-center gap-3 rounded-lg bg-zinc-900/70 px-3 py-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">2</span>
            <span>Wybierz <SquarePlus className="mx-0.5 inline h-4 w-4 -translate-y-px text-indigo-300" /> <b className="font-medium text-zinc-100">Do ekranu początkowego</b></span>
          </li>
          <li className="flex items-center gap-3 rounded-lg bg-zinc-900/70 px-3 py-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">3</span>
            <span>Otwórz <b className="font-medium text-zinc-100">Rada24</b> z ekranu i włącz powiadomienia</span>
          </li>
        </ol>
      )}
    </div>
  );
}
