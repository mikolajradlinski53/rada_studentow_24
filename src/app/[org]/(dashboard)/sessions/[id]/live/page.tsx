'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { clsx } from 'clsx';
import { useLiveSession, tallyOf } from '@/lib/use-live-session';
import { TallyBar, VOTE_RESULT_LABEL, RESULT_TONE } from '@/components/session/tally';
import type { AgendaItem, Vote, BallotChoice, VoteType } from '@/types/database';

export default function LiveSessionPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const [org, setOrg] = useState('');
  const [sessionId, setSessionId] = useState('');
  const supabase = createClient();

  useEffect(() => {
    params.then((p) => { setOrg(p.org); setSessionId(p.id); });
  }, [params]);

  const {
    loading, session, agendaItems, attendance, activeVote, openVoteBallots,
    myMandate, myBallot, quorum, presentCount,
  } = useLiveSession(sessionId);

  const isChair =
    myMandate?.role === 'chair' ||
    myMandate?.role === 'admin' ||
    (!!session?.chaired_by && session.chaired_by === myMandate?.profile_id);

  // === ACTIONS ===
  const checkIn = async () => {
    if (!myMandate) return;
    await supabase.from('attendance').upsert(
      { session_id: sessionId, mandate_id: myMandate.id, status: 'present', checked_in_at: new Date().toISOString() },
      { onConflict: 'session_id,mandate_id' }
    );
  };

  const openVote = async (item: AgendaItem, voteType: VoteType) => {
    await supabase.from('votes').insert({
      session_id: sessionId,
      agenda_item_id: item.id,
      title: `Głosowanie: ${item.title}`,
      vote_type: voteType,
      status: 'open',
      opened_at: new Date().toISOString(),
    });
  };

  const closeVote = async () => {
    if (!activeVote) return;
    await supabase.rpc('tally_vote', { p_vote_id: activeVote.id });
  };

  const castBallot = async (choice: BallotChoice) => {
    if (!activeVote || !myMandate || myBallot) return;
    const { error } = await supabase.rpc('cast_ballot', {
      p_vote_id: activeVote.id, p_mandate_id: myMandate.id, p_choice: choice,
    });
    if (error) alert('Nie udało się oddać głosu. Odśwież stronę i spróbuj ponownie.');
  };

  const closeSession = async () => {
    if (!confirm('Zamknąć posiedzenie?')) return;
    await supabase.from('sessions')
      .update({ status: 'protocol_pending', closed_at: new Date().toISOString() })
      .eq('id', sessionId);
  };

  // === RENDER ===
  if (loading) {
    return <div className="flex h-96 items-center justify-center text-zinc-500 text-sm">Ładowanie posiedzenia...</div>;
  }
  if (!session) return null;

  const myAttendance = attendance.find((a) => a.mandate_id === myMandate?.id);
  const isCheckedIn = myAttendance?.status === 'present' || myAttendance?.status === 'late';
  const tally = tallyOf(activeVote, openVoteBallots);
  const eligible = quorum?.total_seats ?? presentCount;

  // mandate_id -> name, for open-vote voter chips
  const nameByMandate = new Map(
    attendance.map((a) => [a.mandate_id, a.mandate?.profile?.full_name ?? '—'])
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <h1 className="text-lg font-semibold text-zinc-100">{session.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/${org}/projector/${sessionId}`}
            target="_blank"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors"
          >
            Widok rzutnikowy ↗
          </Link>
          {isChair && session.status === 'in_progress' && (
            <button
              onClick={closeSession}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:text-red-400 hover:border-red-800 transition-colors"
            >
              Zamknij posiedzenie
            </button>
          )}
        </div>
      </div>

      {/* Quorum meter */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-400">Obecność</span>
            <span className={clsx('rounded-full px-2.5 py-0.5 text-xs font-medium',
              quorum?.has_quorum ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300')}>
              {quorum?.has_quorum ? 'Kworum ✓' : 'Brak kworum'}
            </span>
          </div>
          <span className="text-sm tabular-nums text-zinc-400">
            {presentCount} / {quorum?.total_seats ?? '?'} · min. {quorum?.required ?? '?'}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
          <div
            className={clsx('h-full rounded-full transition-all duration-500',
              quorum?.has_quorum ? 'bg-emerald-500' : 'bg-red-500')}
            style={{ width: `${Math.min(100, Math.round((presentCount / (quorum?.total_seats || 1)) * 100))}%` }}
          />
        </div>

        {myMandate && !isCheckedIn && (
          <button onClick={checkIn}
            className="mt-3 w-full rounded-md bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 transition-colors">
            Potwierdź obecność
          </button>
        )}
        {isCheckedIn && <div className="mt-2 text-xs text-emerald-400">✓ Jesteś obecny/a</div>}
      </div>

      {/* Active vote */}
      {activeVote && (
        <div className="rounded-lg border-2 border-indigo-600 bg-indigo-950/20 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
              <h2 className="text-sm font-medium text-indigo-300">
                Głosowanie {activeVote.vote_type === 'secret' ? 'tajne' : 'jawne'} · na żywo
              </h2>
            </div>
            <span className="text-xs tabular-nums text-zinc-400">oddano {tally.cast} / {presentCount}</span>
          </div>
          <p className="text-base font-medium text-zinc-100 mb-4">{activeVote.title}</p>

          {/* Live tally */}
          {activeVote.vote_type === 'open' ? (
            <div className="space-y-3">
              <TallyBar label="ZA" count={tally.forN} total={eligible} tone="for" />
              <TallyBar label="PRZECIW" count={tally.against} total={eligible} tone="against" />
              <TallyBar label="WSTRZYMUJĘ SIĘ" count={tally.abstain} total={eligible} tone="abstain" />
              {openVoteBallots.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {openVoteBallots.map((b) => (
                    <span key={b.id}
                      className={clsx('rounded-full px-2 py-0.5 text-xs',
                        b.choice === 'for' ? 'bg-emerald-900/40 text-emerald-300'
                          : b.choice === 'against' ? 'bg-red-900/40 text-red-300'
                          : 'bg-zinc-800 text-zinc-400')}>
                      {b.mandate_id ? nameByMandate.get(b.mandate_id) ?? '—' : '—'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-indigo-800/60 bg-indigo-950/30 px-4 py-5 text-center">
              <div className="text-4xl font-semibold tabular-nums text-zinc-100">{tally.cast}</div>
              <div className="mt-1 text-xs text-zinc-400">oddanych głosów · wynik po zamknięciu (tajne)</div>
            </div>
          )}

          {/* Voting buttons */}
          {isCheckedIn && !myBallot && (
            <div className="mt-5 grid grid-cols-3 gap-3">
              <button onClick={() => castBallot('for')}
                className="rounded-lg bg-emerald-600 py-4 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors active:scale-95">ZA</button>
              <button onClick={() => castBallot('against')}
                className="rounded-lg bg-red-600 py-4 text-sm font-semibold text-white hover:bg-red-500 transition-colors active:scale-95">PRZECIW</button>
              <button onClick={() => castBallot('abstain')}
                className="rounded-lg bg-zinc-600 py-4 text-sm font-semibold text-white hover:bg-zinc-500 transition-colors active:scale-95">WSTRZYMUJĘ SIĘ</button>
            </div>
          )}
          {myBallot && (
            <div className="mt-4 text-center text-sm text-indigo-300">
              ✓ Głos oddany
              {activeVote.vote_type === 'open' && (
                <span className="text-zinc-500"> ({myBallot === 'for' ? 'za' : myBallot === 'against' ? 'przeciw' : 'wstrzymuję się'})</span>
              )}
            </div>
          )}
          {!isCheckedIn && <p className="mt-4 text-center text-sm text-zinc-500">Potwierdź obecność, aby głosować.</p>}

          {isChair && (
            <button onClick={closeVote}
              className="mt-4 w-full rounded-md border border-indigo-600 py-2 text-sm text-indigo-300 hover:bg-indigo-900/30 transition-colors">
              Zamknij głosowanie i pokaż wynik
            </button>
          )}
        </div>
      )}

      {/* Agenda */}
      <div>
        <h2 className="text-sm font-medium text-zinc-400 mb-3">Porządek obrad</h2>
        <div className="space-y-1.5">
          {agendaItems.map((item, idx) => (
            <div key={item.id}
              className={clsx('rounded-lg border px-4 py-3',
                item.status === 'in_progress' ? 'border-indigo-600 bg-indigo-950/20'
                  : item.status === 'completed' ? 'border-zinc-800 bg-zinc-900/30 opacity-60'
                  : 'border-zinc-800 bg-zinc-900/50')}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 w-5">{idx + 1}.</span>
                  <span className="text-sm text-zinc-200">{item.title}</span>
                </div>
                {isChair && !activeVote && item.status !== 'completed' && item.item_type === 'resolution' && (
                  <div className="flex gap-1.5">
                    <button onClick={() => openVote(item, 'open')}
                      className="rounded px-2 py-1 text-xs bg-indigo-600 text-white hover:bg-indigo-500 transition-colors">Głosuj jawnie</button>
                    <button onClick={() => openVote(item, 'secret')}
                      className="rounded px-2 py-1 text-xs bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors">Głosuj tajnie</button>
                  </div>
                )}
              </div>
              <VoteResults agendaItemId={item.id} />
            </div>
          ))}
        </div>
      </div>

      <PastVotesSection sessionId={sessionId} />
    </div>
  );
}

// Closed votes for an agenda item
function VoteResults({ agendaItemId }: { agendaItemId: string }) {
  const [votes, setVotes] = useState<Vote[]>([]);
  const supabase = createClient();
  useEffect(() => {
    supabase.from('votes').select('*').eq('agenda_item_id', agendaItemId).eq('status', 'closed')
      .then(({ data }) => setVotes(data ?? []));
  }, [agendaItemId, supabase]);
  if (!votes.length) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {votes.map((v) => (
        <div key={v.id} className="flex items-center gap-3 text-xs pl-7">
          <span className={clsx('rounded-full px-2 py-0.5 font-medium', RESULT_TONE[v.result ?? 'rejected'])}>
            {VOTE_RESULT_LABEL[v.result ?? 'rejected']}
          </span>
          <span className="text-zinc-500">Za: {v.votes_for} · Przeciw: {v.votes_against} · Wstrzym.: {v.votes_abstain}</span>
        </div>
      ))}
    </div>
  );
}

// All closed votes in session
function PastVotesSection({ sessionId }: { sessionId: string }) {
  const [votes, setVotes] = useState<Vote[]>([]);
  const supabase = createClient();
  useEffect(() => {
    if (!sessionId) return;
    supabase.from('votes').select('*').eq('session_id', sessionId).eq('status', 'closed')
      .order('closed_at', { ascending: false }).then(({ data }) => setVotes(data ?? []));
  }, [sessionId, supabase]);
  if (!votes.length) return null;
  return (
    <div>
      <h2 className="text-sm font-medium text-zinc-400 mb-3">Zakończone głosowania</h2>
      <div className="space-y-1.5">
        {votes.map((v) => (
          <div key={v.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <div className="text-sm text-zinc-300">{v.title}</div>
            <div className="flex items-center gap-3">
              <span className="text-xs tabular-nums text-zinc-500">{v.votes_for}–{v.votes_against}–{v.votes_abstain}</span>
              <span className={clsx('rounded-full px-2 py-0.5 text-xs font-medium', RESULT_TONE[v.result ?? 'rejected'])}>
                {VOTE_RESULT_LABEL[v.result ?? 'rejected']}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
