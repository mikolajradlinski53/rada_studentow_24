-- RadaStudentów24 — Migration 037: open/secret is decided on the agenda item, ahead
--
-- agenda_items.vote_type: 'open' | 'secret' (NULL = chosen when the vote is
-- opened, as before). When set, a vote on that item must use it - the chair
-- can't open a named vote on an item announced as secret by a stray tap.

ALTER TABLE agenda_items ADD COLUMN IF NOT EXISTS vote_type TEXT CHECK (vote_type IN ('open', 'secret'));

CREATE OR REPLACE FUNCTION guard_vote_matches_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_planned TEXT;
BEGIN
  IF NEW.agenda_item_id IS NULL OR NEW.vote_kind = 'election' THEN RETURN NEW; END IF;
  SELECT vote_type INTO v_planned FROM agenda_items WHERE id = NEW.agenda_item_id;
  IF v_planned IS NOT NULL AND v_planned IS DISTINCT FROM NEW.vote_type THEN
    RAISE EXCEPTION 'vote_type_mismatch_with_agenda_item';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION guard_vote_matches_item() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS votes_match_item ON votes;
CREATE TRIGGER votes_match_item BEFORE INSERT ON votes
  FOR EACH ROW EXECUTE FUNCTION guard_vote_matches_item();
