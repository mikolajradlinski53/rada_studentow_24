-- RadaStudentów24 — Migration 040: anti-spam limits on the speakers' queue
--
-- For the person filing (not for the chair managing the queue):
--   * one active (waiting/speaking) request of each kind per sitting;
--   * at most 3 new requests per minute;
--   * ad vocem only while SOMEONE ELSE is speaking, once per that speech.

CREATE OR REPLACE FUNCTION guard_floor_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_speaker RECORD;
BEGIN
  IF EXISTS (
    SELECT 1 FROM floor_requests f
    WHERE f.session_id = NEW.session_id AND f.mandate_id = NEW.mandate_id AND f.kind = NEW.kind
      AND f.status IN ('waiting', 'speaking')
  ) THEN
    RAISE EXCEPTION 'floor_already_requested';
  END IF;

  IF (SELECT count(*) FROM floor_requests f
      WHERE f.session_id = NEW.session_id AND f.mandate_id = NEW.mandate_id
        AND f.created_at > now() - interval '1 minute') >= 3 THEN
    RAISE EXCEPTION 'floor_too_many_requests';
  END IF;

  IF NEW.kind = 'ad_vocem' THEN
    SELECT f.mandate_id, f.called_at INTO v_speaker
    FROM floor_requests f WHERE f.session_id = NEW.session_id AND f.status = 'speaking'
    ORDER BY f.called_at DESC NULLS LAST LIMIT 1;
    IF v_speaker.mandate_id IS NULL OR v_speaker.mandate_id = NEW.mandate_id THEN
      RAISE EXCEPTION 'ad_vocem_needs_other_speaker';
    END IF;
    IF EXISTS (
      SELECT 1 FROM floor_requests f
      WHERE f.session_id = NEW.session_id AND f.mandate_id = NEW.mandate_id AND f.kind = 'ad_vocem'
        AND f.created_at >= coalesce(v_speaker.called_at, now())
    ) THEN
      RAISE EXCEPTION 'ad_vocem_once_per_speech';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION guard_floor_request() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS floor_requests_limits ON floor_requests;
CREATE TRIGGER floor_requests_limits BEFORE INSERT ON floor_requests
  FOR EACH ROW EXECUTE FUNCTION guard_floor_request();
