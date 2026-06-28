-- RadaStudentów24 — Initial Schema
-- Migration 001: Core tables, RLS, functions

-- ============================================================
-- 1. ORGANIZATIONS & ORGANS
-- ============================================================

CREATE TABLE organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  logo_url    TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE organs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  short_name          TEXT NOT NULL,
  total_seats         INT NOT NULL,
  quorum_type         TEXT NOT NULL DEFAULT 'majority' CHECK (quorum_type IN ('majority', 'two_thirds', 'custom')),
  quorum_value        NUMERIC,
  resolution_prefix   TEXT NOT NULL DEFAULT 'Uchwała',
  resolution_pattern  TEXT NOT NULL DEFAULT '{nr}/{kadencja}/{organ}',
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE terms (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organ_id            UUID NOT NULL REFERENCES organs(id) ON DELETE CASCADE,
  label               TEXT NOT NULL,
  starts_at           DATE NOT NULL,
  ends_at             DATE NOT NULL,
  is_active           BOOLEAN DEFAULT true,
  resolution_counter  INT DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. PROFILES & MANDATES
-- ============================================================

CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  email       TEXT NOT NULL,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE mandates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id     UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'chair', 'member', 'auditor', 'secretary', 'election_committee')),
  label       TEXT,
  is_active   BOOLEAN DEFAULT true,
  granted_at  TIMESTAMPTZ DEFAULT now(),
  revoked_at  TIMESTAMPTZ,
  UNIQUE(term_id, profile_id)
);

-- ============================================================
-- 3. SESSIONS
-- ============================================================

CREATE TABLE sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organ_id      UUID NOT NULL REFERENCES organs(id) ON DELETE CASCADE,
  term_id       UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  session_type  TEXT NOT NULL DEFAULT 'regular' CHECK (session_type IN ('regular', 'extraordinary')),
  mode          TEXT NOT NULL DEFAULT 'in_person' CHECK (mode IN ('in_person', 'remote', 'hybrid')),
  scheduled_at  TIMESTAMPTZ NOT NULL,
  location      TEXT,
  opened_at     TIMESTAMPTZ,
  closed_at     TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'in_progress', 'closed', 'protocol_pending', 'archived')),
  chaired_by    UUID REFERENCES profiles(id),
  protocol_by   UUID REFERENCES profiles(id),
  created_by    UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE attendance (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  mandate_id      UUID NOT NULL REFERENCES mandates(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'absent' CHECK (status IN ('present', 'absent', 'late', 'excused', 'left_early')),
  checked_in_at   TIMESTAMPTZ,
  checked_out_at  TIMESTAMPTZ,
  UNIQUE(session_id, mandate_id)
);

-- ============================================================
-- 4. AGENDA
-- ============================================================

CREATE TABLE agenda_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  position          INT NOT NULL,
  title             TEXT NOT NULL,
  item_type         TEXT NOT NULL DEFAULT 'discussion' CHECK (item_type IN ('procedural', 'discussion', 'resolution', 'election', 'information')),
  description       TEXT,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'postponed')),
  discussion_notes  TEXT,
  started_at        TIMESTAMPTZ,
  ended_at          TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE agenda_attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_item_id  UUID NOT NULL REFERENCES agenda_items(id) ON DELETE CASCADE,
  file_name       TEXT NOT NULL,
  file_url        TEXT NOT NULL,
  file_type       TEXT,
  uploaded_by     UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 5. VOTING (core)
-- ============================================================

