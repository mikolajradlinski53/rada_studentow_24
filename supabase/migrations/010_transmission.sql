-- RadaStudentów24 — Migration 010: session transmission (YouTube)
-- Setting a stream URL opts the session into a public transmission page.

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS stream_url TEXT;

-- Public read of sessions that have opted in by publishing a stream URL.
-- (Members keep full access via existing session_read.)
DROP POLICY IF EXISTS "session_public_stream_read" ON sessions;
CREATE POLICY "session_public_stream_read" ON sessions FOR SELECT
  USING (stream_url IS NOT NULL);
