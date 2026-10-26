-- RadaStudentów24 — Migration 019: database hardening (Supabase advisors)
--   * tally_vote: had NO authorization check - any signed-in user (or anon
--     knowing a vote id) could close any open vote. Now chair/admin only, once.
--   * next_resolution_number: anyone could burn resolution numbers. Now only
--     the term's chair/admin (or the sitting's chair / platform admin).
--   * Action RPCs are no longer callable without login (anon). Helper functions
--     used inside RLS policies stay executable: policies run for anon too
--     (public registry) and they return false for guests anyway.
--   * Fixed search_path on the remaining SECURITY DEFINER / helper functions.

CREATE OR REPLACE FUNCTION public.tally_vote(p_vote_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_for INT;
  v_against INT;
  v_abstain INT;
  v_total INT;
  v_threshold TEXT;
  v_result TEXT;
  v_session_id UUID;
  v_present INT;
  v_quorum JSONB;
  v_has_quorum BOOLEAN;
  v_status TEXT;
BEGIN
  SELECT v.threshold, v.session_id, v.status INTO v_threshold, v_session_id, v_status
  FROM votes v WHERE v.id = p_vote_id;

  -- Only the session's chair/admin may close a vote, and only once.
  IF v_session_id IS NULL THEN RAISE EXCEPTION 'vote_not_found'; END IF;
  IF NOT user_can_manage_session(v_session_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_status IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'vote_not_open'; END IF;

  -- Count from ballots (open) or secret_ballot_receipts (secret)
  SELECT
    COUNT(*) FILTER (WHERE choice = 'for'),
    COUNT(*) FILTER (WHERE choice = 'against'),
    COUNT(*) FILTER (WHERE choice = 'abstain')
  INTO v_for, v_against, v_abstain
  FROM ballots WHERE vote_id = p_vote_id;

  v_total := v_for + v_against + v_abstain;

  -- Count present members for quorum check
  SELECT COUNT(*) INTO v_present
  FROM attendance
  WHERE session_id = v_session_id
    AND status IN ('present', 'late');

  -- Quorum gate: a vote without quorum has no valid outcome
  v_quorum := calculate_quorum(v_session_id);
  v_has_quorum := (v_quorum->>'has_quorum')::BOOLEAN;

  IF NOT v_has_quorum THEN
    v_result := 'no_quorum';
  ELSE
    -- Determine result
    CASE v_threshold
      WHEN 'simple_majority' THEN
        IF v_for > v_against THEN v_result := 'passed';
        ELSE v_result := 'rejected';
        END IF;
      WHEN 'absolute_majority' THEN
        IF v_for > (v_present / 2.0) THEN v_result := 'passed';
        ELSE v_result := 'rejected';
        END IF;
      WHEN 'two_thirds' THEN
        IF v_for >= CEIL(v_total * 2.0 / 3) THEN v_result := 'passed';
        ELSE v_result := 'rejected';
        END IF;
    END CASE;
  END IF;

  UPDATE votes SET
    votes_for = v_for,
    votes_against = v_against,
    votes_abstain = v_abstain,
    total_eligible = v_present,
    result = v_result,
    status = 'closed',
    closed_at = now()
  WHERE id = p_vote_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_resolution_number(p_term_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_next INT;
BEGIN
  IF NOT (
    is_platform_admin()
    OR EXISTS (SELECT 1 FROM mandates m WHERE m.term_id = p_term_id AND m.profile_id = auth.uid()
               AND m.is_active AND m.role IN ('admin', 'chair'))
    OR EXISTS (SELECT 1 FROM sessions s WHERE s.term_id = p_term_id AND s.chaired_by = auth.uid())
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE terms
  SET resolution_counter = resolution_counter + 1
  WHERE id = p_term_id
  RETURNING resolution_counter INTO v_next;
  RETURN v_next;
END;
$function$;

ALTER FUNCTION public.calculate_quorum(uuid) SET search_path = public;
ALTER FUNCTION public.get_user_role(uuid) SET search_path = public;
ALTER FUNCTION public.storage_path_uuid(text, int) SET search_path = public;

-- Action RPCs: signed-in users only.
REVOKE EXECUTE ON FUNCTION public.tally_vote(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_resolution_number(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cast_ballot(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cast_election_ballot(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cast_election_ballots(uuid, uuid, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.calculate_quorum(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tally_vote(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_resolution_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cast_ballot(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cast_election_ballot(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cast_election_ballots(uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_quorum(uuid) TO authenticated;
