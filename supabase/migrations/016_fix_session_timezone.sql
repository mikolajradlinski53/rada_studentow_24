-- RadaStudentów24 — Migration 016: session times were stored as UTC wall-clock
-- The "new session" form sent scheduled_at without an offset ("…T17:00:00"), so
-- Postgres stored 17:00 UTC for a sitting meant at 17:00 Polish time. The form
-- now sends a real instant; this shifts the rows created before that fix.
-- Runs once (tracked in the migration history) — do not re-run by hand.

UPDATE sessions
SET scheduled_at = (scheduled_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Warsaw'
WHERE created_at < '2026-10-26 00:00:00+00';
