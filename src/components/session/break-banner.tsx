'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Session } from '@/types/database';

/** mm:ss remaining until an ISO target; null once elapsed. */
export function useCountdown(targetIso: string | null): string | null {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!targetIso) return;
    const i = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, [targetIso]);

  if (!targetIso) return null;
  const ms = new Date(targetIso).getTime() - Date.now();
  if (ms <= 0) return null;
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function BreakBanner({ session, isChair, sessionId }: { session: Session; isChair: boolean; sessionId: string }) {
  const remaining = useCountdown(session.on_break_until);
  const supabase = createClient();
  if (!remaining) return null;

  const endBreak = async () => {
    await supabase.from('sessions').update({ on_break_until: null }).eq('id', sessionId);
  };

  return (
    <div className="flex items-center justify-between rounded-lg border border-amber-700/70 bg-amber-950/30 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-amber-300">Przerwa w obradach</span>
        <span className="rounded-full bg-amber-900/60 px-2.5 py-0.5 text-sm font-semibold tabular-nums text-amber-200">{remaining}</span>
      </div>
      {isChair && (
        <button onClick={endBreak} className="text-xs text-amber-300/80 hover:text-amber-200 transition-colors">Zakończ przerwę</button>
      )}
    </div>
  );
}
