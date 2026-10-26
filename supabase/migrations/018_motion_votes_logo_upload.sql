-- RadaStudentów24 — Migration 018
--   1. Procedural vote remembers its formal motion -> auto-enacted on "passed"
--   2. Logo upload (public "branding" bucket, written by org admins)

ALTER TABLE votes ADD COLUMN IF NOT EXISTS floor_request_id UUID REFERENCES floor_requests(id) ON DELETE SET NULL;

-- Logos are public by nature (shown on the public registry), so the bucket is
-- public-read; only an org's admins may write under their {org_id}/ prefix.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('branding', 'branding', true, 2097152, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "branding_insert" ON storage.objects;
CREATE POLICY "branding_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'branding' AND user_is_org_admin(storage_path_uuid(name, 1)));

DROP POLICY IF EXISTS "branding_update" ON storage.objects;
CREATE POLICY "branding_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'branding' AND user_is_org_admin(storage_path_uuid(name, 1)));

DROP POLICY IF EXISTS "branding_delete" ON storage.objects;
CREATE POLICY "branding_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'branding' AND user_is_org_admin(storage_path_uuid(name, 1)));
