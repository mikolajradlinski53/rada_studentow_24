-- RadaStudentów24 — Migration 020
--   1. RSVP / usprawiedliwienie before a sitting (predicted quorum)
--   2. Speaking-time limit + per-speaker extension

-- ============================================================
-- 1. RSVP
-- ============================================================
CREATE TABLE IF NOT EXISTS session_rsvps (
  session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  mandate_id  UUID NOT NULL REFERENCES mandates(id) ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('yes', 'no')),
  note        TEXT CHECK (char_length(note) <= 300),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, mandate_id)
);

ALTER TABLE session_rsvps ENABLE ROW LEVEL SECURITY;

-- Everyone in the org sees who's coming (the chair plans quorum; members see the room).
DROP POLICY IF EXISTS "rsvp_read" ON session_rsvps;
CREATE POLICY "rsvp_read" ON session_rsvps FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM sessions s JOIN organs o ON o.id = s.organ_id
    WHERE s.id = session_rsvps.session_id AND user_has_org_access(o.org_id)
  ));

-- A member answers only for their own active mandate in that sitting's term.
DROP POLICY IF EXISTS "rsvp_write_own" ON session_rsvps;
CREATE POLICY "rsvp_write_own" ON session_rsvps FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM mandates m JOIN sessions s ON s.term_id = m.term_id
    WHERE m.id = session_rsvps.mandate_id AND m.profile_id = auth.uid() AND m.is_active
      AND s.id = session_rsvps.session_id
  ));
DROP POLICY IF EXISTS "rsvp_update_own" ON session_rsvps;
CREATE POLICY "rsvp_update_own" ON session_rsvps FOR UPDATE
  USING (EXISTS (SELECT 1 FROM mandates m WHERE m.id = session_rsvps.mandate_id AND m.profile_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM mandates m WHERE m.id = session_rsvps.mandate_id AND m.profile_id = auth.uid()));
DROP POLICY IF EXISTS "rsvp_delete_own" ON session_rsvps;
CREATE POLICY "rsvp_delete_own" ON session_rsvps FOR DELETE
  USING (EXISTS (SELECT 1 FROM mandates m WHERE m.id = session_rsvps.mandate_id AND m.profile_id = auth.uid()));

-- ============================================================
-- 2. SPEAKING TIME
-- ============================================================
-- Limit per turn (NULL = no limit), set by the chair; extra time per request
-- (chair's "+1 min" or an accepted "przedłużenie czasu" motion).
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS speech_limit_seconds INT
  CHECK (speech_limit_seconds IS NULL OR speech_limit_seconds BETWEEN 30 AND 3600);
ALTER TABLE floor_requests ADD COLUMN IF NOT EXISTS extra_seconds INT NOT NULL DEFAULT 0
  CHECK (extra_seconds BETWEEN 0 AND 3600);

-- Realtime for RSVP changes (session page updates live).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE session_rsvps;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