CREATE TABLE votes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_item_id  UUID REFERENCES agenda_items(id) ON DELETE SET NULL,
  session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  vote_type       TEXT NOT NULL DEFAULT 'open' CHECK (vote_type IN ('open', 'secret')),
  threshold       TEXT NOT NULL DEFAULT 'simple_majority' CHECK (threshold IN ('simple_majority', 'absolute_majority', 'two_thirds')),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'open', 'closed', 'cancelled')),
  opened_at       TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ,
  votes_for       INT DEFAULT 0,
  votes_against   INT DEFAULT 0,
  votes_abstain   INT DEFAULT 0,
  total_eligible  INT DEFAULT 0,
  result          TEXT CHECK (result IN ('passed', 'rejected', 'no_quorum')),
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE ballots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vote_id     UUID NOT NULL REFERENCES votes(id) ON DELETE CASCADE,
  mandate_id  UUID REFERENCES mandates(id) ON DELETE SET NULL,
  choice      TEXT NOT NULL CHECK (choice IN ('for', 'against', 'abstain')),
  cast_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE(vote_id, mandate_id)
);

CREATE TABLE secret_ballot_receipts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vote_id     UUID NOT NULL REFERENCES votes(id) ON DELETE CASCADE,
  mandate_id  UUID NOT NULL REFERENCES mandates(id) ON DELETE CASCADE,
  cast_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE(vote_id, mandate_id)
);

-- ============================================================
-- 6. RESOLUTIONS & PROTOCOLS
-- ============================================================

CREATE TABLE resolutions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vote_id     UUID REFERENCES votes(id) ON DELETE SET NULL,
  session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  term_id     UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  number      INT NOT NULL,
  signature   TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  legal_basis TEXT,
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'adopted', 'published', 'revoked')),
  signed_by   UUID REFERENCES profiles(id),
  signed_at   TIMESTAMPTZ,
  pdf_url     TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE protocols (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE UNIQUE,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'published')),
  generated_at  TIMESTAMPTZ,
  body          TEXT,
  signed_by     UUID REFERENCES profiles(id),
  signed_at     TIMESTAMPTZ,
  pdf_url       TEXT,
  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 7. AUDIT LOG
-- ============================================================

CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id    UUID REFERENCES profiles(id),
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   UUID,
  metadata    JSONB DEFAULT '{}',
  ip_address  INET,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_log_org_created ON audit_log(org_id, created_at DESC);
CREATE INDEX idx_audit_log_target ON audit_log(target_type, target_id);

-- ============================================================
-- 8. HELPER FUNCTIONS
-- ============================================================

-- Get the current user's org_id(s) through their mandates
CREATE OR REPLACE FUNCTION get_user_org_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT DISTINCT o.org_id
  FROM mandates m
  JOIN terms t ON t.id = m.term_id
  JOIN organs o ON o.id = t.organ_id
  WHERE m.profile_id = auth.uid()
    AND m.is_active = true;
$$;

