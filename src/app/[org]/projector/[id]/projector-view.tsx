'use client';

import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Check, Coffee, Maximize, Mic, Minimize, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useLiveSession, tallyOf, fetchElectionResults } from '@/lib/use-live-session';
import { TallyBar, VOTE_RESULT_LABEL } from '@/components/session/tally';
import { useCountdown } from '@/components/session/break-banner';
import { SpeakerTimer } from '@/components/session/speaker-timer';
import type { Vote, ElectionResult } from '@/types/database';

const RESULT_STAGE: Record<NonNullable<Vote['result']>, string> = {
  passed: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/40',
  rejected: 'bg-red-500/15 text-red-300 ring-red-500/40',
  no_quorum: 'bg-amber-500/15 text-amber-300 ring-amber-500/40',
};

/** Wall clock for the header (minute resolution is enough on a beamer). */
function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 15_000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);
  return now;
}

/** Show the fullscreen control only while the mouse moves (it's a presentation). */
function useIdle(ms: number) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const wake = () => { setIdle(false); clearTimeout(t); t = setTimeout(() => setIdle(true), ms); };
    wake();
    window.addEventListener('pointermove', wake);
    window.addEventListener('keydown', wake);
    return () => { clearTimeout(t); window.removeEventListener('pointermove', wake); window.removeEventListener('keydown', wake); };
  }, [ms]);
  return idle;
}

