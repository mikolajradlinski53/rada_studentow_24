-- RadaStudentów24 — Migration 038: the whole live state of a sitting in ONE call
-- NOTE: applied to production; the app does not call live_state() (it returned 500s
-- under concurrent load, see revert 5f789b6). Kept so local migrations match the DB.
--
-- The live page used 7 REST requests per refresh (x every phone x every
-- realtime event). live_state() returns the same data in one round trip.
-- SECURITY INVOKER: every row is still filtered by the caller's RLS, exactly
-- as the separate requests were.

CREATE OR REPLACE FUNCTION live_state(p_session_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH ov AS (
    SELECT * FROM votes WHERE session_id = p_session_id AND status = 'open' ORDER BY opened_at DESC LIMIT 1
  ), me AS (
    SELECT m.id FROM mandates m JOIN sessions s ON s.term_id = m.term_id
    WHERE s.id = p_session_id AND m.profile_id = auth.uid() AND m.is_active LIMIT 1
  )
  SELECT jsonb_build_object(
    'session', (SELECT to_jsonb(s) FROM sessions s WHERE s.id = p_session_id),
    'agenda', coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.position) FROM agenda_items a WHERE a.session_id = p_session_id), '[]'::jsonb),
    'attendance', coalesce((
      SELECT jsonb_agg(to_jsonb(a) || jsonb_build_object('mandate', to_jsonb(m) || jsonb_build_object('profile', to_jsonb(pr))))
      FROM attendance a JOIN mandates m ON m.id = a.mandate_id LEFT JOIN profiles pr ON pr.id = m.profile_id
      WHERE a.session_id = p_session_id), '[]'::jsonb),
    'quorum', calculate_quorum(p_session_id),
    'floor', coalesce((
      SELECT jsonb_agg(to_jsonb(f) || jsonb_build_object('mandate', to_jsonb(m) || jsonb_build_object('profile', to_jsonb(pr))) ORDER BY f.created_at)
      FROM floor_requests f JOIN mandates m ON m.id = f.mandate_id LEFT JOIN profiles pr ON pr.id = m.profile_id
      WHERE f.session_id = p_session_id AND f.status IN ('waiting', 'speaking')), '[]'::jsonb),
    'open_vote', (SELECT to_jsonb(ov) FROM ov),
    'closed_votes', coalesce((
      SELECT jsonb_agg(to_jsonb(v) ORDER BY v.closed_at DESC)
      FROM votes v WHERE v.session_id = p_session_id AND v.status = 'closed'), '[]'::jsonb),
    -- who has voted in an OPEN named vote (never how - choices stay hidden until close)
    'open_voters', coalesce((
      SELECT jsonb_agg(x.mandate_id) FROM ov, LATERAL open_vote_voters(ov.id) x WHERE ov.vote_type = 'open'), '[]'::jsonb),
    'candidates', coalesce((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY c.position)
      FROM ov JOIN vote_candidates c ON c.vote_id = ov.id WHERE ov.vote_kind = 'election'), '[]'::jsonb),
    -- my ballot in the open vote: the choice for named votes, just "voted" for secret ones
    'my_ballot', (
      SELECT CASE
        WHEN ov.vote_type = 'open' THEN (SELECT b.choice FROM ballots b, me WHERE b.vote_id = ov.id AND b.mandate_id = me.id LIMIT 1)
        ELSE (SELECT 'for' FROM secret_ballot_receipts r, me WHERE r.vote_id = ov.id AND r.mandate_id = me.id LIMIT 1)
      END FROM ov)
  );
$$;
REVOKE ALL ON FUNCTION live_state(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION live_state(UUID) TO authenticated;
