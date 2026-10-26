-- RadaStudentów24 — Migration 021: chair sees secret-ballot TURNOUT (who has
-- voted, never how). Receipts hold only (vote, mandate); the choice lives in an
-- unlinked ballot row, so anonymity is unchanged.
DROP POLICY IF EXISTS "receipt_read_chair" ON secret_ballot_receipts;
CREATE POLICY "receipt_read_chair" ON secret_ballot_receipts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM votes v WHERE v.id = secret_ballot_receipts.vote_id AND user_can_manage_session(v.session_id)
  ));

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE secret_ballot_receipts;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
