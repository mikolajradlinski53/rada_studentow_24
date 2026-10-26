'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Session } from '@/types/database';

/** mm:ss remaining until an ISO target; null once elapsed. */
export function useCountdown(targetIso: string | null): string | null {
  // "now" lives in state (ticked by the interval) so render stays pure.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!targetIso) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const i = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(i); };
  }, [targetIso]);

  if (!targetIso || now === null) return null;
  const ms = new Date(targetIso).getTime() - now;
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
    <div className="flex items-center justify-between rounded-2xl border border-amber-700/70 bg-amber-950/30 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-amber-300">Przerwa w obradach</span>
        <span className="rounded-full bg-amber-900/60 px-2.5 py-0.5 text-sm font-semibold tabular-nums text-amber-200">{remaining}</span>
      </div>
      {isChair && (
        <button onClick={endBreak} className="press h-9 shrink-0 rounded-xl border border-amber-700/60 px-3 text-[13px] font-medium text-amber-300 hover:bg-amber-950/40">Zakończ przerwę</button>
      )}
    </div>
  );
}
