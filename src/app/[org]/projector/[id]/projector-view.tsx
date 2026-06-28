'use client';

import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { createClient } from '@/lib/supabase/client';
import { useLiveSession, tallyOf } from '@/lib/use-live-session';
import { TallyBar, VOTE_RESULT_LABEL, RESULT_TONE } from '@/components/session/tally';
import type { Vote } from '@/types/database';

export function ProjectorView({ sessionId }: { sessionId: string }) {
  const { loading, session, agendaItems, activeVote, openVoteBallots, quorum, presentCount } =
    useLiveSession(sessionId);
  const supabase = createClient();

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
        {activeVote ? (
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
