-- RadaStudentów24 — Migration 035: published resolutions are final, every change is logged
--
-- 1. Re-apply 013 (bilingual columns). 001-013 were baselined as "applied"
--    without running, and 013 never reached production: saving a resolution
--    and the public registry both referenced the missing *_en columns.
-- 2. For API callers: number / signature / vote / session are immutable; once
--    PUBLISHED the text is frozen and the only allowed change is revoking
--    (uchylenie); a revoked resolution is frozen entirely.
-- 3. Every content edit and every status change lands in the audit log (for
--    KR), written by a trigger, so it can't be skipped by the client.

ALTER TABLE resolutions
  ADD COLUMN IF NOT EXISTS title_en       TEXT,
  ADD COLUMN IF NOT EXISTS legal_basis_en TEXT,
  ADD COLUMN IF NOT EXISTS body_en        TEXT;

CREATE OR REPLACE FUNCTION guard_resolution_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.number IS DISTINCT FROM OLD.number OR NEW.signature IS DISTINCT FROM OLD.signature
     OR NEW.vote_id IS DISTINCT FROM OLD.vote_id OR NEW.session_id IS DISTINCT FROM OLD.session_id
     OR NEW.term_id IS DISTINCT FROM OLD.term_id OR NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    RAISE EXCEPTION 'resolution_identity_read_only';
  END IF;

  IF OLD.status = 'revoked' THEN
    RAISE EXCEPTION 'resolution_revoked_is_final';
  END IF;

  IF OLD.status = 'published' THEN
    IF NEW.status NOT IN ('published', 'revoked')
       OR NEW.title IS DISTINCT FROM OLD.title OR NEW.body IS DISTINCT FROM OLD.body
       OR NEW.legal_basis IS DISTINCT FROM OLD.legal_basis
       OR NEW.title_en IS DISTINCT FROM OLD.title_en OR NEW.body_en IS DISTINCT FROM OLD.body_en
       OR NEW.legal_basis_en IS DISTINCT FROM OLD.legal_basis_en
       OR NEW.signed_by IS DISTINCT FROM OLD.signed_by OR NEW.signed_at IS DISTINCT FROM OLD.signed_at THEN
      RAISE EXCEPTION 'resolution_published_is_final';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS resolutions_guard ON resolutions;
CREATE TRIGGER resolutions_guard BEFORE UPDATE ON resolutions
  FOR EACH ROW EXECUTE FUNCTION guard_resolution_update();

CREATE OR REPLACE FUNCTION log_resolution_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_fields TEXT[] := '{}';
BEGIN
  IF NEW.title IS DISTINCT FROM OLD.title THEN v_fields := v_fields || 'tytuł'; END IF;
  IF NEW.body IS DISTINCT FROM OLD.body THEN v_fields := v_fields || 'treść'; END IF;
  IF NEW.legal_basis IS DISTINCT FROM OLD.legal_basis THEN v_fields := v_fields || 'podstawa prawna'; END IF;
  IF NEW.title_en IS DISTINCT FROM OLD.title_en OR NEW.body_en IS DISTINCT FROM OLD.body_en
     OR NEW.legal_basis_en IS DISTINCT FROM OLD.legal_basis_en THEN v_fields := v_fields || 'wersja EN'; END IF;

  IF array_length(v_fields, 1) > 0 THEN
    INSERT INTO audit_log (org_id, actor_id, action, target_type, target_id, metadata)
    VALUES (NEW.org_id, auth.uid(), 'resolution.edited', 'resolution', NEW.id,
            jsonb_build_object('fields', v_fields, 'status', OLD.status, 'signature', NEW.signature));
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO audit_log (org_id, actor_id, action, target_type, target_id, metadata)
    VALUES (NEW.org_id, auth.uid(), 'resolution.status', 'resolution', NEW.id,
            jsonb_build_object('from', OLD.status, 'to', NEW.status, 'signature', NEW.signature));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION log_resolution_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS resolutions_log ON resolutions;
CREATE TRIGGER resolutions_log AFTER UPDATE ON resolutions
  FOR EACH ROW EXECUTE FUNCTION log_resolution_change();
