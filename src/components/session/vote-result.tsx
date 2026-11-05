'use client';

import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { ChevronDown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fetchNamedBallots, type NamedBallot } from '@/lib/use-live-session';
import { TallyBar, RESULT_TONE, resultLabel, choiceLabels } from '@/components/session/tally';
import type { BallotChoice, Vote } from '@/types/database';

const GROUPS: { choice: BallotChoice; title: string; tone: string }[] = [
  { choice: 'for', title: 'Za', tone: 'text-emerald-300' },
  { choice: 'against', title: 'Przeciw', tone: 'text-red-300' },
  { choice: 'abstain', title: 'Wstrzymali się', tone: 'text-zinc-300' },
];
// Opinions group the same ballots as "pozytywnie / negatywnie".
const OPINION_TITLE: Record<BallotChoice, string> = { for: 'Pozytywnie', against: 'Negatywnie', abstain: 'Wstrzymali się' };

/** Who voted how in a closed OPEN vote, grouped by choice. */
export function NamedBreakdown({ voteId, size = 'sm', opinion = false }: { voteId: string; size?: 'sm' | 'lg'; opinion?: boolean }) {
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
              {opinion ? OPINION_TITLE[g.choice] : g.title} <span className="tabular-nums text-zinc-500">({names.length})</span>
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

/** The chair's casting vote on a tie (cast_deciding_vote, migration 033). */
export function DecidingVote({ vote, canDecide }: { vote: Vote; canDecide: boolean }) {
  const [busy, setBusy] = useState(false);
  const labels = choiceLabels(vote.vote_kind);
  if (vote.result !== 'tie') {
    if (!vote.deciding_vote) return null;
    return (
      <p className="mt-3 text-[13px] text-zinc-400">
        Remis rozstrzygnięty głosem przewodniczącego: <span className="font-medium text-zinc-200">{labels[vote.deciding_vote].toLowerCase()}</span>.
      </p>
    );
  }
  const decide = async (choice: 'for' | 'against') => {
    if (!confirm(`Głos rozstrzygający: ${labels[choice].toLowerCase()}. Nie można go zmienić.`)) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc('cast_deciding_vote', { p_vote_id: vote.id, p_choice: choice });
    if (error) alert('Nie udało się oddać głosu rozstrzygającego.');
    else await supabase.rpc('log_audit', { p_action: 'vote.decided', p_target_type: 'vote', p_target_id: vote.id, p_metadata: { choice } });
    setBusy(false);
  };
  return (
    <div className="mt-4 rounded-xl border border-amber-800/60 bg-amber-950/20 p-3.5">
      <p className="text-[14px] font-medium text-amber-200">Remis. Rozstrzyga głos przewodniczącego.</p>
      {canDecide ? (
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <button onClick={() => decide('for')} disabled={busy}
            className="press h-12 rounded-xl bg-emerald-600 text-[15px] font-semibold text-white disabled:opacity-50">{labels.for}</button>
          <button onClick={() => decide('against')} disabled={busy}
            className="press h-12 rounded-xl bg-red-600 text-[15px] font-semibold text-white disabled:opacity-50">{labels.against}</button>
        </div>
      ) : (
        <p className="mt-1 text-[13px] text-zinc-400">Wynik pojawi się po decyzji przewodniczącego.</p>
      )}
    </div>
  );
}

/** Result of a just-closed motion vote: numbers first, then who voted how (open votes). */
export function ClosedVoteCard({ vote, eligible, canDecide = false }: { vote: Vote; eligible: number; canDecide?: boolean }) {
  const result = vote.result ?? 'rejected';
  const labels = choiceLabels(vote.vote_kind);
  const kind = vote.vote_kind === 'opinion' ? 'opiniowania' : 'głosowania';
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="truncate text-[13px] font-semibold uppercase tracking-wide text-zinc-400">
          Wynik {kind} {vote.vote_type === 'secret' ? 'tajnego' : 'jawnego'}
        </h2>
        <span className={clsx('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium', RESULT_TONE[result])}>
          {resultLabel(vote)}
        </span>
      </div>
      <p className="mb-4 text-[17px] font-semibold leading-snug text-zinc-100 [overflow-wrap:anywhere]">
        {vote.title.replace(/^(Głosowanie|Opinia):\s*/i, '')}
      </p>
      <div className="space-y-3">
        <TallyBar label={labels.for} count={vote.votes_for} total={eligible} tone="for" />
        <TallyBar label={labels.against} count={vote.votes_against} total={eligible} tone="against" />
        <TallyBar label="WSTRZYMAŁO SIĘ" count={vote.votes_abstain} total={eligible} tone="abstain" />
      </div>
      <DecidingVote vote={vote} canDecide={canDecide} />
      {vote.vote_type === 'open' && (
        <div className="mt-5">
          <h3 className="mb-2 text-[13px] font-medium text-zinc-400">Kto jak głosował</h3>
          <NamedBreakdown voteId={vote.id} opinion={vote.vote_kind === 'opinion'} />
        </div>
      )}
    </div>
  );
}

/** Collapsible "who voted how" for a closed open vote in a compact list row. */
export function NamedBreakdownToggle({ voteId, opinion = false }: { voteId: string; opinion?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="press inline-flex h-8 items-center gap-1 rounded-xl px-2 text-[13px] text-indigo-300 hover:bg-zinc-800/50">
        Kto jak głosował <ChevronDown className={clsx('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="mt-2"><NamedBreakdown voteId={voteId} opinion={opinion} /></div>}
    </div>
  );
}
