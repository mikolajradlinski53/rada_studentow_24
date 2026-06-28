-- RadaStudentów24 — Migration 002: multi-tenant branding/modules + invitations + admin RLS

-- ============================================================
-- 1. BRANDING & FEATURE FLAGS (per organization)
-- ============================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS accent_color TEXT,
  ADD COLUMN IF NOT EXISTS enabled_modules TEXT[] NOT NULL
    DEFAULT ARRAY['sessions','resolutions','audit'];

-- ============================================================
-- 2. INVITATIONS — pre-authorize an email before the account exists
-- ============================================================

CREATE TABLE IF NOT EXISTS invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id     UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('admin','chair','member','auditor','secretary','election_committee')),
  label       TEXT,
  invited_by  UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(term_id, email)
);

CREATE INDEX IF NOT EXISTS idx_invitations_email_pending
  ON invitations (lower(email)) WHERE accepted_at IS NULL;

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. HELPER — is the current user an admin of this org?
-- ============================================================

CREATE OR REPLACE FUNCTION user_is_org_admin(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM mandates m
    JOIN terms t  ON t.id = m.term_id
    JOIN organs o ON o.id = t.organ_id
    WHERE m.profile_id = auth.uid()
      AND o.org_id = p_org_id
      AND m.is_active = true
      AND m.role = 'admin'
  );
$$;

-- ============================================================
-- 4. ONBOARDING — accept invitations on first login
-- ============================================================
-- Replaces handle_new_user() from migration 001: after creating the profile,
-- materialize mandates from any pending invitations matching the email.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
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

-- ============================================================
-- 5. RLS — invitations (managed by org admins) + mandate writes
-- ============================================================
-- org_id for an invitation is derived: invitation.term_id -> terms -> organs.org_id

CREATE POLICY "invitation_admin_all" ON invitations FOR ALL
  USING (EXISTS (
    SELECT 1 FROM terms t JOIN organs o ON o.id = t.organ_id
    WHERE t.id = invitations.term_id AND user_is_org_admin(o.org_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM terms t JOIN organs o ON o.id = t.organ_id
    WHERE t.id = invitations.term_id AND user_is_org_admin(o.org_id)
  ));

-- Admins may grant/revoke/relabel mandates within their org.
CREATE POLICY "mandate_admin_insert" ON mandates FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM terms t JOIN organs o ON o.id = t.organ_id
    WHERE t.id = mandates.term_id AND user_is_org_admin(o.org_id)
  ));

CREATE POLICY "mandate_admin_update" ON mandates FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM terms t JOIN organs o ON o.id = t.organ_id
    WHERE t.id = mandates.term_id AND user_is_org_admin(o.org_id)
  ));
