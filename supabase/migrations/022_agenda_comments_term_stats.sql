-- RadaStudentów24 — Migration 022
--   1. Questions / remarks on agenda items (before and during a sitting)
--   2. Term statistics: attendance and vote participation per member

-- ============================================================
-- 1. AGENDA COMMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS agenda_comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_item_id  UUID NOT NULL REFERENCES agenda_items(id) ON DELETE CASCADE,
  mandate_id      UUID NOT NULL REFERENCES mandates(id) ON DELETE CASCADE,
  body            TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 1000),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agenda_comments_item_idx ON agenda_comments(agenda_item_id, created_at);

ALTER TABLE agenda_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agenda_comment_read" ON agenda_comments;
CREATE POLICY "agenda_comment_read" ON agenda_comments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM agenda_items ai JOIN sessions s ON s.id = ai.session_id JOIN organs o ON o.id = s.organ_id
    WHERE ai.id = agenda_comments.agenda_item_id AND user_has_org_access(o.org_id)
  ));

-- Write as yourself, with an active mandate in the sitting's term.
DROP POLICY IF EXISTS "agenda_comment_insert" ON agenda_comments;
CREATE POLICY "agenda_comment_insert" ON agenda_comments FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM mandates m
    JOIN agenda_items ai ON ai.id = agenda_comments.agenda_item_id
    JOIN sessions s ON s.id = ai.session_id
    WHERE m.id = agenda_comments.mandate_id AND m.profile_id = auth.uid() AND m.is_active AND m.term_id = s.term_id
  ));

-- Delete: the author, or the sitting's chair/admin (moderation).
DROP POLICY IF EXISTS "agenda_comment_delete" ON agenda_comments;
CREATE POLICY "agenda_comment_delete" ON agenda_comments FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM mandates m WHERE m.id = agenda_comments.mandate_id AND m.profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM agenda_items ai WHERE ai.id = agenda_comments.agenda_item_id AND user_can_manage_session(ai.session_id))
  );

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE agenda_comments;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 2. TERM STATISTICS
-- ============================================================
-- Counts only (never vote choices). Secret ballots/elections are counted via
-- receipts, so per-member participation is visible to org members the same way
-- attendance already is. SECURITY DEFINER: RLS hides other members' receipts.
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
    SELECT s.id FROM sessions s
    WHERE s.term_id = p_term_id AND s.opened_at IS NOT NULL
      AND s.status IN ('in_progress', 'closed', 'protocol_pending', 'archived')
  ),
  closed_votes AS (
    SELECT v.id FROM votes v WHERE v.session_id IN (SELECT id FROM held) AND v.status = 'closed'
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

REVOKE ALL ON FUNCTION term_member_stats(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION term_member_stats(UUID) TO authenticated;
