-- RadaStudentów24 — Migration 025: głosowanie obiegowe (circular / remote vote)
-- A circular vote is modelled as a "session" of kind 'circular' with one agenda
-- item and one vote with a deadline - so resolutions, audit and the registry
-- work unchanged. Quorum = enough members VOTED (there is no roll call).
--
-- Also fixes: cast_ballot / cast_election_ballots didn't check that the voter's
-- mandate belongs to the vote's term (a member of another org could vote).

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'sitting'
  CHECK (kind IN ('sitting', 'circular'));
ALTER TABLE votes ADD COLUMN IF NOT EXISTS closes_at TIMESTAMPTZ;

-- ------------------------------------------------------------
-- Tally core (no auth) - shared by tally_vote (chair) and the deadline closer.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION tally_vote_core(p_vote_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_for INT; v_against INT; v_abstain INT; v_total INT;
  v_threshold TEXT; v_result TEXT; v_session_id UUID; v_kind TEXT;
  v_present INT; v_quorum JSONB; v_required INT; v_has_quorum BOOLEAN;
BEGIN
  SELECT v.threshold, v.session_id, s.kind INTO v_threshold, v_session_id, v_kind
  FROM votes v JOIN sessions s ON s.id = v.session_id WHERE v.id = p_vote_id;

  SELECT
    COUNT(*) FILTER (WHERE choice = 'for'),
    COUNT(*) FILTER (WHERE choice = 'against'),
    COUNT(*) FILTER (WHERE choice = 'abstain')
  INTO v_for, v_against, v_abstain
  FROM ballots WHERE vote_id = p_vote_id;
  v_total := v_for + v_against + v_abstain;

  v_quorum := calculate_quorum(v_session_id);
  v_required := (v_quorum->>'required')::INT;

  IF v_kind = 'circular' THEN
    -- No roll call: participation is the vote itself.
    v_present := v_total;
    v_has_quorum := v_total >= v_required;
  ELSE
    SELECT COUNT(*) INTO v_present FROM attendance
    WHERE session_id = v_session_id AND status IN ('present', 'late');
    v_has_quorum := (v_quorum->>'has_quorum')::BOOLEAN;
  END IF;

  IF NOT v_has_quorum THEN
    v_result := 'no_quorum';
  ELSE
    CASE v_threshold
      WHEN 'simple_majority' THEN
        v_result := CASE WHEN v_for > v_against THEN 'passed' ELSE 'rejected' END;
      WHEN 'absolute_majority' THEN
        v_result := CASE WHEN v_for > (v_present / 2.0) THEN 'passed' ELSE 'rejected' END;
      WHEN 'two_thirds' THEN
        v_result := CASE WHEN v_for >= CEIL(v_total * 2.0 / 3) THEN 'passed' ELSE 'rejected' END;
      ELSE
        v_result := CASE WHEN v_for > v_against THEN 'passed' ELSE 'rejected' END;
    END CASE;
  END IF;

  UPDATE votes SET
    votes_for = v_for, votes_against = v_against, votes_abstain = v_abstain,
    total_eligible = v_present, result = v_result, status = 'closed', closed_at = now()
  WHERE id = p_vote_id;

  -- A circular vote's "session" ends with its vote.
  IF v_kind = 'circular' THEN
    UPDATE sessions SET status = 'closed', closed_at = now() WHERE id = v_session_id AND status = 'in_progress';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION tally_vote_core(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION tally_vote(p_vote_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_session UUID; v_status TEXT;
BEGIN
  SELECT session_id, status INTO v_session, v_status FROM votes WHERE id = p_vote_id;
  IF v_session IS NULL THEN RAISE EXCEPTION 'vote_not_found'; END IF;
  IF NOT user_can_manage_session(v_session) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_status IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'vote_not_open'; END IF;
  PERFORM tally_vote_core(p_vote_id);
END;
$$;

-- Closes every circular vote past its deadline. Safe for anyone signed in to
-- call (it only acts on expired votes) - pages call it lazily, cron daily.
CREATE OR REPLACE FUNCTION close_due_circular_votes()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r RECORD; n INT := 0;
BEGIN
  FOR r IN
    SELECT v.id FROM votes v JOIN sessions s ON s.id = v.session_id
    WHERE s.kind = 'circular' AND v.status = 'open' AND v.closes_at IS NOT NULL AND v.closes_at <= now()
    FOR UPDATE OF v SKIP LOCKED
  LOOP
    PERFORM tally_vote_core(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION close_due_circular_votes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION close_due_circular_votes() TO authenticated, service_role;

-- ------------------------------------------------------------
-- Casting: term check + deadline
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION cast_ballot(p_vote_id UUID, p_mandate_id UUID, p_choice TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_type TEXT; v_status TEXT; v_term UUID; v_closes TIMESTAMPTZ;
BEGIN
  IF p_choice NOT IN ('for', 'against', 'abstain') THEN RAISE EXCEPTION 'invalid_choice'; END IF;

  SELECT v.vote_type, v.status, s.term_id, v.closes_at INTO v_type, v_status, v_term, v_closes
  FROM votes v JOIN sessions s ON s.id = v.session_id WHERE v.id = p_vote_id;
  IF v_type IS NULL THEN RAISE EXCEPTION 'vote_not_found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM mandates m
    WHERE m.id = p_mandate_id AND m.profile_id = auth.uid() AND m.is_active AND m.term_id = v_term
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_status IS DISTINCT FROM 'open' OR (v_closes IS NOT NULL AND v_closes <= now()) THEN
    RAISE EXCEPTION 'vote_not_open';
  END IF;

  IF v_type = 'open' THEN
    INSERT INTO ballots (vote_id, mandate_id, choice) VALUES (p_vote_id, p_mandate_id, p_choice);
  ELSE
    -- Secret: receipt first (aborts a double vote), then an unlinked ballot with
    -- no timestamp, then the live turnout counter.
    INSERT INTO secret_ballot_receipts (vote_id, mandate_id) VALUES (p_vote_id, p_mandate_id);
    INSERT INTO ballots (vote_id, mandate_id, choice, cast_at) VALUES (p_vote_id, NULL, p_choice, NULL);
    UPDATE votes SET secret_cast_count = secret_cast_count + 1 WHERE id = p_vote_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION cast_election_ballots(p_vote_id UUID, p_mandate_id UUID, p_candidate_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_kind TEXT; v_status TEXT; v_seats INT; v_n INT; v_term UUID; v_closes TIMESTAMPTZ; c UUID;
BEGIN
  SELECT v.vote_kind, v.status, v.seats, s.term_id, v.closes_at INTO v_kind, v_status, v_seats, v_term, v_closes
  FROM votes v JOIN sessions s ON s.id = v.session_id WHERE v.id = p_vote_id;
  IF NOT EXISTS (
    SELECT 1 FROM mandates m WHERE m.id = p_mandate_id AND m.profile_id = auth.uid() AND m.is_active AND m.term_id = v_term
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_kind IS DISTINCT FROM 'election' THEN RAISE EXCEPTION 'not_election'; END IF;
  IF v_status IS DISTINCT FROM 'open' OR (v_closes IS NOT NULL AND v_closes <= now()) THEN RAISE EXCEPTION 'vote_not_open'; END IF;
  v_n := coalesce(array_length(p_candidate_ids, 1), 0);
  IF v_n < 1 OR v_n > v_seats THEN RAISE EXCEPTION 'invalid_selection'; END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(p_candidate_ids) x) <> v_n THEN RAISE EXCEPTION 'duplicate_candidate'; END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_candidate_ids) x
    WHERE NOT EXISTS (SELECT 1 FROM vote_candidates vc WHERE vc.id = x AND vc.vote_id = p_vote_id)
  ) THEN
    RAISE EXCEPTION 'bad_candidate';
  END IF;
  INSERT INTO secret_ballot_receipts (vote_id, mandate_id) VALUES (p_vote_id, p_mandate_id);
  FOREACH c IN ARRAY p_candidate_ids LOOP
    INSERT INTO election_ballots (vote_id, candidate_id, cast_at) VALUES (p_vote_id, c, NULL);
  END LOOP;
  UPDATE votes SET secret_cast_count = secret_cast_count + 1 WHERE id = p_vote_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION cast_ballot(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cast_ballot(UUID, UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION cast_election_ballots(UUID, UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cast_election_ballots(UUID, UUID, UUID[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION tally_vote(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION tally_vote(UUID) TO authenticated;