-- Get the current user's role in a given term
CREATE OR REPLACE FUNCTION get_user_role(p_term_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT m.role
  FROM mandates m
  WHERE m.term_id = p_term_id
    AND m.profile_id = auth.uid()
    AND m.is_active = true
  LIMIT 1;
$$;

-- Check if user has any mandate in the org
CREATE OR REPLACE FUNCTION user_has_org_access(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM mandates m
    JOIN terms t ON t.id = m.term_id
    JOIN organs o ON o.id = t.organ_id
    WHERE m.profile_id = auth.uid()
      AND o.org_id = p_org_id
      AND m.is_active = true
  );
$$;

-- Check if user is chair or admin in a session's term
CREATE OR REPLACE FUNCTION user_can_manage_session(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM sessions s
    JOIN mandates m ON m.term_id = s.term_id
    WHERE s.id = p_session_id
      AND m.profile_id = auth.uid()
      AND m.is_active = true
      AND m.role IN ('admin', 'chair')
  )
  OR EXISTS (
    SELECT 1 FROM sessions s
    WHERE s.id = p_session_id
      AND s.chaired_by = auth.uid()
  );
$$;

-- Calculate quorum for a session
CREATE OR REPLACE FUNCTION calculate_quorum(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_total_seats INT;
  v_quorum_type TEXT;
  v_quorum_value NUMERIC;
  v_present INT;
  v_required INT;
BEGIN
  SELECT o.total_seats, o.quorum_type, o.quorum_value
  INTO v_total_seats, v_quorum_type, v_quorum_value
  FROM sessions s
  JOIN organs o ON o.id = s.organ_id
  WHERE s.id = p_session_id;

  SELECT COUNT(*) INTO v_present
  FROM attendance
  WHERE session_id = p_session_id
    AND status IN ('present', 'late');

  CASE v_quorum_type
    WHEN 'majority' THEN v_required := (v_total_seats / 2) + 1;
    WHEN 'two_thirds' THEN v_required := CEIL(v_total_seats * 2.0 / 3);
    WHEN 'custom' THEN v_required := COALESCE(v_quorum_value, (v_total_seats / 2) + 1);
  END CASE;

  RETURN jsonb_build_object(
    'total_seats', v_total_seats,
    'present', v_present,
    'required', v_required,
    'has_quorum', v_present >= v_required
  );
END;
$$;

-- Tally votes and determine result
CREATE OR REPLACE FUNCTION tally_vote(p_vote_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
BEGIN
  SELECT v.threshold, v.session_id INTO v_threshold, v_session_id
  FROM votes v WHERE v.id = p_vote_id;

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
$$;

-- Cast a ballot (open or secret) — the ONLY supported path for voting.
-- Runs as definer so it can write the unlinked secret ballot, while still
-- verifying the caller owns the mandate. Atomic: a secret double-vote aborts
-- before any ballot row is written.
CREATE OR REPLACE FUNCTION cast_ballot(p_vote_id UUID, p_mandate_id UUID, p_choice TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type   TEXT;
  v_status TEXT;
BEGIN
  IF p_choice NOT IN ('for', 'against', 'abstain') THEN
    RAISE EXCEPTION 'invalid_choice';
  END IF;

  -- The mandate must belong to the calling user (prevents voting as someone else)
  IF NOT EXISTS (
    SELECT 1 FROM mandates m
    WHERE m.id = p_mandate_id
      AND m.profile_id = auth.uid()
      AND m.is_active = true
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT vote_type, status INTO v_type, v_status
  FROM votes WHERE id = p_vote_id;

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'vote_not_found';
  END IF;
  IF v_status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'vote_not_open';
  END IF;

  IF v_type = 'open' THEN
    -- One ballot per mandate, enforced by UNIQUE(vote_id, mandate_id).
    INSERT INTO ballots (vote_id, mandate_id, choice)
    VALUES (p_vote_id, p_mandate_id, p_choice);
  ELSE
    -- Secret: record participation first (UNIQUE(vote_id, mandate_id) aborts a
    -- double vote before any ballot is written). Then store the choice as an
    -- UNLINKED ballot with NO cast_at, so it cannot be time-correlated with the
    -- receipt to deanonymize the voter.
    INSERT INTO secret_ballot_receipts (vote_id, mandate_id)
    VALUES (p_vote_id, p_mandate_id);

    INSERT INTO ballots (vote_id, mandate_id, choice, cast_at)
    VALUES (p_vote_id, NULL, p_choice, NULL);
  END IF;
END;
$$;

-- Auto-increment resolution number within a term
CREATE OR REPLACE FUNCTION next_resolution_number(p_term_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next INT;
BEGIN
  UPDATE terms
  SET resolution_counter = resolution_counter + 1
  WHERE id = p_term_id
  RETURNING resolution_counter INTO v_next;

  RETURN v_next;
END;
$$;

-- ============================================================
-- 9. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organs ENABLE ROW LEVEL SECURITY;
ALTER TABLE terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE mandates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ballots ENABLE ROW LEVEL SECURITY;
ALTER TABLE secret_ballot_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Organizations: readable by members
CREATE POLICY "org_read" ON organizations FOR SELECT
  USING (user_has_org_access(id));

-- Organs: readable by org members
CREATE POLICY "organ_read" ON organs FOR SELECT
  USING (user_has_org_access(org_id));

-- Terms: readable by org members
CREATE POLICY "term_read" ON terms FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM organs o WHERE o.id = organ_id AND user_has_org_access(o.org_id)
  ));

-- Profiles: own profile always readable, others in same org
CREATE POLICY "profile_read_own" ON profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "profile_read_org" ON profiles FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM mandates m
    JOIN terms t ON t.id = m.term_id
    JOIN organs o ON o.id = t.organ_id
    WHERE m.profile_id = profiles.id
      AND user_has_org_access(o.org_id)
  ));

CREATE POLICY "profile_update_own" ON profiles FOR UPDATE
  USING (id = auth.uid());

-- Mandates: readable by org members
CREATE POLICY "mandate_read" ON mandates FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM terms t
    JOIN organs o ON o.id = t.organ_id
    WHERE t.id = term_id
      AND user_has_org_access(o.org_id)
  ));

