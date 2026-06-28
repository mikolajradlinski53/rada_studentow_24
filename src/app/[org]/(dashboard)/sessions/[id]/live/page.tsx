'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { clsx } from 'clsx';
import type {
  Session, AgendaItem, Vote, Attendance, Mandate, Profile,
  BallotChoice, VoteType, QuorumInfo
} from '@/types/database';

type MandateWithProfile = Mandate & { profile: Profile };
type AttendanceWithMandate = Attendance & { mandate: MandateWithProfile };

const VOTE_RESULT_LABEL: Record<NonNullable<Vote['result']>, string> = {
  passed: 'Przyjęto',
  rejected: 'Odrzucono',
  no_quorum: 'Brak kworum',
};

export default function LiveSessionPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const [sessionId, setSessionId] = useState<string>('');
  const [session, setSession] = useState<Session | null>(null);
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [attendance, setAttendance] = useState<AttendanceWithMandate[]>([]);
  const [activeVote, setActiveVote] = useState<Vote | null>(null);
  const [myMandate, setMyMandate] = useState<Mandate | null>(null);
  const [myBallot, setMyBallot] = useState<BallotChoice | null>(null);
  const [quorum, setQuorum] = useState<QuorumInfo | null>(null);
  const [isChair, setIsChair] = useState(false);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  // Init
  useEffect(() => {
    params.then(p => setSessionId(p.id));
  }, [params]);

  const fetchData = useCallback(async () => {
    if (!sessionId) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Fetch session
    const { data: sess } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();
    setSession(sess);

    // Fetch agenda
    const { data: items } = await supabase
      .from('agenda_items')
      .select('*')
      .eq('session_id', sessionId)
      .order('position');
    setAgendaItems(items ?? []);

    // Fetch my mandate
    const { data: mandate } = await supabase
      .from('mandates')
      .select('*')
      .eq('profile_id', user.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    setMyMandate(mandate);
    setIsChair(
      mandate?.role === 'chair' || mandate?.role === 'admin' || sess?.chaired_by === user.id
    );

    // Fetch attendance
    const { data: att } = await supabase
      .from('attendance')
      .select('*, mandate:mandates(*, profile:profiles(*))')
      .eq('session_id', sessionId);
    setAttendance((att as AttendanceWithMandate[]) ?? []);

    // Fetch quorum
    const { data: q } = await supabase.rpc('calculate_quorum', { p_session_id: sessionId });
    setQuorum(q as QuorumInfo | null);

    // Fetch active vote
    const { data: votes } = await supabase
      .from('votes')
      .select('*')
      .eq('session_id', sessionId)
      .eq('status', 'open')
      .limit(1)
      .maybeSingle();
    setActiveVote(votes);

    // Check if I already voted
    if (votes && mandate) {
      if (votes.vote_type === 'open') {
        const { data: ballot } = await supabase
          .from('ballots')
          .select('choice')
          .eq('vote_id', votes.id)
          .eq('mandate_id', mandate.id)
          .limit(1)
          .maybeSingle();
        setMyBallot(ballot?.choice as BallotChoice | null);
      } else {
        const { data: receipt } = await supabase
          .from('secret_ballot_receipts')
          .select('id')
          .eq('vote_id', votes.id)
          .eq('mandate_id', mandate.id)
          .limit(1)
          .maybeSingle();
        setMyBallot(receipt ? 'for' : null); // just marks "already voted"
      }
    } else {
      setMyBallot(null);
    }

    setLoading(false);
  }, [sessionId, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscriptions
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`session-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes', filter: `session_id=eq.${sessionId}` }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ballots' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter: `session_id=eq.${sessionId}` }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agenda_items', filter: `session_id=eq.${sessionId}` }, () => fetchData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId, supabase, fetchData]);

  // === ACTIONS ===

  const checkIn = async () => {
    if (!myMandate) return;

    await supabase.from('attendance').upsert({
      session_id: sessionId,
      mandate_id: myMandate.id,
      status: 'present',
      checked_in_at: new Date().toISOString(),
    }, { onConflict: 'session_id,mandate_id' });
  };

  const openVote = async (agendaItem: AgendaItem, voteType: VoteType) => {
    await supabase.from('votes').insert({
      session_id: sessionId,
      agenda_item_id: agendaItem.id,
      title: `Głosowanie: ${agendaItem.title}`,
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

    // All voting goes through the cast_ballot RPC: it enforces ownership, open
    // status, atomic one-vote dedupe, and secret-ballot anonymity server-side.
    const { error } = await supabase.rpc('cast_ballot', {
      p_vote_id: activeVote.id,
      p_mandate_id: myMandate.id,
      p_choice: choice,
    });

    if (error) {
      alert('Nie udało się oddać głosu. Odśwież stronę i spróbuj ponownie.');
      return;
    }
    setMyBallot(choice);
  };

  const closeSession = async () => {
    if (!confirm('Zamknąć posiedzenie?')) return;
    await supabase
      .from('sessions')
      .update({ status: 'protocol_pending', closed_at: new Date().toISOString() })
      .eq('id', sessionId);
  };

  // === RENDER ===

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center text-zinc-500 text-sm">
        Ładowanie posiedzenia...
      </div>
    );
  }

  if (!session) return null;

  const myAttendance = attendance.find(a => a.mandate_id === myMandate?.id);
  const isCheckedIn = myAttendance?.status === 'present' || myAttendance?.status === 'late';
  const presentCount = attendance.filter(a => a.status === 'present' || a.status === 'late').length;

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <h1 className="text-lg font-semibold text-zinc-100">{session.title}</h1>
          </div>
        </div>
        {isChair && session.status === 'in_progress' && (
          <button
            onClick={closeSession}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:text-red-400 hover:border-red-800 transition-colors"
          >
            Zamknij posiedzenie
          </button>
        )}
      </div>

      {/* Quorum + Attendance strip */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-400">Obecność</span>
            <span className={clsx(
              'rounded-full px-2.5 py-0.5 text-xs font-medium',
              quorum?.has_quorum
                ? 'bg-emerald-900/50 text-emerald-300'
                : 'bg-red-900/50 text-red-300'
            )}>
              {quorum?.has_quorum ? 'Kworum ✓' : 'Brak kworum'}
            </span>
          </div>
          <span className="text-sm text-zinc-400">
            {presentCount} / {quorum?.total_seats ?? '?'} (min. {quorum?.required ?? '?'})
          </span>
        </div>

        {/* Check-in button for non-checked-in members */}
        {myMandate && !isCheckedIn && (
          <button
            onClick={checkIn}
            className="w-full rounded-md bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
          >
            Potwierdź obecność
          </button>
        )}

        {isCheckedIn && (
          <div className="text-xs text-emerald-400">
            ✓ Jesteś obecny/a
          </div>
        )}
      </div>

      {/* Active vote */}
      {activeVote && (
        <div className="rounded-lg border-2 border-indigo-600 bg-indigo-950/20 p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
            <h2 className="text-sm font-medium text-indigo-300">
              Głosowanie {activeVote.vote_type === 'secret' ? 'tajne' : 'jawne'}
            </h2>
          </div>
          <p className="text-base font-medium text-zinc-100 mb-5">
            {activeVote.title}
          </p>

          {/* Voting buttons */}
          {isCheckedIn && !myBallot && (
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => castBallot('for')}
                className="rounded-lg bg-emerald-600 py-4 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors active:scale-95"
              >
                ZA
              </button>
              <button
                onClick={() => castBallot('against')}
                className="rounded-lg bg-red-600 py-4 text-sm font-semibold text-white hover:bg-red-500 transition-colors active:scale-95"
              >
                PRZECIW
              </button>
              <button
                onClick={() => castBallot('abstain')}
                className="rounded-lg bg-zinc-600 py-4 text-sm font-semibold text-white hover:bg-zinc-500 transition-colors active:scale-95"
              >
                WSTRZYMUJĘ SIĘ
              </button>
            </div>
          )}

          {myBallot && (
            <div className="text-center text-sm text-indigo-300">
              ✓ Głos oddany
              {activeVote.vote_type === 'open' && (
                <span className="text-zinc-500">
                  {' '}({myBallot === 'for' ? 'za' : myBallot === 'against' ? 'przeciw' : 'wstrzymuję się'})
                </span>
              )}
            </div>
          )}

          {!isCheckedIn && (
            <p className="text-center text-sm text-zinc-500">
              Potwierdź obecność, aby głosować.
            </p>
          )}

          {/* Chair: close vote button */}
          {isChair && (
            <button
              onClick={closeVote}
              className="mt-4 w-full rounded-md border border-indigo-600 py-2 text-sm text-indigo-300 hover:bg-indigo-900/30 transition-colors"
            >
              Zamknij głosowanie i pokaż wynik
            </button>
          )}
        </div>
      )}

      {/* Agenda items */}
      <div>
        <h2 className="text-sm font-medium text-zinc-400 mb-3">Porządek obrad</h2>
        <div className="space-y-1.5">
          {agendaItems.map((item, idx) => (
            <div
              key={item.id}
              className={clsx(
                'rounded-lg border px-4 py-3',
                item.status === 'in_progress'
                  ? 'border-indigo-600 bg-indigo-950/20'
                  : item.status === 'completed'
                    ? 'border-zinc-800 bg-zinc-900/30 opacity-60'
                    : 'border-zinc-800 bg-zinc-900/50'
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 w-5">{idx + 1}.</span>
                  <span className="text-sm text-zinc-200">{item.title}</span>
                </div>

                {/* Chair controls */}
                {isChair && !activeVote && item.status !== 'completed' && (
                  <div className="flex gap-1.5">
                    {item.item_type === 'resolution' && (
                      <>
                        <button
                          onClick={() => openVote(item, 'open')}
                          className="rounded px-2 py-1 text-xs bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
                        >
                          Głosuj jawnie
                        </button>
                        <button
                          onClick={() => openVote(item, 'secret')}
                          className="rounded px-2 py-1 text-xs bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors"
                        >
                          Głosuj tajnie
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Show results for completed votes on this item */}
              <VoteResults agendaItemId={item.id} sessionId={sessionId} />
            </div>
          ))}
        </div>
      </div>

      {/* Past votes results */}
      <PastVotesSection sessionId={sessionId} />
    </div>
  );
}

// Sub-component: vote results for an agenda item
function VoteResults({ agendaItemId, sessionId }: { agendaItemId: string; sessionId: string }) {
  const [votes, setVotes] = useState<Vote[]>([]);
  const supabase = createClient();

  useEffect(() => {
    supabase
      .from('votes')
      .select('*')
      .eq('agenda_item_id', agendaItemId)
      .eq('status', 'closed')
      .then(({ data }) => setVotes(data ?? []));
  }, [agendaItemId, supabase]);

  if (!votes.length) return null;

  return (
    <div className="mt-2 space-y-1.5">
      {votes.map(v => (
        <div key={v.id} className="flex items-center gap-3 text-xs pl-7">
          <span className={clsx(
            'rounded-full px-2 py-0.5 font-medium',
            v.result === 'passed'
              ? 'bg-emerald-900/50 text-emerald-300'
              : v.result === 'no_quorum'
                ? 'bg-amber-900/50 text-amber-300'
                : 'bg-red-900/50 text-red-300'
          )}>
            {VOTE_RESULT_LABEL[v.result ?? 'rejected']}
          </span>
          <span className="text-zinc-500">
            Za: {v.votes_for} · Przeciw: {v.votes_against} · Wstrzym.: {v.votes_abstain}
          </span>
        </div>
      ))}
    </div>
  );
}

// Sub-component: all closed votes in session
function PastVotesSection({ sessionId }: { sessionId: string }) {
  const [votes, setVotes] = useState<Vote[]>([]);
  const supabase = createClient();

  useEffect(() => {
    supabase
      .from('votes')
      .select('*')
      .eq('session_id', sessionId)
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .then(({ data }) => setVotes(data ?? []));
  }, [sessionId, supabase]);

  if (!votes.length) return null;

  return (
    <div>
      <h2 className="text-sm font-medium text-zinc-400 mb-3">Zakończone głosowania</h2>
      <div className="space-y-1.5">
        {votes.map(v => (
          <div key={v.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <div className="text-sm text-zinc-300">{v.title}</div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500">
                {v.votes_for}–{v.votes_against}–{v.votes_abstain}
              </span>
              <span className={clsx(
                'rounded-full px-2 py-0.5 text-xs font-medium',
                v.result === 'passed'
                  ? 'bg-emerald-900/50 text-emerald-300'
                  : v.result === 'no_quorum'
                    ? 'bg-amber-900/50 text-amber-300'
                    : 'bg-red-900/50 text-red-300'
              )}>
                {VOTE_RESULT_LABEL[v.result ?? 'rejected']}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
