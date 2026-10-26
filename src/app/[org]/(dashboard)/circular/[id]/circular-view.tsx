'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Check, ChevronLeft, Clock, FileText, Lock, Users, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useLiveSession, type AttendanceWithMandate } from '@/lib/use-live-session';
import { MotionVoteCard } from '@/components/session/motion-vote';
import { PendingVoters } from '@/components/session/pending-voters';
import { AgendaMaterials } from '@/components/session/agenda-materials';
import { AgendaComments } from '@/components/session/agenda-comments';
import { CreateResolutionButton } from '@/components/session/create-resolution-button';
import { VOTE_RESULT_LABEL } from '@/components/session/tally';
import type { BallotChoice, Vote } from '@/types/database';

function useNow(ms: number) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, ms);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [ms]);
  return now;
}

function timeLeft(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), min = m % 60;
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${min} min`;
  return `${min} min`;
}

const RESULT_TONE: Record<NonNullable<Vote['result']>, string> = {
  passed: 'border-emerald-700/60 bg-emerald-950/30 text-emerald-300',
  rejected: 'border-red-800/60 bg-red-950/30 text-red-300',
  no_quorum: 'border-amber-800/60 bg-amber-950/30 text-amber-300',
};

export function CircularView({
  org, sessionId, orgId, canManage, resolutionId,
}: { org: string; sessionId: string; orgId: string; canManage: boolean; resolutionId: string | null }) {
  const live = useLiveSession(sessionId);
  const { loading, session, agendaItems, myMandate, myBallot, openVoteBallots, quorum, refetch } = live;
  const supabase = createClient();
  const now = useNow(30_000);
  const [vote, setVote] = useState<Vote | null>(null);

  // Deadline passed but nobody has closed it yet -> close lazily, then reload.
  useEffect(() => {
    supabase.rpc('close_due_circular_votes').then(({ data }) => { if ((data as number) > 0) void refetch(); });
  }, [supabase, refetch]);

  // The vote (open or closed) - useLiveSession only tracks the open one.
  useEffect(() => {
    if (!sessionId) return;
    supabase.from('votes').select('*').eq('session_id', sessionId).order('opened_at').limit(1).maybeSingle()
      .then(({ data }) => setVote((data as Vote) ?? null));
  }, [sessionId, supabase, live.activeVote?.id, live.activeVote?.secret_cast_count, openVoteBallots.length, session?.status]);

  if (loading || !session) {
    return <div className="h-64 animate-pulse rounded-2xl bg-zinc-900/60" />;
  }

  const item = agendaItems[0];
  const open = vote?.status === 'open';
  const seats = quorum?.total_seats ?? 0;
  const required = quorum?.required ?? Math.floor(seats / 2) + 1;
  const cast = !vote ? 0 : vote.vote_type === 'open'
    ? (open ? openVoteBallots.length : vote.votes_for + vote.votes_against + vote.votes_abstain)
    : (open ? vote.secret_cast_count : vote.votes_for + vote.votes_against + vote.votes_abstain);
  const deadline = vote?.closes_at ? new Date(vote.closes_at) : null;
  const left = deadline && now ? deadline.getTime() - now : null;

  const castBallot = async (choice: BallotChoice) => {
    if (!vote || !myMandate) return false;
    const { error } = await supabase.rpc('cast_ballot', { p_vote_id: vote.id, p_mandate_id: myMandate.id, p_choice: choice });
    if (error) { alert(error.message.includes('vote_not_open') ? 'Termin głosowania minął.' : 'Nie udało się oddać głosu.'); return false; }
    navigator.vibrate?.(40);
    await supabase.rpc('log_audit', { p_action: 'ballot.cast', p_target_type: 'vote', p_target_id: vote.id, p_metadata: { circular: true } });
    void refetch();
    return true;
  };
  const closeEarly = async () => {
    if (!vote || !confirm('Zakończyć głosowanie przed terminem i policzyć wynik?')) return;
    const { error } = await supabase.rpc('tally_vote', { p_vote_id: vote.id });
    if (error) { alert('Nie udało się zamknąć głosowania.'); return; }
    await supabase.rpc('log_audit', { p_action: 'vote.closed', p_target_type: 'vote', p_target_id: vote.id, p_metadata: { circular: true } });
    void refetch();
  };

  // Everyone with a seat is "present" for a circular vote (no roll call).
  const everyone = live.roster
    .filter((m) => !['auditor', 'election_committee', 'admin', 'secretary'].includes(m.role))
    .map((m) => ({ id: m.id, session_id: sessionId, mandate_id: m.id, status: 'present' as const, mandate: m }));

  return (
    <div>
      <Link href={`/${org}/sessions`}
        className="press -ml-2 mb-3 inline-flex h-9 items-center gap-0.5 rounded-xl pl-1 pr-3 text-[15px] text-indigo-300 hover:bg-zinc-800/40">
        <ChevronLeft className="h-5 w-5" /> Posiedzenia
      </Link>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium',
          open ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400')}>
          {open ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> : <Lock className="h-3 w-3" />}
          {open ? 'Głosowanie obiegowe trwa' : 'Głosowanie obiegowe zakończone'}
        </span>
        {vote && <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-[12px] text-zinc-400">{vote.vote_type === 'secret' ? 'tajne' : 'jawne'}</span>}
      </div>
      <h1 className="mt-3 text-[24px] font-semibold leading-tight tracking-tight text-zinc-50">w sprawie {session.title}</h1>

      {/* Deadline + quorum */}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
          <div className="flex items-center gap-1.5 text-[12px] text-zinc-500"><Clock className="h-3.5 w-3.5" /> {open ? 'Pozostało' : 'Termin'}</div>
          <div className="mt-1 text-[17px] font-semibold tabular-nums text-zinc-100">
            {open && left !== null ? timeLeft(left) : deadline ? deadline.toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}
          </div>
          {open && deadline && (
            <div className="mt-0.5 text-[12px] text-zinc-500">
              do {deadline.toLocaleString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
          <div className="flex items-center gap-1.5 text-[12px] text-zinc-500"><Users className="h-3.5 w-3.5" /> Kworum</div>
          <div className={clsx('mt-1 text-[17px] font-semibold tabular-nums', cast >= required ? 'text-emerald-400' : 'text-zinc-100')}>
            {cast} / {required}
          </div>
          <div className="mt-0.5 text-[12px] text-zinc-500">{cast >= required ? 'osiągnięte' : `brakuje ${required - cast} głosów`}</div>
        </div>
      </div>

      {/* Draft text + materials + Q&A */}
      {item && (
        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center gap-2 text-[13px] font-medium uppercase tracking-wide text-zinc-500">
            <FileText className="h-4 w-4" /> Projekt
          </div>
          {item.description
            ? <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-200">{item.description}</p>
            : <p className="mt-2 text-[14px] text-zinc-500">Brak treści. Zobacz załączniki.</p>}
          <AgendaMaterials itemId={item.id} sessionId={sessionId} orgId={orgId} canEdit={canManage && open} />
          <AgendaComments itemId={item.id} myMandateId={myMandate?.id} canModerate={canManage} />
        </section>
      )}

      {/* Ballot / result */}
      <div className="mt-6">
        {open && vote ? (
          <>
            <MotionVoteCard key={vote.id} vote={vote} ballots={openVoteBallots} myBallot={myBallot} myMandate={myMandate}
              isCheckedIn isChair={false} presentCount={seats} eligible={seats}
              nameByMandate={new Map(everyone.map((a) => [a.mandate_id, a.mandate.profile?.full_name ?? '-']))}
              onCast={castBallot} onClose={() => {}} />
            {canManage && (
              <div className="mt-3 space-y-3">
                <PendingVoters vote={vote} attendance={everyone as unknown as AttendanceWithMandate[]} openBallots={openVoteBallots} />
                <button onClick={closeEarly}
                  className="press h-11 w-full rounded-xl border border-zinc-700 text-[14px] text-zinc-300 hover:border-zinc-500">
                  Zakończ przed terminem
                </button>
              </div>
            )}
          </>
        ) : vote?.result ? (
          <div className={clsx('rounded-2xl border p-5 text-center', RESULT_TONE[vote.result])}>
            <div className="flex items-center justify-center gap-2 text-[22px] font-bold">
              {vote.result === 'passed' ? <Check className="h-6 w-6" strokeWidth={3} /> : <X className="h-6 w-6" strokeWidth={3} />}
              {VOTE_RESULT_LABEL[vote.result]}
            </div>
            <div className="mt-2 text-[15px] tabular-nums text-zinc-300">
              Za {vote.votes_for} · Przeciw {vote.votes_against} · Wstrzymało się {vote.votes_abstain}
            </div>
            {vote.result === 'no_quorum' && (
              <p className="mt-1 text-[13px] text-zinc-400">Zagłosowało {cast} z wymaganych {required}.</p>
            )}
            {vote.result === 'passed' && canManage && (
              <div className="mt-4 flex justify-center">
                {resolutionId ? (
                  <Link href={`/${org}/resolutions/${resolutionId}`}
                    className="press inline-flex h-10 items-center rounded-xl border border-zinc-700 px-4 text-[14px] font-medium text-zinc-100">
                    Otwórz uchwałę
                  </Link>
                ) : (
                  <CreateResolutionButton org={org} voteId={vote.id} />
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