-- Sessions: readable by org members, writable by chair/admin
CREATE POLICY "session_read" ON sessions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM organs o WHERE o.id = organ_id AND user_has_org_access(o.org_id)
  ));

CREATE POLICY "session_insert" ON sessions FOR INSERT
  WITH CHECK (
    get_user_role(term_id) IN ('admin', 'chair')
  );

CREATE POLICY "session_update" ON sessions FOR UPDATE
  USING (user_can_manage_session(id));

-- Attendance: readable by org members, writable by self or chair
CREATE POLICY "attendance_read" ON attendance FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM sessions s
    JOIN organs o ON o.id = s.organ_id
    WHERE s.id = session_id
      AND user_has_org_access(o.org_id)
  ));

CREATE POLICY "attendance_upsert" ON attendance FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM mandates m WHERE m.id = mandate_id AND m.profile_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM sessions s WHERE s.id = session_id AND user_can_manage_session(s.id)
    )
  );

CREATE POLICY "attendance_update" ON attendance FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM mandates m WHERE m.id = mandate_id AND m.profile_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM sessions s WHERE s.id = session_id AND user_can_manage_session(s.id)
    )
  );

-- Agenda items: readable by org members, writable by session manager
CREATE POLICY "agenda_read" ON agenda_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM sessions s
    JOIN organs o ON o.id = s.organ_id
    WHERE s.id = session_id
      AND user_has_org_access(o.org_id)
  ));

CREATE POLICY "agenda_write" ON agenda_items FOR INSERT
  WITH CHECK (user_can_manage_session(session_id));

CREATE POLICY "agenda_update" ON agenda_items FOR UPDATE
  USING (user_can_manage_session(session_id));

CREATE POLICY "agenda_delete" ON agenda_items FOR DELETE
  USING (user_can_manage_session(session_id));

-- Agenda attachments: same as agenda items
CREATE POLICY "attachment_read" ON agenda_attachments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM agenda_items ai
    JOIN sessions s ON s.id = ai.session_id
    JOIN organs o ON o.id = s.organ_id
    WHERE ai.id = agenda_item_id
      AND user_has_org_access(o.org_id)
  ));

CREATE POLICY "attachment_write" ON agenda_attachments FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM agenda_items ai WHERE ai.id = agenda_item_id AND user_can_manage_session(ai.session_id)
  ));

-- Votes: readable by org members, writable by session manager
CREATE POLICY "vote_read" ON votes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM sessions s
    JOIN organs o ON o.id = s.organ_id
    WHERE s.id = session_id
      AND user_has_org_access(o.org_id)
  ));

CREATE POLICY "vote_write" ON votes FOR INSERT
  WITH CHECK (user_can_manage_session(session_id));

CREATE POLICY "vote_update" ON votes FOR UPDATE
  USING (user_can_manage_session(session_id));

-- Ballots: NO direct client inserts. All voting goes through the cast_ballot()
-- RPC (SECURITY DEFINER), which enforces ownership, open status, atomic dedupe,
-- and secret-ballot anonymity. Direct inserts are denied so a client cannot
-- forge an unlinked secret ballot (ballot stuffing) or vote as another mandate.
CREATE POLICY "ballot_no_direct_insert" ON ballots FOR INSERT
  WITH CHECK (false);

