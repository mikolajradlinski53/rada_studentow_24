-- RadaStudentów24 — Migration 015: invitations work for existing accounts too
-- Until now invitations were materialized only by the auth.users INSERT trigger,
-- i.e. on someone's very first sign-in. A person who already had an account
-- (previous term, another org, or a deactivated mandate) could never be
-- (re-)invited. This RPC is called after every sign-in: it turns the caller's
-- pending invitations into active mandates, reactivating revoked ones.

CREATE OR REPLACE FUNCTION accept_my_invitations()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_count INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;

  SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = auth.uid();
  IF v_email IS NULL THEN
    RETURN 0;
  END IF;

  -- Profile may be missing for accounts created before migration 002.
  INSERT INTO profiles (id, full_name, email)
  SELECT auth.uid(),
         COALESCE(NULLIF(i.full_name, ''), split_part(v_email, '@', 1)),
         v_email
  FROM invitations i
  WHERE lower(i.email) = v_email AND i.accepted_at IS NULL
  ORDER BY i.created_at DESC
  LIMIT 1
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO mandates (term_id, profile_id, role, label, is_active, granted_at, revoked_at)
  SELECT i.term_id, auth.uid(), i.role, i.label, true, now(), NULL
  FROM invitations i
  WHERE lower(i.email) = v_email AND i.accepted_at IS NULL
  ON CONFLICT (term_id, profile_id) DO UPDATE
    SET role = EXCLUDED.role,
        label = COALESCE(EXCLUDED.label, mandates.label),
        is_active = true,
        granted_at = now(),
        revoked_at = NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE invitations SET accepted_at = now()
  WHERE lower(email) = v_email AND accepted_at IS NULL;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION accept_my_invitations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION accept_my_invitations() TO authenticated;
