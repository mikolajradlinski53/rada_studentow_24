-- RadaStudentów24 — Migration 003: live tally support
-- Adds a server-maintained turnout counter for SECRET votes so the chair and the
-- projector can show how many people have voted in real time WITHOUT exposing the
-- (anonymous) breakdown. Open votes derive their live tally from readable ballots.

ALTER TABLE votes
  ADD COLUMN IF NOT EXISTS secret_cast_count INT NOT NULL DEFAULT 0;

-- Replace cast_ballot to bump secret_cast_count on each secret ballot.
-- votes is in supabase_realtime, so this UPDATE streams live to clients (who may
-- read the votes row) while the ballots themselves stay unreadable.
CREATE OR REPLACE FUNCTION cast_ballot(p_vote_id UUID, p_mandate_id UUID, p_choice TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type   TEXT;
  v_status TEXT;
BEGIN
  IF p_choice NOT IN ('for', 'against', 'abstain') THEN
    RAISE EXCEPTION 'invalid_choice';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM mandates m
    WHERE m.id = p_mandate_id
      AND m.profile_id = auth.uid()
      AND m.is_active = true
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT vote_type, status INTO v_type, v_status
  FROM votes WHERE id = p_vote_id;

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'vote_not_found';
  END IF;
  IF v_status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'vote_not_open';
  END IF;

  IF v_type = 'open' THEN
    INSERT INTO ballots (vote_id, mandate_id, choice)
    VALUES (p_vote_id, p_mandate_id, p_choice);
  ELSE
    -- Secret: receipt first (aborts a double vote), then unlinked ballot with no
    -- cast_at, then bump the live turnout counter on the vote row.
    INSERT INTO secret_ballot_receipts (vote_id, mandate_id)
    VALUES (p_vote_id, p_mandate_id);

    INSERT INTO ballots (vote_id, mandate_id, choice, cast_at)
    VALUES (p_vote_id, NULL, p_choice, NULL);

    UPDATE votes SET secret_cast_count = secret_cast_count + 1
    WHERE id = p_vote_id;
  END IF;
END;
$$;
