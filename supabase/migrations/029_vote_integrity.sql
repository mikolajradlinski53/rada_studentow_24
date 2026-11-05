-- RadaStudentów24 — Migration 029: vote results can't be edited by hand
--
-- The vote_write / vote_update policies let whoever manages a sitting INSERT
-- and UPDATE votes directly (needed to open a vote, close an election, set a
-- circular deadline). They also allowed writing votes_for / result / turnout,
-- reopening a closed vote, or inserting an already-"passed" vote - i.e.
-- falsifying a result outside tally_vote().
--
-- Guard: for API callers (current_user = authenticated / anon) results and
-- turnout are read-only, a new vote must start open and empty, and a closed
-- vote is frozen. SECURITY DEFINER functions (cast_*, tally_vote*, run as the
-- owner) are unaffected.

CREATE OR REPLACE FUNCTION guard_vote_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'open'
       OR coalesce(NEW.votes_for, 0) <> 0 OR coalesce(NEW.votes_against, 0) <> 0 OR coalesce(NEW.votes_abstain, 0) <> 0
       OR coalesce(NEW.secret_cast_count, 0) <> 0 OR NEW.result IS NOT NULL THEN
      RAISE EXCEPTION 'vote_must_start_open_and_empty';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.status = 'closed' THEN
    RAISE EXCEPTION 'vote_closed_is_final';
  END IF;
  IF NEW.votes_for IS DISTINCT FROM OLD.votes_for
     OR NEW.votes_against IS DISTINCT FROM OLD.votes_against
     OR NEW.votes_abstain IS DISTINCT FROM OLD.votes_abstain
     OR NEW.secret_cast_count IS DISTINCT FROM OLD.secret_cast_count
     OR NEW.total_eligible IS DISTINCT FROM OLD.total_eligible
     OR NEW.result IS DISTINCT FROM OLD.result
     OR NEW.vote_type IS DISTINCT FROM OLD.vote_type
     OR NEW.vote_kind IS DISTINCT FROM OLD.vote_kind
     OR NEW.seats IS DISTINCT FROM OLD.seats
     OR NEW.session_id IS DISTINCT FROM OLD.session_id THEN
    RAISE EXCEPTION 'vote_results_read_only';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS votes_integrity ON votes;
CREATE TRIGGER votes_integrity
  BEFORE INSERT OR UPDATE ON votes
  FOR EACH ROW EXECUTE FUNCTION guard_vote_integrity();

-- Defence in depth: the anonymous role never writes app tables (RLS already
-- denies it; this removes the default grants too). Public reads stay.
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon', t);
  END LOOP;
END $$;
