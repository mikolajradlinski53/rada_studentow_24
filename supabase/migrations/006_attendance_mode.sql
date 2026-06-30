-- RadaStudentów24 — Migration 006: attendance mode (roll call vs self check-in)
-- 'chair': only the chair marks who is present (roll call) — correct for in-person
--          sittings, so a remote member can't silently mark themselves present.
-- 'self':  members confirm their own presence (remote/hybrid convenience).

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS attendance_mode TEXT NOT NULL DEFAULT 'self'
    CHECK (attendance_mode IN ('self', 'chair'));

-- Enforce the mode in RLS: a member may self-mark presence ONLY in 'self' mode.
-- The chair (session manager) may always set anyone's attendance.
DROP POLICY IF EXISTS "attendance_upsert" ON attendance;
CREATE POLICY "attendance_upsert" ON attendance FOR INSERT
  WITH CHECK (
    (
      EXISTS (SELECT 1 FROM mandates m WHERE m.id = mandate_id AND m.profile_id = auth.uid())
      AND EXISTS (SELECT 1 FROM sessions s WHERE s.id = session_id AND s.attendance_mode = 'self')
    )
    OR EXISTS (SELECT 1 FROM sessions s WHERE s.id = session_id AND user_can_manage_session(s.id))
  );

DROP POLICY IF EXISTS "attendance_update" ON attendance;
CREATE POLICY "attendance_update" ON attendance FOR UPDATE
  USING (
    (
      EXISTS (SELECT 1 FROM mandates m WHERE m.id = mandate_id AND m.profile_id = auth.uid())
      AND EXISTS (SELECT 1 FROM sessions s WHERE s.id = session_id AND s.attendance_mode = 'self')
    )
    OR EXISTS (SELECT 1 FROM sessions s WHERE s.id = session_id AND user_can_manage_session(s.id))
  );
