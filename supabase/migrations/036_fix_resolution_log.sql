-- RadaStudentów24 — Migration 036: fix log_resolution_change() from 035
-- `text[] || 'literal'` parses the literal as an array -> every content edit
-- failed with "malformed array literal". Use array_append.
CREATE OR REPLACE FUNCTION log_resolution_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_fields TEXT[] := '{}';
BEGIN
  IF NEW.title IS DISTINCT FROM OLD.title THEN v_fields := array_append(v_fields, 'tytuł'); END IF;
  IF NEW.body IS DISTINCT FROM OLD.body THEN v_fields := array_append(v_fields, 'treść'); END IF;
  IF NEW.legal_basis IS DISTINCT FROM OLD.legal_basis THEN v_fields := array_append(v_fields, 'podstawa prawna'); END IF;
  IF NEW.title_en IS DISTINCT FROM OLD.title_en OR NEW.body_en IS DISTINCT FROM OLD.body_en
     OR NEW.legal_basis_en IS DISTINCT FROM OLD.legal_basis_en THEN v_fields := array_append(v_fields, 'wersja EN'); END IF;

  IF coalesce(array_length(v_fields, 1), 0) > 0 THEN
    INSERT INTO audit_log (org_id, actor_id, action, target_type, target_id, metadata)
    VALUES (NEW.org_id, auth.uid(), 'resolution.edited', 'resolution', NEW.id,
            jsonb_build_object('fields', to_jsonb(v_fields), 'status', OLD.status, 'signature', NEW.signature));
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
