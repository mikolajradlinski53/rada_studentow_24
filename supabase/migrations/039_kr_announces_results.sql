-- RadaStudentów24 — Migration 039: Komisja Rewizyjna announces the results
--
-- The chair only ENDS a vote (no more ballots). The result is computed into
-- vote_pending_results, readable by the KR only. A KR member checks it and
-- announces it (announce_vote_results): only then do the numbers land on the
-- vote, the named list of an open vote is revealed, and a tie can be decided.
--
-- Published immediately (as before): circular votes, procedural votes on a
-- formal motion (the break must start now), and terms without an active KR.
-- Every vote closed before this migration counts as announced.

ALTER TABLE votes ADD COLUMN IF NOT EXISTS results_announced_at TIMESTAMPTZ;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS announced_by UUID REFERENCES profiles(id);
UPDATE votes SET results_announced_at = coalesce(closed_at, now())
  WHERE status = 'closed' AND results_announced_at IS NULL;

CREATE TABLE IF NOT EXISTS vote_pending_results (
  vote_id        UUID PRIMARY KEY REFERENCES votes(id) ON DELETE CASCADE,
  votes_for      INT NOT NULL,
  votes_against  INT NOT NULL,
  votes_abstain  INT NOT NULL,
  total_eligible INT NOT NULL,
  result         TEXT NOT NULL,
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE vote_pending_results ENABLE ROW LEVEL SECURITY;

-- The KR of the sitting's term (active auditor mandate), or a platform admin.
CREATE OR REPLACE FUNCTION user_is_session_auditor(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_platform_admin() OR EXISTS (
    SELECT 1 FROM sessions s JOIN mandates m ON m.term_id = s.term_id
    WHERE s.id = p_session_id AND m.profile_id = auth.uid() AND m.is_active AND m.role = 'auditor'
  );
$$;
REVOKE ALL ON FUNCTION user_is_session_auditor(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION user_is_session_auditor(UUID) TO authenticated;

DROP POLICY IF EXISTS "pending_result_read_kr" ON vote_pending_results;
CREATE POLICY "pending_result_read_kr" ON vote_pending_results FOR SELECT
  USING (EXISTS (SELECT 1 FROM votes v WHERE v.id = vote_pending_results.vote_id AND user_is_session_auditor(v.session_id)));

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE vote_pending_results;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------
-- Tally (shared by "publish now" and "pending for KR")
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION compute_vote_tally(p_vote_id UUID,
  OUT o_for INT, OUT o_against INT, OUT o_abstain INT, OUT o_present INT, OUT o_result TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INT; v_type TEXT; v_threshold TEXT; v_session_id UUID; v_kind TEXT;
  v_quorum JSONB; v_required INT; v_has_quorum BOOLEAN;
BEGIN
  SELECT v.threshold, v.session_id, s.kind, v.vote_type INTO v_threshold, v_session_id, v_kind, v_type
  FROM votes v JOIN sessions s ON s.id = v.session_id WHERE v.id = p_vote_id;

  IF v_type = 'secret' THEN
    SELECT coalesce(t.votes_for, 0), coalesce(t.votes_against, 0), coalesce(t.votes_abstain, 0)
    INTO o_for, o_against, o_abstain
    FROM (SELECT 1) one LEFT JOIN secret_tallies t ON t.vote_id = p_vote_id;
  ELSE
    SELECT COUNT(*) FILTER (WHERE choice = 'for'), COUNT(*) FILTER (WHERE choice = 'against'), COUNT(*) FILTER (WHERE choice = 'abstain')
    INTO o_for, o_against, o_abstain
    FROM ballots WHERE vote_id = p_vote_id;
  END IF;
  v_total := o_for + o_against + o_abstain;

  v_quorum := calculate_quorum(v_session_id);
  v_required := (v_quorum->>'required')::INT;
  IF v_kind = 'circular' THEN
    o_present := v_total;
    v_has_quorum := v_total >= v_required;
  ELSE
    o_present := (v_quorum->>'present')::INT;
    v_has_quorum := (v_quorum->>'has_quorum')::BOOLEAN;
  END IF;

  IF NOT v_has_quorum THEN
    o_result := 'no_quorum';
  ELSE
    CASE v_threshold
      WHEN 'absolute_majority' THEN o_result := CASE WHEN o_for > (o_present / 2.0) THEN 'passed' ELSE 'rejected' END;
      WHEN 'two_thirds' THEN o_result := CASE WHEN o_for >= CEIL(v_total * 2.0 / 3) THEN 'passed' ELSE 'rejected' END;
      ELSE o_result := CASE WHEN o_for > o_against THEN 'passed'
                            WHEN o_for = o_against AND o_for > 0 THEN 'tie'
                            ELSE 'rejected' END;
    END CASE;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION compute_vote_tally(UUID) FROM PUBLIC, anon, authenticated;

-- Close AND publish at once (circular, procedural, no KR).
CREATE OR REPLACE FUNCTION tally_vote_core(p_vote_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE t RECORD; v_session UUID; v_kind TEXT;
BEGIN
  SELECT v.session_id, s.kind INTO v_session, v_kind FROM votes v JOIN sessions s ON s.id = v.session_id WHERE v.id = p_vote_id;
  SELECT * INTO t FROM compute_vote_tally(p_vote_id);
  UPDATE votes SET
    votes_for = t.o_for, votes_against = t.o_against, votes_abstain = t.o_abstain,
    total_eligible = t.o_present, result = t.o_result, status = 'closed',
    closed_at = coalesce(closed_at, now()), results_announced_at = now()
  WHERE id = p_vote_id;
  IF v_kind = 'circular' THEN
    UPDATE sessions SET status = 'closed', closed_at = now() WHERE id = v_session AND status = 'in_progress';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION tally_vote_core(UUID) FROM PUBLIC, anon, authenticated;

-- The chair ends a vote (motion, opinion or election).
CREATE OR REPLACE FUNCTION tally_vote(p_vote_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v RECORD; v_kr BOOLEAN; t RECORD;
BEGIN
  SELECT x.session_id, x.status, x.vote_kind, x.floor_request_id, s.kind AS session_kind, s.term_id
    INTO v FROM votes x JOIN sessions s ON s.id = x.session_id WHERE x.id = p_vote_id;
  IF v.session_id IS NULL THEN RAISE EXCEPTION 'vote_not_found'; END IF;
  IF NOT user_can_manage_session(v.session_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v.status IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'vote_not_open'; END IF;

  v_kr := EXISTS (SELECT 1 FROM mandates m WHERE m.term_id = v.term_id AND m.is_active AND m.role = 'auditor');

  IF v.session_kind = 'circular' OR v.floor_request_id IS NOT NULL OR NOT v_kr THEN
    IF v.vote_kind = 'election' THEN
      UPDATE votes SET status = 'closed', closed_at = now(), results_announced_at = now() WHERE id = p_vote_id;
    ELSE
      PERFORM tally_vote_core(p_vote_id);
    END IF;
    RETURN;
  END IF;

  -- Sitting with a KR: end the vote, keep the result for the KR to announce.
  IF v.vote_kind <> 'election' THEN
    SELECT * INTO t FROM compute_vote_tally(p_vote_id);
    INSERT INTO vote_pending_results (vote_id, votes_for, votes_against, votes_abstain, total_eligible, result)
    VALUES (p_vote_id, t.o_for, t.o_against, t.o_abstain, t.o_present, t.o_result)
    ON CONFLICT (vote_id) DO UPDATE SET votes_for = EXCLUDED.votes_for, votes_against = EXCLUDED.votes_against,
      votes_abstain = EXCLUDED.votes_abstain, total_eligible = EXCLUDED.total_eligible, result = EXCLUDED.result, computed_at = now();
  END IF;
  UPDATE votes SET status = 'closed', closed_at = now() WHERE id = p_vote_id;
END;
$$;
REVOKE ALL ON FUNCTION tally_vote(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION tally_vote(UUID) TO authenticated;

-- A KR member announces the result.
CREATE OR REPLACE FUNCTION announce_vote_results(p_vote_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v RECORD; p RECORD;
BEGIN
  SELECT session_id, status, vote_kind, results_announced_at INTO v FROM votes WHERE id = p_vote_id;
  IF v.session_id IS NULL THEN RAISE EXCEPTION 'vote_not_found'; END IF;
  IF NOT user_is_session_auditor(v.session_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v.status IS DISTINCT FROM 'closed' THEN RAISE EXCEPTION 'vote_not_closed'; END IF;
  IF v.results_announced_at IS NOT NULL THEN RAISE EXCEPTION 'already_announced'; END IF;

  IF v.vote_kind <> 'election' THEN
    SELECT * INTO p FROM vote_pending_results WHERE vote_id = p_vote_id;
    IF p.vote_id IS NULL THEN RAISE EXCEPTION 'no_pending_result'; END IF;
    UPDATE votes SET votes_for = p.votes_for, votes_against = p.votes_against, votes_abstain = p.votes_abstain,
      total_eligible = p.total_eligible, result = p.result
    WHERE id = p_vote_id;
    DELETE FROM vote_pending_results WHERE vote_id = p_vote_id;
  END IF;
  UPDATE votes SET results_announced_at = now(), announced_by = auth.uid() WHERE id = p_vote_id;
END;
$$;
REVOKE ALL ON FUNCTION announce_vote_results(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION announce_vote_results(UUID) TO authenticated;

-- Reveal only after the announcement.
DROP POLICY IF EXISTS "ballot_read_open" ON ballots;
CREATE POLICY "ballot_read_open" ON ballots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM votes v
      JOIN sessions s ON s.id = v.session_id
      JOIN organs o ON o.id = s.organ_id
      WHERE v.id = ballots.vote_id
        AND v.vote_type = 'open'
        AND user_has_org_access(o.org_id)
        AND (
          v.results_announced_at IS NOT NULL
          OR EXISTS (SELECT 1 FROM mandates m WHERE m.id = ballots.mandate_id AND m.profile_id = auth.uid())
        )
    )
  );

CREATE OR REPLACE FUNCTION election_results(p_vote_id UUID)
RETURNS TABLE (candidate_id UUID, votes INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT vc.id, coalesce(ct.votes, 0)
  FROM vote_candidates vc
  JOIN votes v ON v.id = vc.vote_id
  JOIN sessions s ON s.id = v.session_id
  JOIN organs o ON o.id = s.organ_id
  LEFT JOIN candidate_tallies ct ON ct.candidate_id = vc.id
  WHERE vc.vote_id = p_vote_id AND v.status = 'closed'
    AND (v.results_announced_at IS NOT NULL OR user_is_session_auditor(s.id))
    AND user_has_org_access(o.org_id);
$$;
REVOKE ALL ON FUNCTION election_results(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION election_results(UUID) TO authenticated;

-- Results, turnout and the announcement are read-only for API callers.
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
       OR coalesce(NEW.secret_cast_count, 0) <> 0 OR NEW.result IS NOT NULL
       OR NEW.results_announced_at IS NOT NULL OR NEW.announced_by IS NOT NULL THEN
      RAISE EXCEPTION 'vote_must_start_open_and_empty';
    END IF;
    RETURN NEW;
  END IF;
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
     OR NEW.session_id IS DISTINCT FROM OLD.session_id
     OR NEW.results_announced_at IS DISTINCT FROM OLD.results_announced_at
     OR NEW.announced_by IS DISTINCT FROM OLD.announced_by THEN
    RAISE EXCEPTION 'vote_results_read_only';
  END IF;
  -- Ending a vote goes through tally_vote() (it may hold the result for the KR).
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'use_tally_vote_to_close';
  END IF;
  RETURN NEW;
END;
$$;
