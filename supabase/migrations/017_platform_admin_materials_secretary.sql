-- RadaStudentów24 — Migration 017
--   1. Platform superadmin (cross-org)          2. Secretary writes protocols
--   3. Agenda materials (Supabase Storage)

-- ============================================================
-- 1. PLATFORM SUPERADMIN
-- ============================================================
-- Separate table (not a profiles column): users can update their own profile
-- row, so a flag there would be self-grantable. No RLS policies → only the
-- service role / SQL editor can add rows.

CREATE TABLE IF NOT EXISTS platform_admins (
  profile_id  UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM platform_admins WHERE profile_id = auth.uid());
$$;

-- The access helpers every RLS policy goes through now also admit superadmins.
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
  WHERE m.profile_id = auth.uid()
    AND m.is_active = true
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
    SELECT 1
    FROM mandates m
    JOIN terms t ON t.id = m.term_id
    JOIN organs o ON o.id = t.organ_id
    WHERE m.profile_id = auth.uid()
      AND o.org_id = p_org_id
      AND m.is_active = true
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

CREATE OR REPLACE FUNCTION user_can_manage_session(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_platform_admin()
  OR EXISTS (
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

-- ============================================================
-- 2. SECRETARY (protokolant) WRITES PROTOCOLS
-- ============================================================

CREATE OR REPLACE FUNCTION user_can_write_protocol(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_can_manage_session(p_session_id)
  OR EXISTS (
    SELECT 1
    FROM sessions s
    JOIN mandates m ON m.term_id = s.term_id
    WHERE s.id = p_session_id
      AND m.profile_id = auth.uid()
      AND m.is_active = true
      AND m.role = 'secretary'
  )
  OR EXISTS (SELECT 1 FROM sessions s WHERE s.id = p_session_id AND s.protocol_by = auth.uid());
$$;

DROP POLICY IF EXISTS "protocol_write" ON protocols;
CREATE POLICY "protocol_write" ON protocols FOR INSERT
  WITH CHECK (user_can_write_protocol(session_id));

DROP POLICY IF EXISTS "protocol_update" ON protocols;
CREATE POLICY "protocol_update" ON protocols FOR UPDATE
  USING (user_can_write_protocol(session_id))
  WITH CHECK (user_can_write_protocol(session_id));

-- ============================================================
-- 3. AGENDA MATERIALS (Storage bucket "materials", private)
-- ============================================================
-- Object path: {org_id}/{session_id}/{agenda_item_id}/{random}-{file name}
-- agenda_attachments.file_url holds that storage path; members get short-lived
-- signed URLs, never public links.

ALTER TABLE agenda_attachments ADD COLUMN IF NOT EXISTS file_size BIGINT;

DROP POLICY IF EXISTS "attachment_delete" ON agenda_attachments;
CREATE POLICY "attachment_delete" ON agenda_attachments FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM agenda_items ai WHERE ai.id = agenda_item_id AND user_can_manage_session(ai.session_id)
  ));

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('materials', 'materials', false, 52428800) -- 50 MB per file
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit;

CREATE OR REPLACE FUNCTION storage_path_uuid(p_name TEXT, p_part INT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN split_part(p_name, '/', p_part)::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

DROP POLICY IF EXISTS "materials_read" ON storage.objects;
CREATE POLICY "materials_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'materials' AND user_has_org_access(storage_path_uuid(name, 1)));

DROP POLICY IF EXISTS "materials_insert" ON storage.objects;
CREATE POLICY "materials_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'materials'
    AND user_can_manage_session(storage_path_uuid(name, 2))
    -- the org segment must be the session's own org (no planting files elsewhere)
    AND EXISTS (
      SELECT 1 FROM sessions s JOIN organs o ON o.id = s.organ_id
      WHERE s.id = storage_path_uuid(name, 2) AND o.org_id = storage_path_uuid(name, 1)
    )
  );

DROP POLICY IF EXISTS "materials_delete" ON storage.objects;
CREATE POLICY "materials_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'materials' AND user_can_manage_session(storage_path_uuid(name, 2)));
