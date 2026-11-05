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
  /** After the server accepted my ballot: show it at once (the refetch confirms it). */
  markMyBallot: (choice: BallotChoice) => void;
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
  // Who I am in this sitting + the roster barely change during a sitting: load
  // them once (and every few minutes), not on every realtime event. With ~20
  // phones reacting to each check-in / ballot, per-event extras (auth round
  // trip, roster, mandate) queued the DB for 10-30 s and froze the page.
  const stable = useRef<{ at: number; mandate: Mandate | null; roster: MandateWithProfile[] | null; pa: boolean } | null>(null);

  const refetch = useCallback(async () => {
    if (!sessionId) return;
    const mine = ++seq.current;

    // The whole live state in ONE round trip (live_state RPC, migration 038).
    const { data: ls, error: lsErr } = await supabase.rpc('live_state', { p_session_id: sessionId });
    if (lsErr || !ls) { if (mine === seq.current) setLoading(false); return; }
    const st = ls as {
      session: Session | null; agenda: AgendaItem[]; attendance: AttendanceWithMandate[]; quorum: QuorumInfo | null;
      floor: FloorRequest[]; open_vote: Vote | null; closed_votes: Vote[]; open_voters: string[];
      candidates: VoteCandidate[]; my_ballot: BallotChoice | null;
    };
    const termId = st.session?.term_id;

    // Stable part: own mandate, roster, superadmin flag (session read locally, no auth round trip).
    if (termId && (!stable.current || Date.now() - stable.current.at > 5 * 60_000)) {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const uid = authSession?.user.id;
      const [mandateRes, rosterRes, paRes] = await Promise.all([
        // Scoped to this sitting's term (a person can hold mandates in several orgs/terms).
        uid
          ? supabase.from('mandates').select('*').eq('profile_id', uid).eq('term_id', termId).eq('is_active', true).limit(1).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('mandates').select('*, profile:profiles(*)').eq('term_id', termId).eq('is_active', true),
        supabase.rpc('is_platform_admin'),
      ]);
      stable.current = {
        at: Date.now(),
        mandate: (mandateRes.data as Mandate | null) ?? null,
        roster: (rosterRes.data as MandateWithProfile[]) ?? [],
        pa: paRes.data === true,
      };
    }
    const mandate = stable.current?.mandate ?? null;
    if (mine !== seq.current) return; // a newer refetch is on its way
    setSession(st.session);
    setAgendaItems(st.agenda ?? []);
    setIsPlatformAdmin(stable.current?.pa === true);
    setAttendance(st.attendance ?? []);
    setQuorum(st.quorum);
    setFloorRequests(orderQueue(st.floor ?? []));
    setActiveVote(st.open_vote);
    setClosedVotes(st.closed_votes ?? []);
    setMyMandate(mandate);
    if (stable.current?.roster) setRoster(stable.current.roster);
    setOpenVoterIds(st.open_voters ?? []);
    setCandidates(st.candidates ?? []);
    setMyBallot(st.my_ballot ?? null);
    setLoading(false);
  }, [sessionId, supabase]);

  // Initial load. Scheduled (not called inline) so the effect body itself never sets state.
  useEffect(() => {
    const t = setTimeout(() => { void refetch(); }, 0);
    return () => clearTimeout(t);
  }, [refetch]);

  useEffect(() => {
    if (!sessionId) return;
    // Coalesce bursts (20 check-ins / ballots in a few seconds) and spread the
    // phones out (random 0-1.2 s) so they don't all hit the DB in the same instant.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const kick = () => { clearTimeout(timer); timer = setTimeout(() => { void refetch(); }, 400 + Math.random() * 1200); };
    // Fast path: the realtime row itself shows the change at once (a vote
    // opening, the turnout counter, a closed vote, the current agenda item);
    // the spread-out refetch then fills in the rest. Bumping seq drops any
    // older refetch still in flight so it can't paint stale state over this.
    const applyVote = (v: Vote | undefined) => {
      if (!v?.id) return;
      seq.current++;
      if (v.status === 'open') {
        setActiveVote((cur) => (!cur || cur.id === v.id ? v : cur));
      } else if (v.status === 'closed') {
        setActiveVote((cur) => (cur?.id === v.id ? null : cur));
        setClosedVotes((cur) => [v, ...cur.filter((x) => x.id !== v.id)]);
      }
    };
    const applyItem = (it: AgendaItem | undefined) => {
      if (!it?.id) return;
      seq.current++;
      setAgendaItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, ...it } : x)));
    };
    // No `ballots` subscription: every ballot also bumps votes.secret_cast_count,
    // which the votes listener already catches (and others' ballots are hidden while open).
    const channel = supabase
      .channel(`session-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes', filter: `session_id=eq.${sessionId}` }, (p) => { applyVote(p.new as Vote); kick(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter: `session_id=eq.${sessionId}` }, kick)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agenda_items', filter: `session_id=eq.${sessionId}` }, (p) => { applyItem(p.new as AgendaItem); kick(); })
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
    markMyBallot: (choice: BallotChoice) => { seq.current++; setMyBallot(choice); },
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
