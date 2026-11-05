'use client';

import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { ChevronDown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fetchNamedBallots, type NamedBallot } from '@/lib/use-live-session';
import { TallyBar, VOTE_RESULT_LABEL, RESULT_TONE } from '@/components/session/tally';
import type { BallotChoice, Vote } from '@/types/database';

const GROUPS: { choice: BallotChoice; title: string; tone: string }[] = [
  { choice: 'for', title: 'Za', tone: 'text-emerald-300' },
  { choice: 'against', title: 'Przeciw', tone: 'text-red-300' },
  { choice: 'abstain', title: 'Wstrzymali się', tone: 'text-zinc-300' },
];

/** Who voted how in a closed OPEN vote, grouped by choice. */
export function NamedBreakdown({ voteId, size = 'sm' }: { voteId: string; size?: 'sm' | 'lg' }) {
  const [rows, setRows] = useState<{ voteId: string; ballots: NamedBallot[] } | null>(null);
  useEffect(() => {
    let live = true;
    fetchNamedBallots(createClient(), voteId).then((ballots) => { if (live) setRows({ voteId, ballots }); });
    return () => { live = false; };
  }, [voteId]);
  if (!rows || rows.voteId !== voteId) return null;
  if (!rows.ballots.length) return <p className="text-[13px] text-zinc-500">Nikt nie oddał głosu.</p>;
  const lg = size === 'lg';
  return (
    <div className={clsx('grid gap-3', lg ? 'grid-cols-3 gap-4' : 'grid-cols-1 sm:grid-cols-3')}>
      {GROUPS.map((g) => {
        const names = rows.ballots.filter((b) => b.choice === g.choice).map((b) => b.name);
        return (
          <div key={g.choice} className={clsx('rounded-2xl bg-zinc-900/60 ring-1 ring-zinc-800', lg ? 'px-6 py-5' : 'px-3.5 py-3')}>
            <div className={clsx('font-semibold', lg ? 'text-xl' : 'text-[13px]', g.tone)}>
              {g.title} <span className="tabular-nums text-zinc-500">({names.length})</span>
            </div>
            {names.length ? (
              <ul className={clsx('mt-1.5 space-y-0.5 text-zinc-300', lg ? 'text-xl' : 'text-[13px]')}>
                {names.map((n, i) => <li key={`${n}-${i}`} className="[overflow-wrap:anywhere]">{n}</li>)}
              </ul>
            ) : <div className={clsx('mt-1.5 text-zinc-600', lg ? 'text-xl' : 'text-[13px]')}>-</div>}
          </div>
        );
      })}
    </div>
  );
}

/** Result of a just-closed motion vote: numbers first, then who voted how (open votes). */
export function ClosedVoteCard({ vote, eligible }: { vote: Vote; eligible: number }) {
  const result = vote.result ?? 'rejected';
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="truncate text-[13px] font-semibold uppercase tracking-wide text-zinc-400">
          Wynik głosowania {vote.vote_type === 'secret' ? 'tajnego' : 'jawnego'}
        </h2>
        <span className={clsx('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium', RESULT_TONE[result])}>
          {VOTE_RESULT_LABEL[result]}
        </span>
      </div>
      <p className="mb-4 text-[17px] font-semibold leading-snug text-zinc-100 [overflow-wrap:anywhere]">
        {vote.title.replace(/^Głosowanie:\s*/i, '')}
      </p>
      <div className="space-y-3">
        <TallyBar label="ZA" count={vote.votes_for} total={eligible} tone="for" />
        <TallyBar label="PRZECIW" count={vote.votes_against} total={eligible} tone="against" />
        <TallyBar label="WSTRZYMAŁO SIĘ" count={vote.votes_abstain} total={eligible} tone="abstain" />
      </div>
      {vote.vote_type === 'open' && (
        <div className="mt-5">
          <h3 className="mb-2 text-[13px] font-medium text-zinc-400">Kto jak głosował</h3>
          <NamedBreakdown voteId={vote.id} />
        </div>
      )}
    </div>
  );
}

/** Collapsible "who voted how" for a closed open vote in a compact list row. */
export function NamedBreakdownToggle({ voteId }: { voteId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="press inline-flex h-8 items-center gap-1 rounded-xl px-2 text-[13px] text-indigo-300 hover:bg-zinc-800/50">
        Kto jak głosował <ChevronDown className={clsx('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="mt-2"><NamedBreakdown voteId={voteId} /></div>}
    </div>
  );
}
