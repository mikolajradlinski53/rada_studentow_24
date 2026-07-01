-- RadaStudentów24 — Migration 007: public resolution registry (portal mieszkańca)
-- Published resolutions are public. We denormalize org_id onto resolutions so an
-- anonymous visitor can list one org's registry without reading RLS-protected
-- sessions/organs/terms.

ALTER TABLE resolutions ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Backfill from session -> organ -> org.
UPDATE resolutions r
SET org_id = o.org_id
FROM sessions s
JOIN organs o ON o.id = s.organ_id
WHERE r.session_id = s.id AND r.org_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_resolutions_org_status ON resolutions(org_id, status);

-- Anyone (incl. anon) may read PUBLISHED resolutions.
DROP POLICY IF EXISTS "resolution_public_read" ON resolutions;
CREATE POLICY "resolution_public_read" ON resolutions FOR SELECT
  USING (status = 'published');

-- Organizations are public bodies — allow public read (name/slug/logo for the registry).
DROP POLICY IF EXISTS "org_public_read" ON organizations;
CREATE POLICY "org_public_read" ON organizations FOR SELECT
  USING (true);
