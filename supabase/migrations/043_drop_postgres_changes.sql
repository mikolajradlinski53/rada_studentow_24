-- RadaStudentów24 — Migration 043: stop postgres_changes for app tables
--
-- The app now uses private Broadcast topics (migration 041). Removing the app
-- tables from the supabase_realtime publication stops realtime.list_changes
-- from decoding and RLS-checking every change for every subscriber - the
-- ~40% of DB time that choked the database at a sitting.

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
  LOOP
    EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
  END LOOP;
END $$;
