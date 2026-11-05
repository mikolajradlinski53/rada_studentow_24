-- RadaStudentów24 — Migration 033: casting vote of the chair, opinion items,
-- only councillors vote and count to quorum
--
-- Rules (RUSS UEW):
--   * Seats = councillors (role member). Only they vote, check in and count to
--     quorum. The chair (przewodniczący), protokolant, KR and admin don't.
--   * The chair has no ordinary vote, but decides a TIE (głos rozstrzygający):
--     a simple-majority vote with for = against > 0 closes as 'tie' and waits
--     for cast_deciding_vote().
--   * New agenda item type 'opinion' (opiniowanie): voted like a motion,
--     reported as "opinia pozytywna / negatywna".

CREATE OR REPLACE FUNCTION is_voting_role(p_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$ SELECT p_role = 'member'; $$;

ALTER TABLE agenda_items DROP CONSTRAINT IF EXISTS agenda_items_item_type_check;
ALTER TABLE agenda_items ADD CONSTRAINT agenda_items_item_type_check
  CHECK (item_type IN ('procedural', 'discussion', 'resolution', 'election', 'information', 'opinion'));

ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_vote_kind_check;
ALTER TABLE votes ADD CONSTRAINT votes_vote_kind_check CHECK (vote_kind IN ('motion', 'election', 'opinion'));

ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_result_check;
ALTER TABLE votes ADD CONSTRAINT votes_result_check CHECK (result IN ('passed', 'rejected', 'no_quorum', 'tie'));

ALTER TABLE votes ADD COLUMN IF NOT EXISTS deciding_vote TEXT CHECK (deciding_vote IN ('for', 'against'));
ALTER TABLE votes ADD COLUMN IF NOT EXISTS deciding_by UUID REFERENCES profiles(id);

-- Self check-in: councillors only (the others' presence isn't recorded).
DROP POLICY IF EXISTS "attendance_upsert" ON attendance;
CREATE POLICY "attendance_upsert" ON attendance FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM mandates m JOIN sessions s ON s.term_id = m.term_id
      WHERE m.id = attendance.mandate_id AND m.profile_id = auth.uid() AND m.is_active
        AND is_voting_role(m.role) AND s.id = attendance.session_id AND s.attendance_mode = 'self'
    )
    OR user_can_manage_session(attendance.session_id)
  );

-- Tally: a simple-majority tie waits for the chair.
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
    v_present := (v_quorum->>'present')::INT;
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
        v_result := CASE WHEN v_for > v_against THEN 'passed'
                         WHEN v_for = v_against AND v_for > 0 THEN 'tie'
                         ELSE 'rejected' END;
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

-- The chair's casting vote on a tie. Chair = mandate role 'chair' in the
-- sitting's term, or the person chairing this sitting (chaired_by).
CREATE OR REPLACE FUNCTION cast_deciding_vote(p_vote_id UUID, p_choice TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_result TEXT; v_session UUID;
BEGIN
  IF p_choice NOT IN ('for', 'against') THEN RAISE EXCEPTION 'invalid_choice'; END IF;
  SELECT v.result, v.session_id INTO v_result, v_session FROM votes v WHERE v.id = p_vote_id;
  IF v_result IS DISTINCT FROM 'tie' THEN RAISE EXCEPTION 'not_a_tie'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM sessions s
    WHERE s.id = v_session AND (
      s.chaired_by = auth.uid()
      OR EXISTS (SELECT 1 FROM mandates m WHERE m.term_id = s.term_id AND m.profile_id = auth.uid()
                 AND m.is_active AND m.role = 'chair')
    )
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE votes SET
    result = CASE WHEN p_choice = 'for' THEN 'passed' ELSE 'rejected' END,
    deciding_vote = p_choice, deciding_by = auth.uid()
  WHERE id = p_vote_id;
END;
$$;
REVOKE ALL ON FUNCTION cast_deciding_vote(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cast_deciding_vote(UUID, TEXT) TO authenticated;
