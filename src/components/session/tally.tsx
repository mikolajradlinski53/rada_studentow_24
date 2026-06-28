import { clsx } from 'clsx';
import type { Vote } from '@/types/database';

export const VOTE_RESULT_LABEL: Record<NonNullable<Vote['result']>, string> = {
  passed: 'Przyjęto',
  rejected: 'Odrzucono',
  no_quorum: 'Brak kworum',
};

export const RESULT_TONE: Record<NonNullable<Vote['result']>, string> = {
  passed: 'bg-emerald-900/50 text-emerald-300',
  rejected: 'bg-red-900/50 text-red-300',
  no_quorum: 'bg-amber-900/50 text-amber-300',
};

type Tone = 'for' | 'against' | 'abstain';

const TONE_BAR: Record<Tone, string> = {
  for: 'bg-emerald-500',
  against: 'bg-red-500',
  abstain: 'bg-zinc-500',
};
const TONE_TEXT: Record<Tone, string> = {
  for: 'text-emerald-300',
  against: 'text-red-300',
  abstain: 'text-zinc-300',
};

/** Animated horizontal tally bar. `size` controls the projector vs inline scale. */
export function TallyBar({
  label, count, total, tone, size = 'sm',
}: { label: string; count: number; total: number; tone: Tone; size?: 'sm' | 'lg' }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const lg = size === 'lg';
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className={clsx('font-medium', lg ? 'text-2xl' : 'text-xs', TONE_TEXT[tone])}>{label}</span>
        <span className={clsx('tabular-nums font-semibold', lg ? 'text-5xl text-zinc-100' : 'text-sm text-zinc-200')}>
          {count}
        </span>
      </div>
      <div className={clsx('mt-1 w-full overflow-hidden rounded-full bg-zinc-800', lg ? 'h-3' : 'h-1.5')}>
        <div
          className={clsx('h-full rounded-full transition-all duration-500 ease-out', TONE_BAR[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