CREATE POLICY "ballot_read_open" ON ballots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM votes v
      JOIN sessions s ON s.id = v.session_id
      JOIN organs o ON o.id = s.organ_id
      WHERE v.id = vote_id
        AND v.vote_type = 'open'
        AND user_has_org_access(o.org_id)
    )
  );

-- Secret ballot receipts: NO direct client inserts — written only by the
-- cast_ballot() RPC together with the unlinked ballot. Auditor/self can read.
CREATE POLICY "receipt_no_direct_insert" ON secret_ballot_receipts FOR INSERT
  WITH CHECK (false);

CREATE POLICY "receipt_read" ON secret_ballot_receipts FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM mandates m WHERE m.id = mandate_id AND m.profile_id = auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM votes v
      JOIN sessions s ON s.id = v.session_id
      JOIN mandates m ON m.term_id = s.term_id
      WHERE v.id = vote_id
        AND m.profile_id = auth.uid()
        AND m.role = 'auditor'
    )
  );

-- Resolutions: readable by org members
CREATE POLICY "resolution_read" ON resolutions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM sessions s
    JOIN organs o ON o.id = s.organ_id
    WHERE s.id = session_id
      AND user_has_org_access(o.org_id)
  ));

CREATE POLICY "resolution_write" ON resolutions FOR INSERT
  WITH CHECK (user_can_manage_session(session_id));

CREATE POLICY "resolution_update" ON resolutions FOR UPDATE
  USING (user_can_manage_session(session_id));

-- Protocols: readable by org members, writable by session manager or protocol_by
CREATE POLICY "protocol_read" ON protocols FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM sessions s
    JOIN organs o ON o.id = s.organ_id
    WHERE s.id = session_id
      AND user_has_org_access(o.org_id)
  ));

CREATE POLICY "protocol_write" ON protocols FOR INSERT
  WITH CHECK (user_can_manage_session(session_id));

CREATE POLICY "protocol_update" ON protocols FOR UPDATE
  USING (
    user_can_manage_session(session_id)
    OR EXISTS (
      SELECT 1 FROM sessions s WHERE s.id = session_id AND s.protocol_by = auth.uid()
    )
  );

-- Audit log: readable by auditors and admins
CREATE POLICY "audit_read" ON audit_log FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM mandates m
    JOIN terms t ON t.id = m.term_id
    JOIN organs o ON o.id = t.organ_id
    WHERE o.org_id = audit_log.org_id
      AND m.profile_id = auth.uid()
      AND m.role IN ('admin', 'chair', 'auditor')
      AND m.is_active = true
  ));

-- Audit log insert: server-side only (service role bypasses RLS). No client
-- inserts — otherwise the log the Komisja Rewizyjna relies on could be forged.
CREATE POLICY "audit_no_direct_insert" ON audit_log FOR INSERT
  WITH CHECK (false);

-- ============================================================
-- 10. AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================

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
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 11. REALTIME — enable for live voting
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE votes;
ALTER PUBLICATION supabase_realtime ADD TABLE ballots;
ALTER PUBLICATION supabase_realtime ADD TABLE attendance;
ALTER PUBLICATION supabase_realtime ADD TABLE agenda_items;

-- ============================================================
-- 12. SEED DATA — RUSS UEW pilot
-- ============================================================

-- This is run manually after migration, or via a seed file.
-- Included here for reference:

/*
INSERT INTO organizations (id, name, slug) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Samorząd Studentów UEW', 'uew');

INSERT INTO organs (id, org_id, name, short_name, total_seats, quorum_type, resolution_prefix, resolution_pattern) VALUES
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   'Rada Uczelniana Samorządu Studentów', 'RUSS', 16, 'majority',
   'Uchwała', '{nr}/{kadencja}/{organ}');

INSERT INTO terms (id, organ_id, label, starts_at, ends_at, is_active) VALUES
  ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222',
   '2025-2026', '2025-09-01', '2026-08-31', true);
*/
