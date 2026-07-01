'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type {
  Session, AgendaItem, Vote, Attendance, Mandate, Profile, Ballot, FloorRequest,
  VoteCandidate, ElectionResult, BallotChoice, QuorumInfo,
} from '@/types/database';

export type MandateWithProfile = Mandate & { profile: Profile };
export type AttendanceWithMandate = Attendance & { mandate: MandateWithProfile };

export interface LiveSessionData {
  loading: boolean;
  session: Session | null;
  agendaItems: AgendaItem[];
  attendance: AttendanceWithMandate[];
  activeVote: Vote | null;
  /** Individual ballots of the active OPEN vote (readable); empty for secret votes. */
  openVoteBallots: Ballot[];
  myMandate: Mandate | null;
  myBallot: BallotChoice | null;
  quorum: QuorumInfo | null;
  presentCount: number;
  /** All active mandates of the session's term (for the chair roll call). */
  roster: MandateWithProfile[];
  /** Candidates of the active election (empty for motions). */
  candidates: VoteCandidate[];
  /** Active discussion queue (waiting + currently speaking), ordered by priority. */
  floorRequests: FloorRequest[];
  refetch: () => Promise<void>;
}

/** Per-candidate tally for an election vote (top `seats` marked elected). */
export async function fetchElectionResults(supabase: SupabaseClient, vote: Vote): Promise<ElectionResult[]> {
  const [{ data: cands }, { data: ballots }] = await Promise.all([
    supabase.from('vote_candidates').select('*').eq('vote_id', vote.id).order('position'),
    supabase.from('election_ballots').select('candidate_id').eq('vote_id', vote.id),
  ]);
  const counts = new Map<string, number>();
  for (const b of (ballots as { candidate_id: string }[]) ?? []) {
    counts.set(b.candidate_id, (counts.get(b.candidate_id) ?? 0) + 1);
  }
  const ranked = ((cands as VoteCandidate[]) ?? [])
    .map((c) => ({ candidate: c, count: counts.get(c.id) ?? 0 }))
    .sort((a, b) => b.count - a.count);
  const electedIds = new Set(ranked.slice(0, vote.seats).filter((r) => r.count > 0).map((r) => r.candidate.id));
  return ranked.map((r) => ({ ...r, elected: electedIds.has(r.candidate.id) }));
}

// Formal motions jump the queue, then ad vocem, then ordinary speaking turns.
const KIND_PRIORITY: Record<FloorRequest['kind'], number> = { formal: 0, ad_vocem: 1, speak: 2 };

function orderQueue(rows: FloorRequest[]): FloorRequest[] {
  return [...rows].sort((a, b) => {
    if (a.status === 'speaking' && b.status !== 'speaking') return -1;
    if (b.status === 'speaking' && a.status !== 'speaking') return 1;
    if (KIND_PRIORITY[a.kind] !== KIND_PRIORITY[b.kind]) return KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind];
    return a.created_at.localeCompare(b.created_at);
  });
}

/**
 * Subscribes to a session's realtime channel (votes, ballots, attendance, agenda)
 * and exposes the live state. Used by both the chair's live panel and the
 * read-only projector view so the two never drift apart.
 */
