-- RadaStudentów24 — Migration 026: frekwencja - circular votes count toward vote
-- participation but not as sittings (they have no attendance list).

CREATE OR REPLACE FUNCTION term_member_stats(p_term_id UUID)
RETURNS TABLE (
  mandate_id UUID, full_name TEXT, role TEXT,
  sittings_total INT, sittings_present INT,
  votes_total INT, votes_cast INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID;
BEGIN
  SELECT o.org_id INTO v_org FROM terms t JOIN organs o ON o.id = t.organ_id WHERE t.id = p_term_id;
  IF v_org IS NULL OR NOT user_has_org_access(v_org) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH held AS (
    -- Sittings only: a circular vote has no roll call, so it isn't "attendance".
    SELECT s.id FROM sessions s
    WHERE s.term_id = p_term_id AND s.kind = 'sitting' AND s.opened_at IS NOT NULL
      AND s.status IN ('in_progress', 'closed', 'protocol_pending', 'archived')
  ),
  closed_votes AS (
    -- ...but its vote does count toward vote participation.
    SELECT v.id FROM votes v JOIN sessions s ON s.id = v.session_id
    WHERE s.term_id = p_term_id AND v.status = 'closed'
      AND (s.id IN (SELECT id FROM held) OR s.kind = 'circular')
  )
  SELECT
    m.id,
    p.full_name,
    m.role,
    (SELECT count(*)::int FROM held),
    (SELECT count(*)::int FROM attendance a
      WHERE a.mandate_id = m.id AND a.session_id IN (SELECT id FROM held)
        AND a.status IN ('present', 'late', 'left_early')),
    (SELECT count(*)::int FROM closed_votes),
    (SELECT count(*)::int FROM ballots b WHERE b.mandate_id = m.id AND b.vote_id IN (SELECT id FROM closed_votes))
      + (SELECT count(*)::int FROM secret_ballot_receipts r WHERE r.mandate_id = m.id AND r.vote_id IN (SELECT id FROM closed_votes))
  FROM mandates m
  JOIN profiles p ON p.id = m.profile_id
  WHERE m.term_id = p_term_id AND m.is_active;
END;
$$;
