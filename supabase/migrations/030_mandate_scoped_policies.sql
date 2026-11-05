-- RadaStudentów24 — Migration 030: policies that check mandates inline must
-- match the helpers (active mandate, same term as the sitting)
--
-- The helper functions (user_in_term, user_can_manage_session, ...) all require
-- an ACTIVE mandate in the RIGHT term. A few policies re-implemented the check
-- inline with only "mandate belongs to me", so:
--   * a deactivated councillor (or a mandate from another term) could still
--     self check-in -> counted as present -> inflated quorum;
--   * a floor request could be filed with a mandate from another term;
--   * a deactivated auditor kept reading secret-ballot receipts.

DROP POLICY IF EXISTS "attendance_upsert" ON attendance;
CREATE POLICY "attendance_upsert" ON attendance FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM mandates m JOIN sessions s ON s.term_id = m.term_id
      WHERE m.id = attendance.mandate_id AND m.profile_id = auth.uid() AND m.is_active
        AND s.id = attendance.session_id AND s.attendance_mode = 'self'
    )
    OR user_can_manage_session(attendance.session_id)
  );

DROP POLICY IF EXISTS "attendance_update" ON attendance;
CREATE POLICY "attendance_update" ON attendance FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM mandates m JOIN sessions s ON s.term_id = m.term_id
      WHERE m.id = attendance.mandate_id AND m.profile_id = auth.uid() AND m.is_active
        AND s.id = attendance.session_id AND s.attendance_mode = 'self'
    )
    OR user_can_manage_session(attendance.session_id)
  );

-- Chair-managed roll call may only list mandates of the sitting's own term.
CREATE OR REPLACE FUNCTION guard_attendance_term()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM mandates m JOIN sessions s ON s.term_id = m.term_id
    WHERE m.id = NEW.mandate_id AND s.id = NEW.session_id
  ) THEN
    RAISE EXCEPTION 'mandate_not_in_session_term';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION guard_attendance_term() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS attendance_term_guard ON attendance;
CREATE TRIGGER attendance_term_guard
  BEFORE INSERT OR UPDATE OF mandate_id, session_id ON attendance
  FOR EACH ROW EXECUTE FUNCTION guard_attendance_term();

DROP POLICY IF EXISTS "floor_insert" ON floor_requests;
CREATE POLICY "floor_insert" ON floor_requests FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM mandates m JOIN sessions s ON s.term_id = m.term_id
      WHERE m.id = floor_requests.mandate_id AND m.profile_id = auth.uid() AND m.is_active
        AND s.id = floor_requests.session_id
    )
  );

DROP POLICY IF EXISTS "floor_update" ON floor_requests;
CREATE POLICY "floor_update" ON floor_requests FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM mandates m WHERE m.id = floor_requests.mandate_id AND m.profile_id = auth.uid() AND m.is_active)
    OR user_can_manage_session(session_id)
  );

DROP POLICY IF EXISTS "receipt_read" ON secret_ballot_receipts;
CREATE POLICY "receipt_read" ON secret_ballot_receipts FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM mandates m WHERE m.id = secret_ballot_receipts.mandate_id AND m.profile_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM votes v
      JOIN sessions s ON s.id = v.session_id
      JOIN mandates m ON m.term_id = s.term_id
      WHERE v.id = secret_ballot_receipts.vote_id
        AND m.profile_id = auth.uid() AND m.role = 'auditor' AND m.is_active
    )
  );