export function ProjectorView({ sessionId }: { sessionId: string }) {
  const { loading, session, agendaItems, attendance, activeVote, openVoteBallots, quorum, presentCount, candidates, floorRequests } =
    useLiveSession(sessionId);
  const supabase = createClient();
  const breakRemaining = useCountdown(session?.on_break_until ?? null);
  const now = useClock();
  const idle = useIdle(2500);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };

  // Last closed vote - shown big between votes (the moment the room looks up).
  const [lastResult, setLastResult] = useState<Vote | null>(null);
  useEffect(() => {
    if (activeVote) return; // showing live vote instead
    supabase
      .from('votes').select('*')
      .eq('session_id', sessionId).eq('status', 'closed')
      .order('closed_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setLastResult((data as Vote) ?? null));
  }, [activeVote, sessionId, supabase]);

  // Per-candidate results when the last closed vote is an election.
  const [electionResults, setElectionResults] = useState<{ voteId: string; rows: ElectionResult[] } | null>(null);
  useEffect(() => {
    if (lastResult?.vote_kind !== 'election') return;
    fetchElectionResults(supabase, lastResult).then((rows) => setElectionResults({ voteId: lastResult.id, rows }));
  }, [lastResult, supabase]);
  const shownElection = lastResult && electionResults?.voteId === lastResult.id ? electionResults.rows : [];

  if (loading || !session) {
    return (
      <div className="theme-fixed flex min-h-dvh items-center justify-center bg-zinc-950 text-2xl text-zinc-600">
        {loading ? 'Ładowanie…' : 'Brak posiedzenia'}
      </div>
    );
  }

  const tally = tallyOf(activeVote, openVoteBallots);
  const eligible = quorum?.total_seats ?? presentCount;

  // Open vote: who voted how (named voting is public - show it on the beamer).
  const nameByMandate = new Map(attendance.map((a) => [a.mandate_id, a.mandate?.profile?.full_name ?? '-']));
  const votersByChoice = { for: [] as string[], against: [] as string[], abstain: [] as string[] };
  if (activeVote?.vote_type === 'open') {
    for (const b of openVoteBallots) {
      if (b.mandate_id) votersByChoice[b.choice].push(nameByMandate.get(b.mandate_id) ?? '-');
    }
  }

  const speaker = floorRequests.find((r) => r.status === 'speaking') ?? null;
  const queue = floorRequests.filter((r) => r.status === 'waiting');
  const currentIdx = agendaItems.findIndex((i) => i.status === 'in_progress');

  return (
    <div className="theme-fixed relative flex min-h-dvh flex-col overflow-hidden bg-zinc-950 px-12 py-8 text-zinc-100">
      {/* Ambient accent glow (static, behind everything) */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-1/3 h-2/3 bg-[radial-gradient(ellipse_at_center,var(--color-indigo-900)_0%,transparent_65%)] opacity-60" />

      {/* Header */}
      <header className="relative flex items-center justify-between gap-8">
        <div className="flex min-w-0 items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" className="h-12 w-12 shrink-0 rounded-2xl" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Na żywo
            </div>
            <h1 className="truncate text-3xl font-semibold tracking-tight">{session.title}</h1>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <span className={clsx('inline-flex items-center gap-2 rounded-full px-5 py-2 text-lg font-semibold ring-1',
            quorum?.has_quorum ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/40' : 'bg-red-500/15 text-red-300 ring-red-500/40')}>
            {quorum?.has_quorum ? <Check className="h-5 w-5" strokeWidth={3} /> : <X className="h-5 w-5" strokeWidth={3} />}
            {quorum?.has_quorum ? 'Kworum' : 'Brak kworum'}
          </span>
          <span className="text-3xl font-semibold tabular-nums">
            {presentCount}<span className="text-zinc-600"> / {quorum?.total_seats ?? '?'}</span>
          </span>
          {now && (
            <span className="border-l border-zinc-800 pl-4 font-mono text-3xl tabular-nums text-zinc-400">
              {now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </header>

      {/* Main stage */}
      <main className="relative flex flex-1 items-center justify-center py-10">
        {breakRemaining ? (
          <div className="text-center">
            <Coffee className="mx-auto h-14 w-14 text-amber-400" />
            <div className="mt-4 text-3xl font-medium uppercase tracking-[0.2em] text-amber-400">Przerwa w obradach</div>
            <div className="mt-6 font-mono text-[10rem] font-semibold leading-none tabular-nums text-amber-100">{breakRemaining}</div>
          </div>
        ) : activeVote && activeVote.vote_kind === 'election' ? (
          <div className="w-full max-w-5xl text-center">
            <Kicker tone="text-amber-400">Wybory · {activeVote.seats} {activeVote.seats === 1 ? 'miejsce' : 'miejsca'}</Kicker>
            <div className="mt-3 text-5xl font-semibold leading-tight tracking-tight">{activeVote.title.replace(/^Wybory:\s*/i, '')}</div>
            <div className="mt-10 grid grid-cols-2 gap-4">
              {candidates.map((c) => (
                <div key={c.id} className="rounded-3xl bg-zinc-900/70 px-8 py-6 text-3xl font-semibold ring-1 ring-zinc-800">{c.name}</div>
              ))}
            </div>
            <Turnout cast={activeVote.secret_cast_count} present={presentCount} />
          </div>
        ) : activeVote ? (
          <div className="w-full max-w-5xl">
            <div className="mb-10 text-center">
              <Kicker tone="text-indigo-300">Głosowanie {activeVote.vote_type === 'secret' ? 'tajne' : 'jawne'}</Kicker>
              <div className="mt-3 text-5xl font-semibold leading-tight tracking-tight">{activeVote.title.replace(/^Głosowanie:\s*/i, '')}</div>
            </div>

            {activeVote.vote_type === 'open' ? (
              <div className="space-y-8">
                <TallyBar label="ZA" count={tally.forN} total={eligible} tone="for" size="lg" />
                <TallyBar label="PRZECIW" count={tally.against} total={eligible} tone="against" size="lg" />
                <TallyBar label="WSTRZYMUJĘ SIĘ" count={tally.abstain} total={eligible} tone="abstain" size="lg" />
                {tally.cast > 0 && (
                  <div className="grid grid-cols-3 gap-4 pt-2">
                    <VoterColumn title="Za" names={votersByChoice.for} tone="text-emerald-300" />
                    <VoterColumn title="Przeciw" names={votersByChoice.against} tone="text-red-300" />
                    <VoterColumn title="Wstrzymali się" names={votersByChoice.abstain} tone="text-zinc-300" />
                  </div>
                )}
                <Turnout cast={tally.cast} present={presentCount} />
              </div>
            ) : (
              <div className="text-center">
                <div className="font-mono text-[11rem] font-semibold leading-none tabular-nums">{tally.cast}</div>
                <div className="mt-4 text-3xl text-zinc-400">oddanych głosów z {presentCount} obecnych</div>
                <div className="mt-3 text-xl text-zinc-500">Wynik pojawi się po zamknięciu głosowania</div>
              </div>
            )}
          </div>
        ) : speaker ? (
          <div className="text-center">
            <Mic className="mx-auto h-12 w-12 text-indigo-300" />
            <Kicker tone="text-indigo-300 mt-4">Głos ma</Kicker>
            <div className="mt-4 text-8xl font-semibold tracking-tight">{speaker.mandate?.profile?.full_name ?? '-'}</div>
            {session.speech_limit_seconds ? (
              <div className="mt-8">
                <SpeakerTimer calledAt={speaker.called_at} limitSeconds={session.speech_limit_seconds}
                  extraSeconds={speaker.extra_seconds ?? 0} size="lg" />
              </div>
            ) : null}
            {queue.length > 0 && (
              <div className="mt-14">
                <div className="text-lg uppercase tracking-[0.2em] text-zinc-500">Następni</div>
                <div className="mt-4 flex flex-wrap justify-center gap-3">
                  {queue.map((r, i) => (
                    <span key={r.id} className="rounded-full bg-zinc-900/80 px-5 py-2 text-2xl text-zinc-300 ring-1 ring-zinc-800">
                      {i + 1}. {r.mandate?.profile?.full_name ?? '-'}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : lastResult && lastResult.vote_kind === 'election' ? (
          <div className="w-full max-w-4xl text-center">
            <Kicker tone="text-zinc-500">Wynik wyborów</Kicker>
            <div className="mt-3 text-4xl font-semibold tracking-tight">{lastResult.title.replace(/^Wybory:\s*/i, '')}</div>
            <div className="mt-10 space-y-3">
              {shownElection.map((r) => (
                <div key={r.candidate.id}
                  className={clsx('flex items-center justify-between rounded-3xl px-8 py-4 text-3xl ring-1',
                    r.elected ? 'bg-amber-500/15 font-semibold text-amber-200 ring-amber-500/40' : 'bg-zinc-900/60 text-zinc-300 ring-zinc-800')}>
                  <span className="flex items-center gap-3">{r.elected && <Check className="h-7 w-7" strokeWidth={3} />}{r.candidate.name}</span>
                  <span className="font-mono tabular-nums">{r.count}</span>
                </div>
              ))}
            </div>
          </div>
        ) : lastResult ? (
          <div className="text-center">
            <Kicker tone="text-zinc-500">Ostatnie głosowanie</Kicker>
            <div className="mx-auto mt-3 max-w-4xl text-4xl font-semibold leading-tight tracking-tight text-zinc-200">
              {lastResult.title.replace(/^(Głosowanie|Wniosek formalny):\s*/i, '')}
            </div>
            <div className={clsx('mt-10 inline-block rounded-[2rem] px-16 py-8 text-7xl font-bold tracking-tight ring-2',
              RESULT_STAGE[lastResult.result ?? 'rejected'])}>
              {VOTE_RESULT_LABEL[lastResult.result ?? 'rejected']}
            </div>
            <div className="mt-10 flex items-end justify-center gap-14">
              <Score label="Za" value={lastResult.votes_for} tone="text-emerald-300" />
              <Score label="Przeciw" value={lastResult.votes_against} tone="text-red-300" />
              <Score label="Wstrzymało się" value={lastResult.votes_abstain} tone="text-zinc-300" />
            </div>
          </div>
        ) : (
          <div className="text-center">
            <div className="text-4xl font-medium text-zinc-500">Za chwilę pierwsze głosowanie</div>
            <div className="mt-3 text-xl text-zinc-600">Wyniki pojawią się tutaj na żywo</div>
          </div>
        )}
      </main>

      {/* Agenda progress */}
      {agendaItems.length > 0 && (
        <footer className="relative border-t border-zinc-800/80 pt-6">
          <ol className="flex flex-wrap gap-2.5">
            {agendaItems.map((item, idx) => {
              const current = idx === currentIdx;
              const done = item.status === 'completed';
              return (
                <li key={item.id}
                  className={clsx('flex items-center gap-2 rounded-full px-4 py-2 text-lg',
                    current ? 'bg-indigo-600 font-semibold text-white'
                      : done ? 'bg-zinc-900/60 text-zinc-600'
                      : 'bg-zinc-900/80 text-zinc-400 ring-1 ring-zinc-800')}>
                  {done ? <Check className="h-4 w-4" strokeWidth={3} /> : <span className="tabular-nums">{idx + 1}.</span>}
                  <span className="max-w-[28ch] truncate">{item.title}</span>
                </li>
              );
            })}
          </ol>
        </footer>
      )}

      <button onClick={toggleFullscreen} aria-label={fullscreen ? 'Wyjdź z pełnego ekranu' : 'Pełny ekran'}
        className={clsx('press absolute bottom-6 right-6 flex h-12 items-center gap-2 rounded-xl bg-zinc-900/90 px-4 text-base text-zinc-300 ring-1 ring-zinc-700 transition-opacity duration-300 hover:text-white',
          idle ? 'pointer-events-none opacity-0' : 'opacity-100')}>
        {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
        {fullscreen ? 'Zamknij pełny ekran' : 'Pełny ekran'}
      </button>
    </div>
  );
}

function Kicker({ children, tone }: { children: React.ReactNode; tone: string }) {
  return <div className={clsx('text-xl font-medium uppercase tracking-[0.2em]', tone)}>{children}</div>;
}

function Turnout({ cast, present }: { cast: number; present: number }) {
  return (
    <div className="mt-10 text-center text-2xl tabular-nums text-zinc-500">
      Oddano <span className="font-semibold text-zinc-200">{cast}</span> z {present} głosów
    </div>
  );
}

function Score({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="text-center">
      <div className={clsx('font-mono text-7xl font-semibold tabular-nums', tone)}>{value}</div>
      <div className="mt-2 text-xl text-zinc-500">{label}</div>
    </div>
  );
}

function VoterColumn({ title, names, tone }: { title: string; names: string[]; tone: string }) {
  return (
    <div className="rounded-3xl bg-zinc-900/60 p-5 ring-1 ring-zinc-800">
      <div className={clsx('mb-3 text-center text-lg font-semibold', tone)}>
        {title} <span className="tabular-nums text-zinc-500">· {names.length}</span>
      </div>
      <ul className="space-y-1 text-center text-lg text-zinc-300">
        {names.map((n, i) => <li key={i} className="truncate">{n}</li>)}
      </ul>
    </div>
  );
}
