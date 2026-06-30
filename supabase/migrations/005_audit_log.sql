-- RadaStudentów24 — Migration 005: server-side audit logging
-- Direct INSERTs into audit_log are blocked by RLS (migration 001). This
-- SECURITY DEFINER function is the only write path: it stamps actor_id from the
-- session, derives org_id from the target, and appends the entry. Callable by
-- any authenticated user, but they can only ever log as themselves.

CREATE OR REPLACE FUNCTION log_audit(
  p_action      TEXT,
  p_target_type TEXT,
  p_target_id   UUID,
  p_metadata    JSONB DEFAULT '{}'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID;
BEGIN
  IF p_target_type = 'session' THEN
    SELECT o.org_id INTO v_org FROM sessions s JOIN organs o ON o.id = s.organ_id WHERE s.id = p_target_id;
  ELSIF p_target_type = 'vote' THEN
    SELECT o.org_id INTO v_org FROM votes v JOIN sessions s ON s.id = v.session_id JOIN organs o ON o.id = s.organ_id WHERE v.id = p_target_id;
  ELSIF p_target_type = 'resolution' THEN
    SELECT o.org_id INTO v_org FROM resolutions r JOIN sessions s ON s.id = r.session_id JOIN organs o ON o.id = s.organ_id WHERE r.id = p_target_id;
  ELSIF p_target_type = 'protocol' THEN
    SELECT o.org_id INTO v_org FROM protocols p JOIN sessions s ON s.id = p.session_id JOIN organs o ON o.id = s.organ_id WHERE p.id = p_target_id;
  END IF;

  -- Fallback: the caller's own org (e.g. non-target-scoped events).
  IF v_org IS NULL THEN
    SELECT g INTO v_org FROM get_user_org_ids() AS g LIMIT 1;
  END IF;
  IF v_org IS NULL THEN
    RETURN; -- nothing we can safely attribute; skip
  END IF;

  INSERT INTO audit_log (org_id, actor_id, action, target_type, target_id, metadata)
  VALUES (v_org, auth.uid(), p_action, p_target_type, p_target_id, COALESCE(p_metadata, '{}'::jsonb));
END;
$$;
