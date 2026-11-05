-- RadaStudentów24 — Migration 028: open (named) votes reveal choices only at close
--
-- Before: every member could read every open-vote ballot (choice + mandate)
-- live, so the running tally and "who voted how" were visible while voting -
-- later voters could follow the room.
-- After: while the vote is open a member reads only their OWN ballot; the
-- room sees turnout (votes.secret_cast_count, now bumped for every ballot) and
-- WHO has voted (open_vote_voters()). Choices and names appear once closed.

DROP POLICY IF EXISTS "ballot_read_open" ON ballots;
CREATE POLICY "ballot_read_open" ON ballots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM votes v
      JOIN sessions s ON s.id = v.session_id
      JOIN organs o ON o.id = s.organ_id
      WHERE v.id = ballots.vote_id
        AND v.vote_type = 'open'
        AND user_has_org_access(o.org_id)
        AND (
          v.status = 'closed'
          OR EXISTS (SELECT 1 FROM mandates m WHERE m.id = ballots.mandate_id AND m.profile_id = auth.uid())
        )
    )
  );

-- secret_cast_count is the turnout counter for every vote type from now on
-- (it fires the votes realtime event the room listens to). Backfill open votes.
UPDATE votes v SET secret_cast_count = (SELECT count(*) FROM ballots b WHERE b.vote_id = v.id)
WHERE v.vote_type = 'open';

-- Who has voted in an OPEN vote (participation only - a named vote's turnout
-- is public). Secret votes keep using receipts, readable by the chair only.
CREATE OR REPLACE FUNCTION open_vote_voters(p_vote_id UUID)
RETURNS TABLE (mandate_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.mandate_id
  FROM ballots b
  JOIN votes v ON v.id = b.vote_id
  JOIN sessions s ON s.id = v.session_id
  JOIN organs o ON o.id = s.organ_id
  WHERE b.vote_id = p_vote_id AND v.vote_type = 'open' AND b.mandate_id IS NOT NULL
    AND user_has_org_access(o.org_id);
$$;
REVOKE ALL ON FUNCTION open_vote_voters(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION open_vote_voters(UUID) TO authenticated;

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
    -- Named vote: stored with the person, revealed to the room at close.
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
  END IF;
  -- Turnout for every vote type (and the realtime nudge for everyone watching).
  UPDATE votes SET secret_cast_count = secret_cast_count + 1 WHERE id = p_vote_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION cast_ballot(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cast_ballot(UUID, UUID, TEXT) TO authenticated;
