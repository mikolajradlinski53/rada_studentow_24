'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { clsx } from 'clsx';
import { useLiveSession } from '@/lib/use-live-session';
import { RESULT_TONE, resultLabel } from '@/components/session/tally';
import { Discussion } from '@/components/session/discussion';
import { RollCall } from '@/components/session/roll-call';
import { ElectionOpener, ElectionActive, ElectionResultRow } from '@/components/session/election';
import { Transmission } from '@/components/session/transmission';
import { MotionVoteCard } from '@/components/session/motion-vote';
import { AgendaMaterials } from '@/components/session/agenda-materials';
import { PendingVoters } from '@/components/session/pending-voters';
import { AgendaComments } from '@/components/session/agenda-comments';
import { NotificationNudge } from '@/components/pwa/notification-toggle';
import { Skeleton } from '@/components/ui/skeleton';
import { ClosedVoteCard, NamedBreakdownToggle } from '@/components/session/vote-result';
import { Check, MonitorUp, Square, X } from 'lucide-react';
import { broadcastPush } from '@/lib/push-client';
import { useWakeLock } from '@/lib/use-wake-lock';
import { settleMotionVote } from '@/lib/motions';
import { isVotingRole } from '@/lib/roles';
import { failed } from '@/lib/notify';
import type { AgendaItem, Vote, BallotChoice, VoteType } from '@/types/database';

