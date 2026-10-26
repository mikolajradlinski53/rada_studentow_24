-- RadaStudentów24 — Migration 027: secret ballots are COUNTERS, never rows
--
-- Before: a secret vote stored one ballot row per voter (mandate_id NULL), and
-- elections stored one election_ballots row per choice. Two weaknesses:
--   * election_ballots were readable by every org member, live (realtime):
--     watching who taps their phone + the row that appears = de-anonymisation.
--     Chair/KR also see receipts (who, when) -> exact linkage by order/time.
--   * Anyone with raw DB access could pair the k-th ballot row (physical order)
--     with the k-th receipt (cast_at).
--
-- After: per-vote / per-candidate counters in tables with NO read policy. A
-- ballot only increments a counter; no per-voter choice is stored anywhere.
-- Receipts (who voted - needed for "one vote each") stay, without the choice.
-- Results are released only after the vote is closed.

CREATE TABLE IF NOT EXISTS secret_tallies (
  vote_id        UUID PRIMARY KEY REFERENCES votes(id) ON DELETE CASCADE,
  votes_for      INT NOT NULL DEFAULT 0,
  votes_against  INT NOT NULL DEFAULT 0,
  votes_abstain  INT NOT NULL DEFAULT 0
);
ALTER TABLE secret_tallies ENABLE ROW LEVEL SECURITY; -- no policies: unreadable via API

CREATE TABLE IF NOT EXISTS candidate_tallies (
  candidate_id  UUID PRIMARY KEY REFERENCES vote_candidates(id) ON DELETE CASCADE,
  vote_id       UUID NOT NULL REFERENCES votes(id) ON DELETE CASCADE,
  votes         INT NOT NULL DEFAULT 0
);
ALTER TABLE candidate_tallies ENABLE ROW LEVEL SECURITY; -- no policies

-- Per-voter election rows are gone (table was empty in production).
DROP POLICY IF EXISTS "election_ballot_read" ON election_ballots;
DROP TABLE IF EXISTS election_ballots;
DROP FUNCTION IF EXISTS cast_election_ballot(UUID, UUID, UUID);
DELETE FROM ballots WHERE mandate_id IS NULL; -- legacy unlinked secret rows (none expected)

-- ------------------------------------------------------------
-- Casting
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
    -- Named vote: the choice is public by definition.
    INSERT INTO ballots (vote_id, mandate_id, choice) VALUES (p_vote_id, p_mandate_id, p_choice);
  ELSE
    -- Secret: (1) receipt = "this mandate has voted" (unique -> no double vote),
    -- (2) bump an unreadable counter. The choice is never stored with a person.
    INSERT INTO secret_ballot_receipts (vote_id, mandate_id) VALUES (p_vote_id, p_mandate_id);
    INSERT INTO secret_tallies (vote_id, votes_for, votes_against, votes_abstain)
    VALUES (p_vote_id, (p_choice = 'for')::int, (p_choice = 'against')::int, (p_choice = 'abstain')::int)
    ON CONFLICT (vote_id) DO UPDATE SET
      votes_for     = secret_tallies.votes_for     + (p_choice = 'for')::int,
      votes_against = secret_tallies.votes_against + (p_choice = 'against')::int,
      votes_abstain = secret_tallies.votes_abstain + (p_choice = 'abstain')::int;
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
DECLARE v_kind TEXT; v_status TEXT; v_seats INT; v_n INT; v_term UUID; v_closes TIMESTAMPTZ;
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
  INSERT INTO candidate_tallies (candidate_id, vote_id, votes)
  SELECT x, p_vote_id, 1 FROM unnest(p_candidate_ids) x
  ON CONFLICT (candidate_id) DO UPDATE SET votes = candidate_tallies.votes + 1;
  UPDATE votes SET secret_cast_count = secret_cast_count + 1 WHERE id = p_vote_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION cast_ballot(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cast_ballot(UUID, UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION cast_election_ballots(UUID, UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cast_election_ballots(UUID, UUID, UUID[]) TO authenticated;

-- ------------------------------------------------------------
-- Tally: secret votes read the counters
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION tally_vote_core(p_vote_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_for INT; v_against INT; v_abstain INT; v_total INT; v_type TEXT;
  v_threshold TEXT; v_result TEXT; v_session_id UUID; v_kind TEXT;
  v_present INT; v_quorum JSONB; v_required INT; v_has_quorum BOOLEAN;
BEGIN
  SELECT v.threshold, v.session_id, s.kind, v.vote_type INTO v_threshold, v_session_id, v_kind, v_type
  FROM votes v JOIN sessions s ON s.id = v.session_id WHERE v.id = p_vote_id;

  IF v_type = 'secret' THEN
    SELECT coalesce(t.votes_for, 0), coalesce(t.votes_against, 0), coalesce(t.votes_abstain, 0)
    INTO v_for, v_against, v_abstain
    FROM (SELECT 1) one LEFT JOIN secret_tallies t ON t.vote_id = p_vote_id;
  ELSE
    SELECT
      COUNT(*) FILTER (WHERE choice = 'for'),
      COUNT(*) FILTER (WHERE choice = 'against'),
      COUNT(*) FILTER (WHERE choice = 'abstain')
    INTO v_for, v_against, v_abstain
    FROM ballots WHERE vote_id = p_vote_id;
  END IF;
  v_total := v_for + v_against + v_abstain;

  v_quorum := calculate_quorum(v_session_id);
  v_required := (v_quorum->>'required')::INT;

  IF v_kind = 'circular' THEN
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

  IF v_kind = 'circular' THEN
    UPDATE sessions SET status = 'closed', closed_at = now() WHERE id = v_session_id AND status = 'in_progress';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION tally_vote_core(UUID) FROM PUBLIC, anon, authenticated;

-- Election results: per-candidate counts, released only once the vote is closed.
CREATE OR REPLACE FUNCTION election_results(p_vote_id UUID)
RETURNS TABLE (candidate_id UUID, votes INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT vc.id, coalesce(ct.votes, 0)
  FROM vote_candidates vc
  JOIN votes v ON v.id = vc.vote_id
  JOIN sessions s ON s.id = v.session_id
  JOIN organs o ON o.id = s.organ_id
  LEFT JOIN candidate_tallies ct ON ct.candidate_id = vc.id
  WHERE vc.vote_id = p_vote_id AND v.status = 'closed' AND user_has_org_access(o.org_id);
$$;
REVOKE ALL ON FUNCTION election_results(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION election_results(UUID) TO authenticated;
