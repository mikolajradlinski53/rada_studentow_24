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
