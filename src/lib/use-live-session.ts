'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { isVotingRole } from '@/lib/roles';
import type {
  Session, AgendaItem, Vote, Attendance, Mandate, Profile, FloorRequest,
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
  /** Closed votes of the sitting, newest first (live: refreshed on every vote change). */
  closedVotes: Vote[];
  /** Mandates that already voted in the active OPEN vote (who, not how - choices
   *  are revealed only at close, migration 028); empty for secret votes. */
  openVoterIds: string[];
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
  /** Platform superadmin: chair powers everywhere, regardless of own mandate. */
  isPlatformAdmin: boolean;
  refetch: () => Promise<void>;
}

/**
 * Per-candidate results of a CLOSED election (top `seats` marked elected).
 * Counts come from election_results(): per-voter choices aren't stored at all
 * (migration 027), and nothing is released while the election is open.
 */
export async function fetchElectionResults(supabase: SupabaseClient, vote: Vote): Promise<ElectionResult[]> {
  const [{ data: cands }, { data: counts }] = await Promise.all([
    supabase.from('vote_candidates').select('*').eq('vote_id', vote.id).order('position'),
    supabase.rpc('election_results', { p_vote_id: vote.id }),
  ]);
  const byId = new Map(((counts as { candidate_id: string; votes: number }[]) ?? []).map((r) => [r.candidate_id, r.votes]));
  const ranked = ((cands as VoteCandidate[]) ?? [])
    .map((c) => ({ candidate: c, count: byId.get(c.id) ?? 0 }))
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
  const [closedVotes, setClosedVotes] = useState<Vote[]>([]);
  const [openVoterIds, setOpenVoterIds] = useState<string[]>([]);
  const [myMandate, setMyMandate] = useState<Mandate | null>(null);
  const [myBallot, setMyBallot] = useState<BallotChoice | null>(null);
  const [quorum, setQuorum] = useState<QuorumInfo | null>(null);
  const [roster, setRoster] = useState<MandateWithProfile[]>([]);
  const [candidates, setCandidates] = useState<VoteCandidate[]>([]);
  const [floorRequests, setFloorRequests] = useState<FloorRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  const supabase = createClient();

  // Realtime bursts (a vote opening, candidates, many ballots) fire overlapping
  // refetches. Only the newest one may write state - otherwise a slower, older
  // response lands last and e.g. wipes the candidates of a just-opened election.
  const seq = useRef(0);

  const refetch = useCallback(async () => {
    if (!sessionId) return;
    const mine = ++seq.current;

    // Wave 1: everything that only needs the session id.
    const [
      { data: { user } }, { data: sess }, { data: items }, { data: pa },
      { data: att }, { data: q }, { data: fr }, { data: vote }, { data: closed },
    ] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('sessions').select('*').eq('id', sessionId).maybeSingle(),
      supabase.from('agenda_items').select('*').eq('session_id', sessionId).order('position'),
      supabase.rpc('is_platform_admin'),
      supabase.from('attendance').select('*, mandate:mandates(*, profile:profiles(*))').eq('session_id', sessionId),
      supabase.rpc('calculate_quorum', { p_session_id: sessionId }),
      supabase.from('floor_requests').select('*, mandate:mandates(*, profile:profiles(*))')
        .eq('session_id', sessionId).in('status', ['waiting', 'speaking']).order('created_at'),
      supabase.from('votes').select('*').eq('session_id', sessionId).eq('status', 'open').limit(1).maybeSingle(),
      supabase.from('votes').select('*').eq('session_id', sessionId).eq('status', 'closed').order('closed_at', { ascending: false }),
    ]);
    const openVote = vote as Vote | null;

    // Wave 2: depends on the user, the sitting's term and the open vote.
    const termId = (sess as Session | null)?.term_id;
    const [mandateRes, rosterRes, votersRes, candsRes] = await Promise.all([
      // Scoped to this sitting's term (a person can hold mandates in several orgs/terms).
      user && termId
        ? supabase.from('mandates').select('*').eq('profile_id', user.id).eq('term_id', termId).eq('is_active', true).limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
      termId
        ? supabase.from('mandates').select('*, profile:profiles(*)').eq('term_id', termId).eq('is_active', true)
        : Promise.resolve({ data: null }),
      // Who has voted in an OPEN vote. Choices stay hidden until close (RLS).
      openVote?.vote_type === 'open'
        ? supabase.rpc('open_vote_voters', { p_vote_id: openVote.id })
        : Promise.resolve({ data: [] }),
      openVote?.vote_kind === 'election'
        ? supabase.from('vote_candidates').select('*').eq('vote_id', openVote.id).order('position')
        : Promise.resolve({ data: [] }),
    ]);
    const mandate = (mandateRes.data as Mandate | null) ?? null;

    // Wave 3: have I already voted?
    let ballot: BallotChoice | null = null;
    if (openVote && mandate) {
      if (openVote.vote_type === 'open') {
        const { data } = await supabase.from('ballots').select('choice')
          .eq('vote_id', openVote.id).eq('mandate_id', mandate.id).limit(1).maybeSingle();
        ballot = (data?.choice as BallotChoice) ?? null;
      } else {
        const { data } = await supabase.from('secret_ballot_receipts').select('id')
          .eq('vote_id', openVote.id).eq('mandate_id', mandate.id).limit(1).maybeSingle();
        ballot = data ? 'for' : null;
      }
    }

    if (mine !== seq.current) return; // a newer refetch is on its way
    setSession(sess);
    setAgendaItems(items ?? []);
    setIsPlatformAdmin(pa === true);
    setAttendance((att as AttendanceWithMandate[]) ?? []);
    setQuorum(q as QuorumInfo | null);
    setFloorRequests(orderQueue((fr as FloorRequest[]) ?? []));
    setActiveVote(openVote);
    setClosedVotes((closed as Vote[]) ?? []);
    setMyMandate(mandate);
    if (termId) setRoster((rosterRes.data as MandateWithProfile[]) ?? []);
    setOpenVoterIds(((votersRes.data as { mandate_id: string }[]) ?? []).map((r) => r.mandate_id));
    setCandidates((candsRes.data as VoteCandidate[]) ?? []);
    setMyBallot(ballot);
    setLoading(false);
  }, [sessionId, supabase]);

  // Initial load. Scheduled (not called inline) so the effect body itself never sets state.
  useEffect(() => {
    const t = setTimeout(() => { void refetch(); }, 0);
    return () => clearTimeout(t);
  }, [refetch]);

  useEffect(() => {
    if (!sessionId) return;
    // Coalesce bursts (20 ballots in a few seconds) into one reload per ~150 ms.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const kick = () => { clearTimeout(timer); timer = setTimeout(() => { void refetch(); }, 150); };
    const channel = supabase
      .channel(`session-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes', filter: `session_id=eq.${sessionId}` }, kick)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ballots' }, kick)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter: `session_id=eq.${sessionId}` }, kick)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agenda_items', filter: `session_id=eq.${sessionId}` }, kick)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'floor_requests', filter: `session_id=eq.${sessionId}` }, kick)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` }, kick)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vote_candidates' }, kick)
      .subscribe();
    return () => { clearTimeout(timer); supabase.removeChannel(channel); };
  }, [sessionId, supabase, refetch]);

  // Seat holders only - matches calculate_quorum (KR / protokolant don't count).
  const presentCount = attendance.filter(
    (a) => (a.status === 'present' || a.status === 'late') && isVotingRole(a.mandate?.role)
  ).length;

  return {
    loading, session, agendaItems, attendance, activeVote, closedVotes, openVoterIds,
    myMandate, myBallot, quorum, presentCount, roster, candidates, floorRequests, isPlatformAdmin, refetch,
  };
}

/** Ballots cast so far in a vote (any type; the counter is bumped per ballot). */
export function castCount(vote: Vote | null): number {
  return vote?.secret_cast_count ?? 0;
}

export type NamedBallot = { choice: BallotChoice; name: string };

/** Who voted how in a CLOSED open vote (RLS releases the rows at close). */
export async function fetchNamedBallots(supabase: SupabaseClient, voteId: string): Promise<NamedBallot[]> {
  const { data } = await supabase
    .from('ballots').select('choice, mandate:mandates(profile:profiles(full_name))').eq('vote_id', voteId);
  type Row = { choice: BallotChoice; mandate: { profile: { full_name: string | null } | null } | null };
  return ((data as unknown as Row[]) ?? [])
    .map((r) => ({ choice: r.choice, name: r.mandate?.profile?.full_name ?? '-' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
}
