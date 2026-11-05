import { clsx } from 'clsx';
import type { Vote } from '@/types/database';

export const VOTE_RESULT_LABEL: Record<NonNullable<Vote['result']>, string> = {
  passed: 'Przyjęto',
  rejected: 'Odrzucono',
  no_quorum: 'Brak kworum',
  tie: 'Remis',
};

const OPINION_RESULT_LABEL: Record<NonNullable<Vote['result']>, string> = {
  passed: 'Opinia pozytywna',
  rejected: 'Opinia negatywna',
  no_quorum: 'Brak kworum',
  tie: 'Remis',
};

/** Result label for a vote: opinions read "opinia pozytywna / negatywna". */
export function resultLabel(vote: Pick<Vote, 'result' | 'vote_kind'>): string {
  const r = vote.result ?? 'rejected';
  return (vote.vote_kind === 'opinion' ? OPINION_RESULT_LABEL : VOTE_RESULT_LABEL)[r];
}

export const RESULT_TONE: Record<NonNullable<Vote['result']>, string> = {
  passed: 'bg-emerald-900/50 text-emerald-300',
  rejected: 'bg-red-900/50 text-red-300',
  no_quorum: 'bg-amber-900/50 text-amber-300',
  tie: 'bg-amber-900/50 text-amber-300',
};

/** Ballot labels: an opinion is given "pozytywnie / negatywnie". */
export function choiceLabels(kind: Vote['vote_kind']) {
  return kind === 'opinion'
    ? { for: 'POZYTYWNIE', against: 'NEGATYWNIE', abstain: 'WSTRZYMUJĘ SIĘ' }
    : { for: 'ZA', against: 'PRZECIW', abstain: 'WSTRZYMUJĘ SIĘ' };
}

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
