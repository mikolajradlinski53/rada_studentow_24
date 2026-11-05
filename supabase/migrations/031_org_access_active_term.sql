-- RadaStudentów24 — Migration 031: org-level access follows the ACTIVE term
--
-- The app (getOrgContext / getMyOrgs) lets a person into an org only with an
-- active mandate in the org's ACTIVE term. The DB helpers accepted an active
-- mandate in ANY term, so after a term change (new kadencja) former members
-- would keep API read access to the whole org, and former admins would keep
-- user_is_org_admin (invitations, mandates, org settings) - unless every old
-- mandate was deactivated by hand. Align the DB with the app.
-- Term-specific helpers (user_in_term, user_can_manage_session/term, cast_*)
-- are unchanged: they already check the exact term.

CREATE OR REPLACE FUNCTION get_user_org_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT o.org_id
  FROM mandates m
  JOIN terms t ON t.id = m.term_id
  JOIN organs o ON o.id = t.organ_id
  WHERE m.profile_id = auth.uid() AND m.is_active = true AND t.is_active = true
  UNION
  SELECT org.id FROM organizations org WHERE is_platform_admin();
$$;

CREATE OR REPLACE FUNCTION user_has_org_access(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_platform_admin() OR EXISTS (
    SELECT 1 FROM mandates m
    JOIN terms t ON t.id = m.term_id
    JOIN organs o ON o.id = t.organ_id
    WHERE m.profile_id = auth.uid() AND o.org_id = p_org_id
      AND m.is_active = true AND t.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION user_is_org_admin(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_platform_admin() OR EXISTS (
    SELECT 1 FROM mandates m
    JOIN terms t ON t.id = m.term_id
    JOIN organs o ON o.id = t.organ_id
    WHERE m.profile_id = auth.uid() AND o.org_id = p_org_id
      AND m.is_active = true AND t.is_active = true AND m.role = 'admin'
  );
$$;
