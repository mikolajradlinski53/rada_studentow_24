-- RadaStudentów24 — Migration 032: only seat holders vote and count to quorum
--
-- The app already treats auditor (KR), secretary (protokolant), admin and
-- election_committee as roles WITHOUT a seat (stats, circular votes, RSVP).
-- The DB didn't: any active mandate of the term could cast a ballot, and every
-- "present" attendance row counted to quorum - so KR members or the
-- protokolant checking in inflated quorum and could vote.
-- Seat roles: member, chair.

CREATE OR REPLACE FUNCTION is_voting_role(p_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$ SELECT p_role IN ('member', 'chair'); $$;

-- Every ballot path (cast_ballot open/secret, cast_election_ballots) writes a
-- row to ballots or secret_ballot_receipts with the mandate - guard there.
CREATE OR REPLACE FUNCTION guard_voting_mandate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.mandate_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM mandates m WHERE m.id = NEW.mandate_id AND is_voting_role(m.role)
  ) THEN
    RAISE EXCEPTION 'not_a_voting_member';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION guard_voting_mandate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ballots_voting_role ON ballots;
CREATE TRIGGER ballots_voting_role BEFORE INSERT ON ballots
  FOR EACH ROW EXECUTE FUNCTION guard_voting_mandate();
DROP TRIGGER IF EXISTS receipts_voting_role ON secret_ballot_receipts;
CREATE TRIGGER receipts_voting_role BEFORE INSERT ON secret_ballot_receipts
  FOR EACH ROW EXECUTE FUNCTION guard_voting_mandate();

-- Quorum counts present seat holders only (attendance of others is still recorded).
CREATE OR REPLACE FUNCTION calculate_quorum(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_seats INT; v_quorum_type TEXT; v_quorum_value NUMERIC; v_present INT; v_required INT;
BEGIN
  SELECT o.total_seats, o.quorum_type, o.quorum_value INTO v_total_seats, v_quorum_type, v_quorum_value
  FROM sessions s JOIN organs o ON o.id = s.organ_id WHERE s.id = p_session_id;

  SELECT COUNT(*) INTO v_present
  FROM attendance a JOIN mandates m ON m.id = a.mandate_id
  WHERE a.session_id = p_session_id AND a.status IN ('present', 'late') AND is_voting_role(m.role);

  CASE v_quorum_type
    WHEN 'majority' THEN v_required := (v_total_seats / 2) + 1;
    WHEN 'two_thirds' THEN v_required := CEIL(v_total_seats * 2.0 / 3);
    WHEN 'custom' THEN v_required := COALESCE(v_quorum_value, (v_total_seats / 2) + 1);
  END CASE;

  RETURN jsonb_build_object(
    'total_seats', v_total_seats, 'present', v_present,
    'required', v_required, 'has_quorum', v_present >= v_required
  );
END;
$$;

-- tally_vote_core: "present" (absolute majority base, total_eligible) = seat holders.
CREATE OR REPLACE FUNCTION tally_vote_core(p_vote_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_for INT; v_against INT; v_abstain INT; v_total INT; v_type TEXT;
  v_threshold TEXT; v_result TEXT; v_session_id UUID; v_kind TEXT;
  v_present INT; v_quorum JSONB; v_required INT; v_has_quorum BOOLEAN;
BEGIN
  SELECT v.threshold, v.session_id, s.kind, v.vote_type INTO v_threshold, v_session_id, v_kind, v_type
  FROM votes v JOIN sessions s ON s.id = v.session_id WHERE v.id = p_vote_id;

  IF v_type = 'secret' THEN
    SELECT coalesce(t.votes_for, 0), coalesce(t.votes_against, 0), coalesce(t.votes_abstain, 0)
    INTO v_for, v_against, v_abstain
    FROM (SELECT 1) one LEFT JOIN secret_tallies t ON t.vote_id = p_vote_id;
  ELSE
    SELECT
      COUNT(*) FILTER (WHERE choice = 'for'),
      COUNT(*) FILTER (WHERE choice = 'against'),
      COUNT(*) FILTER (WHERE choice = 'abstain')
    INTO v_for, v_against, v_abstain
    FROM ballots WHERE vote_id = p_vote_id;
  END IF;
  v_total := v_for + v_against + v_abstain;

  v_quorum := calculate_quorum(v_session_id);
  v_required := (v_quorum->>'required')::INT;

  IF v_kind = 'circular' THEN
    v_present := v_total;
    v_has_quorum := v_total >= v_required;
  ELSE
    v_present := (v_quorum->>'present')::INT;
    v_has_quorum := (v_quorum->>'has_quorum')::BOOLEAN;
  END IF;

  IF NOT v_has_quorum THEN
    v_result := 'no_quorum';
  ELSE
    CASE v_threshold
      WHEN 'absolute_majority' THEN
        v_result := CASE WHEN v_for > (v_present / 2.0) THEN 'passed' ELSE 'rejected' END;
      WHEN 'two_thirds' THEN
        v_result := CASE WHEN v_for >= CEIL(v_total * 2.0 / 3) THEN 'passed' ELSE 'rejected' END;
      ELSE
        v_result := CASE WHEN v_for > v_against THEN 'passed' ELSE 'rejected' END;
    END CASE;
  END IF;

  UPDATE votes SET
    votes_for = v_for, votes_against = v_against, votes_abstain = v_abstain,
    total_eligible = v_present, result = v_result, status = 'closed', closed_at = now()
  WHERE id = p_vote_id;

  IF v_kind = 'circular' THEN
    UPDATE sessions SET status = 'closed', closed_at = now() WHERE id = v_session_id AND status = 'in_progress';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION tally_vote_core(UUID) FROM PUBLIC, anon, authenticated;