export function useLiveSession(sessionId: string): LiveSessionData {
  const [session, setSession] = useState<Session | null>(null);
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [attendance, setAttendance] = useState<AttendanceWithMandate[]>([]);
  const [activeVote, setActiveVote] = useState<Vote | null>(null);
  const [openVoteBallots, setOpenVoteBallots] = useState<Ballot[]>([]);
  const [myMandate, setMyMandate] = useState<Mandate | null>(null);
  const [myBallot, setMyBallot] = useState<BallotChoice | null>(null);
  const [quorum, setQuorum] = useState<QuorumInfo | null>(null);
  const [roster, setRoster] = useState<MandateWithProfile[]>([]);
  const [candidates, setCandidates] = useState<VoteCandidate[]>([]);
  const [floorRequests, setFloorRequests] = useState<FloorRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  const refetch = useCallback(async () => {
    if (!sessionId) return;

    const { data: { user } } = await supabase.auth.getUser();

    const { data: sess } = await supabase
      .from('sessions').select('*').eq('id', sessionId).maybeSingle();
    setSession(sess);

    const { data: items } = await supabase
      .from('agenda_items').select('*').eq('session_id', sessionId).order('position');
    setAgendaItems(items ?? []);

    let mandate: Mandate | null = null;
    if (user) {
      const { data } = await supabase
        .from('mandates').select('*')
        .eq('profile_id', user.id).eq('is_active', true).limit(1).maybeSingle();
      mandate = data;
    }
    setMyMandate(mandate);

    const { data: att } = await supabase
      .from('attendance')
      .select('*, mandate:mandates(*, profile:profiles(*))')
      .eq('session_id', sessionId);
    setAttendance((att as AttendanceWithMandate[]) ?? []);

    if (sess?.term_id) {
      const { data: roster } = await supabase
        .from('mandates')
        .select('*, profile:profiles(*)')
        .eq('term_id', sess.term_id)
        .eq('is_active', true);
      setRoster((roster as MandateWithProfile[]) ?? []);
    }

    const { data: q } = await supabase.rpc('calculate_quorum', { p_session_id: sessionId });
    setQuorum(q as QuorumInfo | null);

    const { data: fr } = await supabase
      .from('floor_requests')
      .select('*, mandate:mandates(*, profile:profiles(*))')
      .eq('session_id', sessionId)
      .in('status', ['waiting', 'speaking'])
      .order('created_at');
    setFloorRequests(orderQueue((fr as FloorRequest[]) ?? []));

    const { data: vote } = await supabase
      .from('votes').select('*')
      .eq('session_id', sessionId).eq('status', 'open').limit(1).maybeSingle();
    setActiveVote(vote);

    // Live tally source for OPEN votes (RLS exposes only open-vote ballots).
    if (vote && vote.vote_type === 'open') {
      const { data: ballots } = await supabase
        .from('ballots').select('*').eq('vote_id', vote.id);
      setOpenVoteBallots((ballots as Ballot[]) ?? []);
    } else {
      setOpenVoteBallots([]);
    }

    // Candidates for an active election.
    if (vote && vote.vote_kind === 'election') {
      const { data: cands } = await supabase
        .from('vote_candidates').select('*').eq('vote_id', vote.id).order('position');
      setCandidates((cands as VoteCandidate[]) ?? []);
    } else {
      setCandidates([]);
    }

    // Have I already voted?
    if (vote && mandate) {
      if (vote.vote_type === 'open') {
        const { data: ballot } = await supabase
          .from('ballots').select('choice')
          .eq('vote_id', vote.id).eq('mandate_id', mandate.id).limit(1).maybeSingle();
        setMyBallot((ballot?.choice as BallotChoice) ?? null);
      } else {
        const { data: receipt } = await supabase
          .from('secret_ballot_receipts').select('id')
          .eq('vote_id', vote.id).eq('mandate_id', mandate.id).limit(1).maybeSingle();
        setMyBallot(receipt ? 'for' : null);
      }
    } else {
      setMyBallot(null);
    }

    setLoading(false);
  }, [sessionId, supabase]);

  useEffect(() => { refetch(); }, [refetch]);

  useEffect(() => {
    if (!sessionId) return;
    const channel = supabase
      .channel(`session-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes', filter: `session_id=eq.${sessionId}` }, () => refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ballots' }, () => refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter: `session_id=eq.${sessionId}` }, () => refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agenda_items', filter: `session_id=eq.${sessionId}` }, () => refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'floor_requests', filter: `session_id=eq.${sessionId}` }, () => refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` }, () => refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vote_candidates' }, () => refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'election_ballots' }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId, supabase, refetch]);

  const presentCount = attendance.filter(
    (a) => a.status === 'present' || a.status === 'late'
  ).length;

  return {
    loading, session, agendaItems, attendance, activeVote, openVoteBallots,
    myMandate, myBallot, quorum, presentCount, roster, candidates, floorRequests, refetch,
  };
}

/** Aggregate live tally for the active vote. */
export function tallyOf(vote: Vote | null, openBallots: Ballot[]) {
  if (!vote) return { forN: 0, against: 0, abstain: 0, cast: 0 };
  if (vote.vote_type === 'open') {
    const forN = openBallots.filter((b) => b.choice === 'for').length;
    const against = openBallots.filter((b) => b.choice === 'against').length;
    const abstain = openBallots.filter((b) => b.choice === 'abstain').length;
    return { forN, against, abstain, cast: forN + against + abstain };
  }
  // Secret: only turnout is known live (no breakdown until close).
  return { forN: 0, against: 0, abstain: 0, cast: vote.secret_cast_count };
}
