-- RadaStudentów24 — Migration 011: multi-seat elections
-- A voter may pick up to `seats` candidates. One receipt per voter (dedupe), one
-- election_ballot per chosen candidate, turnout bumped once. Anonymous as before.

CREATE OR REPLACE FUNCTION cast_election_ballots(p_vote_id UUID, p_mandate_id UUID, p_candidate_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind   TEXT;
  v_status TEXT;
  v_seats  INT;
  v_n      INT;
  c        UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM mandates m WHERE m.id = p_mandate_id AND m.profile_id = auth.uid() AND m.is_active = true
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT vote_kind, status, seats INTO v_kind, v_status, v_seats FROM votes WHERE id = p_vote_id;
  IF v_kind IS DISTINCT FROM 'election' THEN RAISE EXCEPTION 'not_election'; END IF;
  IF v_status IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'vote_not_open'; END IF;

  v_n := coalesce(array_length(p_candidate_ids, 1), 0);
  IF v_n < 1 OR v_n > v_seats THEN RAISE EXCEPTION 'invalid_selection'; END IF;

  -- No duplicates in the selection.
  IF (SELECT count(DISTINCT x) FROM unnest(p_candidate_ids) x) <> v_n THEN
    RAISE EXCEPTION 'duplicate_candidate';
  END IF;

  -- Every candidate must belong to this vote.
  IF EXISTS (
    SELECT 1 FROM unnest(p_candidate_ids) x
    WHERE NOT EXISTS (SELECT 1 FROM vote_candidates vc WHERE vc.id = x AND vc.vote_id = p_vote_id)
  ) THEN
    RAISE EXCEPTION 'bad_candidate';
  END IF;

  -- One vote per member (aborts before any ballot), then store unlinked choices.
  INSERT INTO secret_ballot_receipts (vote_id, mandate_id) VALUES (p_vote_id, p_mandate_id);
  FOREACH c IN ARRAY p_candidate_ids LOOP
    INSERT INTO election_ballots (vote_id, candidate_id, cast_at) VALUES (p_vote_id, c, NULL);
  END LOOP;
  UPDATE votes SET secret_cast_count = secret_cast_count + 1 WHERE id = p_vote_id;
END;
$$;
