'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import { Check } from 'lucide-react';
import { castCount } from '@/lib/use-live-session';
import { choiceLabels } from '@/components/session/tally';
import type { Vote, BallotChoice, Mandate } from '@/types/database';

const CHOICE_STYLE: Record<BallotChoice, string> = {
  for: 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/30',
  against: 'bg-red-600 hover:bg-red-500 shadow-red-900/30',
  abstain: 'bg-zinc-600 hover:bg-zinc-500 shadow-black/20',
};

// Active motion vote. Casting is two-step (pick → confirm): a ballot can't be
// changed, and a stray thumb on a phone shouldn't decide it.
export function MotionVoteCard({
  vote, voterIds, myBallot, myMandate, isCheckedIn, isChair, presentCount, nameByMandate, onCast, onClose,
}: {
  vote: Vote;
  /** Who already voted (open votes only) - never how. */
  voterIds: string[];
  myBallot: BallotChoice | null;
  myMandate: Mandate | null;
  isCheckedIn: boolean;
  isChair: boolean;
  presentCount: number;
  nameByMandate: Map<string, string>;
  onCast: (choice: BallotChoice) => Promise<boolean>;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<BallotChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const cast = castCount(vote);
  const CHOICE_LABEL = choiceLabels(vote.vote_kind);
  const what = vote.vote_kind === 'opinion' ? 'Opiniowanie' : 'Głosowanie';

  const confirm = async () => {
    if (!picked) return;
    setBusy(true);
    const ok = await onCast(picked);
    setBusy(false);
    if (!ok) setPicked(null);
  };

  return (
    <div className="rounded-2xl border-2 border-indigo-600 bg-indigo-950/20 p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="h-2 w-2 shrink-0 rounded-full bg-indigo-400 animate-pulse" />
          <h2 className="truncate text-[13px] font-semibold uppercase tracking-wide text-indigo-300">
            {what} {vote.vote_type === 'secret' ? 'tajne' : 'jawne'}
          </h2>
        </div>
        <span className="shrink-0 whitespace-nowrap text-[13px] tabular-nums text-zinc-400">{cast} / {presentCount} głosów</span>
      </div>
      <p className="mb-4 text-[17px] font-semibold leading-snug text-zinc-100 [overflow-wrap:anywhere]">{vote.title.replace(/^(Głosowanie|Opinia):\s*/i, '')}</p>

      {/* Live: turnout only. The breakdown appears when the vote is closed. */}
      <div className="rounded-2xl border border-indigo-800/60 bg-indigo-950/30 px-4 py-5 text-center">
        <div className="text-4xl font-semibold tabular-nums text-zinc-100">{cast}</div>
        <div className="mt-1 text-xs text-zinc-400">
          oddanych głosów · wynik {vote.vote_type === 'open' ? 'i lista imienna ' : ''}po zamknięciu
        </div>
        <div className="mx-auto mt-3 h-1.5 max-w-xs overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full rounded-full bg-indigo-500 transition-all duration-500 ease-out"
            style={{ width: `${presentCount > 0 ? Math.min(100, Math.round((cast / presentCount) * 100)) : 0}%` }} />
        </div>
      </div>
      {vote.vote_type === 'open' && voterIds.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-[12px] text-zinc-500">Zagłosowali:</div>
          <div className="flex flex-wrap gap-1.5">
            {voterIds.map((id) => (
              <span key={id} className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2.5 py-1 text-[13px] text-zinc-300">
                <Check className="h-3 w-3 text-indigo-300" strokeWidth={3} /> {nameByMandate.get(id) ?? '-'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Ballot — big thumb targets, stacked on phones */}
      {myMandate && isCheckedIn && !myBallot && !picked && (
        <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {(['for', 'against', 'abstain'] as const).map((c) => (
            <button key={c} onClick={() => { setPicked(c); navigator.vibrate?.(15); }}
              className={clsx('rounded-xl py-5 text-base font-semibold text-white shadow-lg transition-transform active:scale-95', CHOICE_STYLE[c])}>
              {CHOICE_LABEL[c]}
            </button>
          ))}
        </div>
      )}

      {myMandate && isCheckedIn && !myBallot && picked && (
        <div className="mt-5 rounded-xl border border-zinc-700 bg-zinc-950/60 p-4">
          <p className="text-center text-sm text-zinc-400">
            Oddajesz głos{vote.vote_type === 'secret' ? ' tajny' : ''}:
          </p>
          <p className={clsx('mt-1 text-center text-2xl font-bold tracking-tight',
            picked === 'for' ? 'text-emerald-400' : picked === 'against' ? 'text-red-400' : 'text-zinc-200')}>
            {CHOICE_LABEL[picked]}
          </p>
          <p className="mt-1 text-center text-xs text-zinc-500">Głosu nie można później zmienić.</p>
          <div className="mt-4 grid grid-cols-[1fr_2fr] gap-2.5">
            <button onClick={() => setPicked(null)} disabled={busy}
              className="rounded-xl border border-zinc-700 py-4 text-sm font-medium text-zinc-300 transition-transform active:scale-95 disabled:opacity-50">
              Zmień
            </button>
            <button onClick={confirm} disabled={busy}
              className={clsx('rounded-xl py-4 text-base font-semibold text-white shadow-lg transition-transform active:scale-95 disabled:opacity-60', CHOICE_STYLE[picked])}>
              {busy ? 'Wysyłanie…' : 'Potwierdzam'}
            </button>
          </div>
        </div>
      )}

      {myBallot && (
        <div className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-indigo-950/40 py-3 text-sm text-indigo-200">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500 text-[11px] text-white">✓</span>
          Głos oddany
          {vote.vote_type === 'open' && (
            <span className="text-zinc-400">({CHOICE_LABEL[myBallot].toLowerCase()})</span>
          )}
        </div>
      )}
      {myMandate && !isCheckedIn && <p className="mt-4 text-center text-sm text-zinc-500">Potwierdź obecność, aby głosować.</p>}

      {isChair && (
        <button onClick={onClose}
          className="mt-4 w-full rounded-2xl border border-indigo-600 py-2.5 text-sm text-indigo-300 hover:bg-indigo-900/30 transition-colors">
          Zamknij głosowanie i pokaż wynik
        </button>
      )}
    </div>
  );
}