export default function LiveSessionPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const [org, setOrg] = useState('');
  const [sessionId, setSessionId] = useState('');
  const supabase = createClient();

  useEffect(() => {
    params.then((p) => { setOrg(p.org); setSessionId(p.id); });
  }, [params]);

  const {
    loading, session, agendaItems, attendance, activeVote, closedVotes, openVoterIds,
    myMandate, myBallot, quorum, presentCount, roster, candidates, floorRequests, isPlatformAdmin, refetch,
  } = useLiveSession(sessionId);
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  const isChair =
    isPlatformAdmin ||
    myMandate?.role === 'chair' ||
    myMandate?.role === 'admin' ||
    (!!session?.chaired_by && session.chaired_by === myMandate?.profile_id);

  // Keep the screen on for the whole sitting — a locked phone misses votes.
  useWakeLock(session?.status === 'in_progress');

  // A vote just opened (realtime): buzz the phone and bring the ballot into view.
  const voteCardRef = useRef<HTMLDivElement>(null);
  const lastVoteId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (loading) return;
    const id = activeVote?.id ?? null;
    if (lastVoteId.current !== undefined && id && id !== lastVoteId.current) {
      navigator.vibrate?.([80, 40, 80]);
      voteCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    lastVoteId.current = id;
  }, [activeVote?.id, loading]);

  // === ACTIONS ===
  const checkIn = async () => {
    if (!myMandate) return;
    const { error } = await supabase.from('attendance').upsert(
      { session_id: sessionId, mandate_id: myMandate.id, status: 'present', checked_in_at: new Date().toISOString() },
      { onConflict: 'session_id,mandate_id' }
    );
    if (failed(error, 'Nie udało się potwierdzić obecności.')) return;
    void refetch(); // own action: show it now, don't wait for the realtime round
  };

  // Current agenda item: starting one completes the previous (projector + highlight follow).
  const setItemStatus = async (item: AgendaItem, status: 'in_progress' | 'completed') => {
    if (status === 'in_progress') {
      const { error: e1 } = await supabase.from('agenda_items').update({ status: 'completed' })
        .eq('session_id', sessionId).eq('status', 'in_progress').neq('id', item.id);
      if (failed(e1, 'Nie udało się zakończyć poprzedniego punktu.')) return;
    }
    const { error } = await supabase.from('agenda_items').update({ status }).eq('id', item.id);
    if (failed(error, 'Nie udało się zmienić punktu porządku obrad.')) return;
    void refetch();
  };

  const openVote = async (item: AgendaItem, voteType: VoteType, kind: 'motion' | 'opinion' = 'motion') => {
    // A second vote on the same item is legitimate only as a deliberate re-vote.
    if (closedVotes.some((v) => v.agenda_item_id === item.id)
      && !confirm('Ten punkt był już głosowany. Otworzyć ponowne głosowanie (reasumpcja)?')) return;
    const { data: created, error } = await supabase.from('votes').insert({
      session_id: sessionId,
      agenda_item_id: item.id,
      title: `${kind === 'opinion' ? 'Opinia' : 'Głosowanie'}: ${item.title}`,
      vote_type: voteType,
      vote_kind: kind,
      status: 'open',
      opened_at: new Date().toISOString(),
    }).select('id').single();
    if (failed(error, error?.message?.includes('vote_type_mismatch') ? 'Ten punkt ma ustalony inny rodzaj głosowania (jawne/tajne).' : 'Nie udało się otworzyć głosowania.')) return;
    if (item.status !== 'in_progress') await setItemStatus(item, 'in_progress');
    if (created) {
      await supabase.rpc('log_audit', { p_action: 'vote.opened', p_target_type: 'vote', p_target_id: created.id, p_metadata: { vote_type: voteType } });
      broadcastPush('vote_opened', created.id);
    }
    void refetch();
  };

  const closeVote = async () => {
    if (!activeVote) return;
    const { error } = await supabase.rpc('tally_vote', { p_vote_id: activeVote.id });
    if (failed(error, 'Nie udało się zamknąć głosowania.')) return;
    await supabase.rpc('log_audit', { p_action: 'vote.closed', p_target_type: 'vote', p_target_id: activeVote.id, p_metadata: {} });
    // Procedural vote on a formal motion: passed -> enact (e.g. start the break), else reject.
    await settleMotionVote(supabase, sessionId, activeVote.id);
    void refetch();
  };

  const castBallot = async (choice: BallotChoice): Promise<boolean> => {
    if (!activeVote || !myMandate || myBallot) return false;
    const { error } = await supabase.rpc('cast_ballot', {
      p_vote_id: activeVote.id, p_mandate_id: myMandate.id, p_choice: choice,
    });
    if (error) {
      const m = error.message ?? '';
      failed(error, m.includes('vote_not_open') ? 'Głosowanie zostało już zamknięte.'
        : m.includes('duplicate') ? 'Twój głos był już oddany wcześniej.'
        : m.includes('not_a_voting_member') ? 'Nie masz prawa głosu w tym głosowaniu.'
        : 'Nie udało się oddać głosu.');
      void refetch();
      return false;
    }
    navigator.vibrate?.(40);
    // Records participation only (never the choice) — keeps secret votes anonymous.
    await supabase.rpc('log_audit', { p_action: 'ballot.cast', p_target_type: 'vote', p_target_id: activeVote.id, p_metadata: { vote_type: activeVote.vote_type } });
    void refetch();
    return true;
  };

  const closeSession = async () => {
    if (!confirm('Zamknąć posiedzenie?')) return;
    const { error } = await supabase.from('sessions')
      .update({ status: 'protocol_pending', closed_at: new Date().toISOString() })
      .eq('id', sessionId);
    if (failed(error, 'Nie udało się zamknąć posiedzenia.')) return;
    await supabase.rpc('log_audit', { p_action: 'session.closed', p_target_type: 'session', p_target_id: sessionId, p_metadata: {} });
  };

  // === RENDER ===
  if (loading) {
    return (
      <div role="status" aria-label="Ładowanie posiedzenia" className="space-y-6">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <div className="space-y-1.5">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      </div>
    );
  }
  if (!session) return null;

  const myAttendance = attendance.find((a) => a.mandate_id === myMandate?.id);
  const isCheckedIn = myAttendance?.status === 'present' || myAttendance?.status === 'late';
  // KR, protokolant, admin take part without a vote (migration 032).
  const canVote = isVotingRole(myMandate?.role);
  const eligible = quorum?.total_seats ?? presentCount;

  // mandate_id -> name, for open-vote voter chips
  const nameByMandate = new Map(
    attendance.map((a) => [a.mandate_id, a.mandate?.profile?.full_name ?? '-'])
  );
  const lastMotion = closedVotes.find((v) => v.vote_kind !== 'election') ?? null;

  return (
    <div className="space-y-6">
      {/* Header: full title on top, actions below (never squeezed side by side on a phone) */}
      <div>
        <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-emerald-400">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-500" /> Posiedzenie trwa
        </div>
        <h1 className="mt-1.5 text-[20px] font-semibold leading-snug tracking-tight text-zinc-50 [overflow-wrap:anywhere]">{session.title}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`/${org}/projector/${sessionId}`}
            target="_blank"
            className="press inline-flex h-10 items-center gap-1.5 rounded-xl border border-zinc-700 px-3.5 text-[14px] font-medium text-zinc-200 hover:border-zinc-500"
          >
            <MonitorUp className="h-4 w-4" /> Widok rzutnika
          </Link>
          {isChair && session.status === 'in_progress' && (
            <button
              onClick={closeSession}
              className="press inline-flex h-10 items-center gap-1.5 rounded-xl border border-zinc-700 px-3.5 text-[14px] font-medium text-zinc-300 hover:border-red-800 hover:text-red-400"
            >
              <Square className="h-3.5 w-3.5" /> Zamknij posiedzenie
            </button>
          )}
        </div>
      </div>

      <div className="empty:hidden"><NotificationNudge /></div>

      {/* Quorum meter */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-400">Obecność</span>
            <span className={clsx('rounded-full px-2.5 py-0.5 text-xs font-medium',
              quorum?.has_quorum ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300')}>
              {quorum?.has_quorum ? 'Kworum' : 'Brak kworum'}
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

        {/* Only councillors check in; chair, protokolant, KR, admin aren't on the list. */}
        {canVote && !isCheckedIn && session.attendance_mode === 'self' && (
          <button onClick={checkIn}
            className="mt-3 w-full rounded-xl bg-emerald-600 py-3.5 text-base font-semibold text-white shadow-lg shadow-emerald-900/30 transition-transform hover:bg-emerald-500 active:scale-[0.98]">
            Potwierdź obecność
          </button>
        )}
        {canVote && !isCheckedIn && session.attendance_mode === 'chair' && (
          <div className="mt-2 text-xs text-zinc-500">Obecność potwierdza prowadzący.</div>
        )}
        {myMandate && !canVote && (
          <div className="mt-2 text-xs text-zinc-500">
            {myMandate.role === 'chair'
              ? 'Prowadzisz obrady bez głosu; przy remisie rozstrzygasz głosowanie.'
              : 'Uczestniczysz bez prawa głosu.'}
          </div>
        )}
        {isCheckedIn && (
          <div className="mt-2.5 flex items-center gap-1.5 text-[13px] text-emerald-400">
            <Check className="h-3.5 w-3.5" strokeWidth={3} /> Jesteś obecny/a
          </div>
        )}
      </div>

      {/* Active vote — right under attendance, the one thing a member is here for */}
      {activeVote && (
        <div ref={voteCardRef} className="scroll-mt-4">
          {activeVote.vote_kind === 'election' ? (
            <ElectionActive
              vote={activeVote}
              candidates={candidates}
              myMandate={canVote ? myMandate : null}
              myBallot={myBallot}
              isCheckedIn={isCheckedIn && canVote}
              isChair={isChair}
              presentCount={presentCount}
            />
          ) : (
            <MotionVoteCard
              key={activeVote.id}
              vote={activeVote}
              voterIds={openVoterIds}
              myBallot={myBallot}
              myMandate={canVote ? myMandate : null}
              isCheckedIn={isCheckedIn && canVote}
              isChair={isChair}
              presentCount={presentCount}
              nameByMandate={nameByMandate}
              onCast={castBallot}
              onClose={closeVote}
            />
          )}
          {isChair && (
            <div className="mt-3">
              <PendingVoters vote={activeVote} attendance={attendance} openVoterIds={openVoterIds} />
            </div>
          )}
        </div>
      )}

      {/* Just closed: the numbers, then who voted how (open votes) */}
      {!activeVote && lastMotion && lastMotion.id !== dismissedId && (
        <div>
          <ClosedVoteCard vote={lastMotion} eligible={eligible} canDecide={myMandate?.role === 'chair'} />
          <button onClick={() => setDismissedId(lastMotion.id)}
            className="press mt-2 inline-flex h-9 items-center gap-1 rounded-xl px-2.5 text-[13px] text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300">
            <X className="h-3.5 w-3.5" /> Ukryj wynik
          </button>
        </div>
      )}

      {/* Chair roll call */}
      {isChair && (
        <RollCall
          sessionId={sessionId}
          roster={roster.filter((m) => isVotingRole(m.role))}
          attendance={attendance}
          mode={session.attendance_mode}
        />
      )}

      {/* Transmission (YouTube) */}
      <Transmission org={org} sessionId={sessionId} streamUrl={session.stream_url} isChair={isChair} />

      {/* Discussion / speaker queue + procedural motions */}
      <Discussion
        sessionId={sessionId}
        session={session}
        floorRequests={floorRequests}
        myMandate={myMandate}
        isChair={isChair}
        canOpenVote={isChair && !activeVote}
      />

      {/* Agenda */}
      <div>
        <h2 className="text-sm font-medium text-zinc-400 mb-3">Porządek obrad</h2>
        <div className="space-y-1.5">
          {agendaItems.map((item, idx) => (
            <div key={item.id}
              className={clsx('rounded-2xl border px-4 py-3',
                item.status === 'in_progress' ? 'border-indigo-600 bg-indigo-950/20'
                  : item.status === 'completed' ? 'border-zinc-800 bg-zinc-900/30 opacity-60'
                  : 'border-zinc-800 bg-zinc-900/50')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                  <span className="w-5 shrink-0 pt-px text-xs text-zinc-500">{idx + 1}.</span>
                  <span className="text-sm text-zinc-200">{item.title}</span>
                  {item.status === 'in_progress' && (
                    <span className="shrink-0 rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-medium text-white">Teraz</span>
                  )}
                </div>
                {isChair && session.status === 'in_progress' && !activeVote && item.status !== 'in_progress' && item.status !== 'completed' && (
                  <button onClick={() => setItemStatus(item, 'in_progress')}
                    className="press h-9 rounded-xl border border-zinc-700 px-3 text-[13px] font-medium text-zinc-300 hover:border-zinc-500">
                    Rozpocznij punkt
                  </button>
                )}
                {isChair && !activeVote && item.status === 'in_progress' && (
                  <button onClick={() => setItemStatus(item, 'completed')}
                    className="press h-9 rounded-xl border border-indigo-600 px-3 text-[13px] font-medium text-indigo-300 hover:bg-indigo-900/30">
                    Zakończ punkt
                  </button>
                )}
                {isChair && !activeVote && item.status !== 'completed' && (item.item_type === 'resolution' || item.item_type === 'opinion') && (
                  // Open/secret announced on the agenda -> only that button (migration 037).
                  <div className="flex gap-1.5 pl-7 sm:pl-0">
                    {(['open', 'secret'] as const).filter((t) => !item.vote_type || item.vote_type === t).map((t) => {
                      const opinion = item.item_type === 'opinion';
                      return (
                        <button key={t} onClick={() => openVote(item, t, opinion ? 'opinion' : 'motion')}
                          className={clsx('press h-9 rounded-xl px-3 text-[13px] font-medium',
                            t === 'open' ? (opinion ? 'bg-teal-600 text-white hover:bg-teal-500' : 'bg-indigo-600 text-white hover:bg-indigo-500')
                              : item.vote_type ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600')}>
                          {opinion ? 'Opiniuj' : 'Głosuj'} {t === 'open' ? 'jawnie' : 'tajnie'}
                        </button>
                      );
                    })}
                  </div>
                )}
                {isChair && !activeVote && item.status !== 'completed' && item.item_type === 'election' && (
                  <ElectionOpener sessionId={sessionId} item={item} />
                )}
              </div>
              <div className="pl-7">
                <AgendaMaterials itemId={item.id} sessionId={sessionId} canEdit={false} />
                <AgendaComments itemId={item.id} myMandateId={myMandate?.id} canModerate={isChair} />
              </div>
              <VoteResults votes={closedVotes.filter((v) => v.agenda_item_id === item.id)} />
            </div>
          ))}
        </div>
      </div>

      <PastVotesSection votes={closedVotes} />
    </div>
  );
}

// Closed votes for an agenda item
function VoteResults({ votes }: { votes: Vote[] }) {
  if (!votes.length) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {votes.map((v) => v.vote_kind === 'election' ? (
        <div key={v.id}>
          <div className="pl-7 text-xs font-medium text-amber-300">Wynik wyborów ({v.secret_cast_count} głosów)</div>
          <ElectionResultRow vote={v} />
        </div>
      ) : (
        <div key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs pl-7">
          <span className={clsx('rounded-full px-2 py-0.5 font-medium', RESULT_TONE[v.result ?? 'rejected'])}>
            {resultLabel(v)}
          </span>
          <span className="text-zinc-500">
            {v.vote_kind === 'opinion' ? 'Pozytywnie' : 'Za'}: {v.votes_for} · {v.vote_kind === 'opinion' ? 'Negatywnie' : 'Przeciw'}: {v.votes_against} · Wstrzym.: {v.votes_abstain}
          </span>
        </div>
      ))}
    </div>
  );
}

// All closed votes in session
function PastVotesSection({ votes }: { votes: Vote[] }) {
  if (!votes.length) return null;
  return (
    <div>
      <h2 className="text-sm font-medium text-zinc-400 mb-3">Zakończone głosowania</h2>
      <div className="space-y-1.5">
        {votes.map((v) => v.vote_kind === 'election' ? (
          <div key={v.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-zinc-300">{v.title}</div>
              <span className="rounded-full bg-amber-900/50 px-2 py-0.5 text-xs font-medium text-amber-300">Wybory</span>
            </div>
            <ElectionResultRow vote={v} />
          </div>
        ) : (
          <div key={v.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 text-sm text-zinc-300">{v.title.replace(/^(Głosowanie|Opinia):\s*/i, '')}</div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs tabular-nums text-zinc-500">{v.votes_for}-{v.votes_against}-{v.votes_abstain}</span>
                <span className={clsx('rounded-full px-2 py-0.5 text-xs font-medium', RESULT_TONE[v.result ?? 'rejected'])}>
                  {resultLabel(v)}
                </span>
              </div>
            </div>
            {v.vote_type === 'open' && <NamedBreakdownToggle voteId={v.id} opinion={v.vote_kind === 'opinion'} />}
          </div>
        ))}
      </div>
    </div>
  );
}
