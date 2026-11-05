-- RadaStudentów24 — Migration 034: the casting vote belongs to the chair only
-- (mandate role 'chair' in the sitting's term). 033 also allowed whoever is
-- set as chaired_by - by default the sitting's creator, e.g. an admin.
CREATE OR REPLACE FUNCTION cast_deciding_vote(p_vote_id UUID, p_choice TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_result TEXT; v_term UUID;
BEGIN
  IF p_choice NOT IN ('for', 'against') THEN RAISE EXCEPTION 'invalid_choice'; END IF;
  SELECT v.result, s.term_id INTO v_result, v_term
  FROM votes v JOIN sessions s ON s.id = v.session_id WHERE v.id = p_vote_id;
  IF v_result IS DISTINCT FROM 'tie' THEN RAISE EXCEPTION 'not_a_tie'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM mandates m
    WHERE m.term_id = v_term AND m.profile_id = auth.uid() AND m.is_active AND m.role = 'chair'
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
