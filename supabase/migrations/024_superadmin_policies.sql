-- RadaStudentów24 — Migration 024: policies that checked the mandate role
-- directly ignored the platform superadmin (e.g. a superadmin whose own
-- mandate is "member" couldn't create a sitting).

DROP POLICY IF EXISTS "session_insert" ON sessions;
CREATE POLICY "session_insert" ON sessions FOR INSERT
  WITH CHECK (user_can_manage_term(term_id));

DROP POLICY IF EXISTS "audit_read" ON audit_log;
CREATE POLICY "audit_read" ON audit_log FOR SELECT
  USING (
    is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM mandates m
      JOIN terms t ON t.id = m.term_id
      JOIN organs o ON o.id = t.organ_id
      WHERE o.org_id = audit_log.org_id AND m.profile_id = auth.uid()
        AND m.role IN ('admin', 'chair', 'auditor') AND m.is_active
    )
  );
