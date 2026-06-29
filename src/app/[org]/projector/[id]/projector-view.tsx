'use client';

import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { createClient } from '@/lib/supabase/client';
import { useLiveSession, tallyOf } from '@/lib/use-live-session';
import { TallyBar, VOTE_RESULT_LABEL, RESULT_TONE } from '@/components/session/tally';
import { useCountdown } from '@/components/session/break-banner';
import type { Vote } from '@/types/database';

export function ProjectorView({ sessionId }: { sessionId: string }) {
  const { loading, session, agendaItems, attendance, activeVote, openVoteBallots, quorum, presentCount, floorRequests } =
    useLiveSession(sessionId);
  const supabase = createClient();
  const breakRemaining = useCountdown(session?.on_break_until ?? null);

  // Last closed vote — shown big between votes (the moment the room looks up).
  const [lastResult, setLastResult] = useState<Vote | null>(null);
  useEffect(() => {
    if (activeVote) return; // showing live vote instead
    supabase
      .from('votes').select('*')
      .eq('session_id', sessionId).eq('status', 'closed')
      .order('closed_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setLastResult((data as Vote) ?? null));
  }, [activeVote, sessionId, supabase]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-600">Ładowanie…</div>;
  }
  if (!session) {
    return <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-600">Brak posiedzenia</div>;
  }

  const tally = tallyOf(activeVote, openVoteBallots);
  const eligible = quorum?.total_seats ?? presentCount;

  // Open vote: who voted how (named voting is public — show it on the beamer).
  const nameByMandate = new Map(
    attendance.map((a) => [a.mandate_id, a.mandate?.profile?.full_name ?? '—'])
  );
  const votersByChoice = { for: [] as string[], against: [] as string[], abstain: [] as string[] };
  if (activeVote?.vote_type === 'open') {
    for (const b of openVoteBallots) {
      if (b.mandate_id) votersByChoice[b.choice].push(nameByMandate.get(b.mandate_id) ?? '—');
    }
  }

  const speaker = floorRequests.find((r) => r.status === 'speaking') ?? null;
  const queue = floorRequests.filter((r) => r.status === 'waiting');

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 px-10 py-8 text-zinc-100">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
          <h1 className="text-2xl font-semibold tracking-tight">{session.title}</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className={clsx('rounded-full px-4 py-1.5 text-base font-semibold',
            quorum?.has_quorum ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300')}>
            {quorum?.has_quorum ? 'KWORUM ✓' : 'BRAK KWORUM'}
          </span>
          <span className="text-2xl font-semibold tabular-nums text-zinc-300">
            {presentCount}<span className="text-zinc-600"> / {quorum?.total_seats ?? '?'}</span>
          </span>
        </div>
      </div>

      {/* Main stage */}
      <div className="flex flex-1 items-center justify-center py-8">
        {breakRemaining ? (
          <div className="text-center">
            <div className="text-3xl uppercase tracking-widest text-amber-400">Przerwa w obradach</div>
            <div className="mt-4 text-[9rem] font-bold leading-none tabular-nums text-amber-200">{breakRemaining}</div>
          </div>
        ) : activeVote ? (
          <div className="w-full max-w-4xl">
            <div className="mb-8 text-center">
              <div className="text-lg font-medium uppercase tracking-widest text-indigo-400">
                Głosowanie {activeVote.vote_type === 'secret' ? 'tajne' : 'jawne'} — na żywo
              </div>
              <div className="mt-2 text-3xl font-semibold text-zinc-100">{activeVote.title}</div>
            </div>

            {activeVote.vote_type === 'open' ? (
              <div className="space-y-7">
                <TallyBar label="ZA" count={tally.forN} total={eligible} tone="for" size="lg" />
                <TallyBar label="PRZECIW" count={tally.against} total={eligible} tone="against" size="lg" />
                <TallyBar label="WSTRZYMUJĘ SIĘ" count={tally.abstain} total={eligible} tone="abstain" size="lg" />

                {/* Named voting — show who voted how */}
                {tally.cast > 0 && (
                  <div className="grid grid-cols-3 gap-4 pt-2 text-sm">
                    <VoterColumn title="ZA" names={votersByChoice.for} tone="text-emerald-300" />
                    <VoterColumn title="PRZECIW" names={votersByChoice.against} tone="text-red-300" />
                    <VoterColumn title="WSTRZYMUJĄ SIĘ" names={votersByChoice.abstain} tone="text-zinc-300" />
                  </div>
                )}

                <div className="pt-2 text-center text-xl tabular-nums text-zinc-500">
                  oddano {tally.cast} / {presentCount}
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div className="text-[10rem] font-bold leading-none tabular-nums text-zinc-100">{tally.cast}</div>
                <div className="mt-4 text-2xl text-zinc-400">oddanych głosów z {presentCount} obecnych</div>
                <div className="mt-2 text-lg uppercase tracking-widest text-indigo-400">głosowanie tajne — wynik po zamknięciu</div>
              </div>
            )}
          </div>
        ) : speaker ? (
          <div className="text-center">
            <div className="text-2xl uppercase tracking-widest text-indigo-400">Głos ma</div>
            <div className="mt-4 text-7xl font-bold text-zinc-100">{speaker.mandate?.profile?.full_name ?? '—'}</div>
            {queue.length > 0 && (
              <div className="mt-10">
                <div className="text-sm uppercase tracking-widest text-zinc-600">Kolejka</div>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {queue.map((r, i) => (
                    <span key={r.id} className="rounded-full bg-zinc-800 px-4 py-1.5 text-lg text-zinc-300">
                      {i + 1}. {r.mandate?.profile?.full_name ?? '—'}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : lastResult ? (
          <div className="text-center">
            <div className="text-lg uppercase tracking-widest text-zinc-500">Ostatnie głosowanie</div>
            <div className="mt-3 max-w-3xl text-2xl text-zinc-300">{lastResult.title}</div>
            <div className={clsx('mt-8 inline-block rounded-2xl px-10 py-5 text-5xl font-bold',
              RESULT_TONE[lastResult.result ?? 'rejected'])}>
              {VOTE_RESULT_LABEL[lastResult.result ?? 'rejected']}
            </div>
            <div className="mt-6 text-2xl tabular-nums text-zinc-400">
              <span className="text-emerald-400">{lastResult.votes_for}</span>
              {' – '}<span className="text-red-400">{lastResult.votes_against}</span>
              {' – '}<span className="text-zinc-400">{lastResult.votes_abstain}</span>
            </div>
          </div>
        ) : (
          <div className="text-center text-3xl text-zinc-600">Oczekiwanie na głosowanie…</div>
        )}
      </div>

      {/* Agenda footer */}
      <div className="border-t border-zinc-800 pt-5">
        <div className="flex flex-wrap gap-2">
          {agendaItems.map((item, idx) => (
            <span key={item.id}
              className={clsx('rounded-full px-3 py-1 text-sm',
                item.status === 'completed' ? 'bg-zinc-800/60 text-zinc-500 line-through'
                  : item.status === 'in_progress' ? 'bg-indigo-900/50 text-indigo-200'
                  : 'bg-zinc-800 text-zinc-400')}>
              {idx + 1}. {item.title}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function VoterColumn({ title, names, tone }: { title: string; names: string[]; tone: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <div className={clsx('mb-2 text-center text-xs font-semibold uppercase tracking-widest', tone)}>
        {title} · {names.length}
      </div>
      <ul className="space-y-0.5 text-center text-zinc-300">
        {names.map((n, i) => <li key={i} className="truncate">{n}</li>)}
      </ul>
    </div>
  );
}
