'use client';

import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Timer } from 'lucide-react';

/** Remaining speaking time for the current turn; counts into the negative once over. */
export function useSpeakerClock(calledAt: string | null | undefined, limitSeconds: number | null | undefined, extraSeconds = 0) {
  const [now, setNow] = useState<number | null>(null);
  const active = !!calledAt && !!limitSeconds;
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [active]);
  if (!active || now === null) return null;
  const left = Math.round((new Date(calledAt!).getTime() + (limitSeconds! + extraSeconds) * 1000 - now) / 1000);
  return { left, over: left < 0, warn: left >= 0 && left <= 30 };
}

export function fmtClock(seconds: number) {
  const s = Math.abs(seconds);
  return `${seconds < 0 ? '+' : ''}${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export function SpeakerTimer({
  calledAt, limitSeconds, extraSeconds, size = 'sm',
}: { calledAt: string | null; limitSeconds: number | null | undefined; extraSeconds?: number; size?: 'sm' | 'lg' }) {
  const clock = useSpeakerClock(calledAt, limitSeconds, extraSeconds ?? 0);
  if (!clock) return null;
  const lg = size === 'lg';
  return (
    <span
      role="timer"
      aria-label={clock.over ? 'Czas wypowiedzi przekroczony' : 'Pozostały czas wypowiedzi'}
      className={clsx('inline-flex items-center gap-1.5 rounded-full font-mono font-semibold tabular-nums',
        lg ? 'px-6 py-2 text-5xl' : 'px-2.5 py-0.5 text-[13px]',
        clock.over ? 'bg-red-500/15 text-red-300 ring-1 ring-red-500/40'
          : clock.warn ? 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40'
          : 'bg-zinc-800 text-zinc-200')}
    >
      <Timer className={lg ? 'h-10 w-10' : 'h-3.5 w-3.5'} />
      {fmtClock(clock.left)}
    </span>
  );
}
