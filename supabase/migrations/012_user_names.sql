-- RadaStudentów24 — Migration 012: real names instead of email prefix
-- Magic-link sign-ups have no name, so profiles previously defaulted to the
-- email local-part. Now the admin can supply a name on the invitation, and the
-- onboarding trigger prefers it. Users can also fix their own name (profile page).

ALTER TABLE invitations ADD COLUMN IF NOT EXISTS full_name TEXT;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invited_name TEXT;
BEGIN
  SELECT i.full_name INTO v_invited_name
  FROM invitations i
  WHERE lower(i.email) = lower(NEW.email)
    AND i.full_name IS NOT NULL AND i.full_name <> ''
  ORDER BY i.created_at DESC
  LIMIT 1;

  INSERT INTO profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', v_invited_name, split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;

  -- Materialize mandates from pending invitations for this email.
  INSERT INTO mandates (term_id, profile_id, role, label)
  SELECT i.term_id, NEW.id, i.role, i.label
  FROM invitations i
  WHERE lower(i.email) = lower(NEW.email)
    AND i.accepted_at IS NULL
  ON CONFLICT (term_id, profile_id) DO NOTHING;

  UPDATE invitations
  SET accepted_at = now()
  WHERE lower(email) = lower(NEW.email)
    AND accepted_at IS NULL;

  RETURN NEW;
END;
$$;
