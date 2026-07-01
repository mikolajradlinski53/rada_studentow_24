-- RadaStudentów24 — Migration 009: org admins can edit their org branding/modules
-- (name, accent_color, logo_url, enabled_modules). Reads stay public (007).

DROP POLICY IF EXISTS "org_admin_update" ON organizations;
CREATE POLICY "org_admin_update" ON organizations FOR UPDATE
  USING (user_is_org_admin(id))
  WITH CHECK (user_is_org_admin(id));
