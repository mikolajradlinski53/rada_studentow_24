-- RadaStudentów24 — Migration 014: Web Push notifications (PWA)
-- Each device that enables notifications stores its PushSubscription here.
-- Sending happens server-side (/api/push) signed with the VAPID private key, so
-- an endpoint alone is useless to anyone without that key.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_profile_idx ON push_subscriptions(profile_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- A user manages only their own devices.
DROP POLICY IF EXISTS "push_subscriptions_select_own" ON push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions_insert_own" ON push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions_update_own" ON push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions_delete_own" ON push_subscriptions;
CREATE POLICY "push_subscriptions_select_own" ON push_subscriptions
  FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "push_subscriptions_insert_own" ON push_subscriptions
  FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "push_subscriptions_update_own" ON push_subscriptions
  FOR UPDATE USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
CREATE POLICY "push_subscriptions_delete_own" ON push_subscriptions
  FOR DELETE USING (profile_id = auth.uid());

-- Dedupe: one broadcast per (event, target), however many times it is requested.
CREATE TABLE IF NOT EXISTS push_events (
  event       TEXT NOT NULL,
  target_id   UUID NOT NULL,
  sent_by     UUID REFERENCES profiles(id),
  sent_at     TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (event, target_id)
);

ALTER TABLE push_events ENABLE ROW LEVEL SECURITY; -- no policies: RPC-only

-- Claims a broadcast and returns the recipients' subscriptions. Only the
-- session's chair/admin may call it, only for a genuinely live target, and only
-- once per target (subsequent calls return no rows). The caller is excluded.
CREATE OR REPLACE FUNCTION claim_push_broadcast(p_event TEXT, p_target_id UUID)
RETURNS TABLE (sub_endpoint TEXT, sub_p256dh TEXT, sub_auth TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session UUID;
  v_term    UUID;
  v_claimed INT;
BEGIN
  IF p_event = 'vote_opened' THEN
    SELECT v.session_id INTO v_session FROM votes v
    WHERE v.id = p_target_id AND v.status = 'open';
  ELSIF p_event = 'session_opened' THEN
    SELECT s.id INTO v_session FROM sessions s
    WHERE s.id = p_target_id AND s.status = 'in_progress';
  ELSE
    RAISE EXCEPTION 'unknown push event %', p_event;
  END IF;

  IF v_session IS NULL OR NOT user_can_manage_session(v_session) THEN
    RETURN;
  END IF;

  INSERT INTO push_events (event, target_id, sent_by)
  VALUES (p_event, p_target_id, auth.uid())
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  IF v_claimed = 0 THEN
    RETURN; -- already broadcast
  END IF;

  SELECT s.term_id INTO v_term FROM sessions s WHERE s.id = v_session;

  RETURN QUERY
  SELECT ps.endpoint, ps.p256dh, ps.auth
  FROM push_subscriptions ps
  JOIN mandates m ON m.profile_id = ps.profile_id
  WHERE m.term_id = v_term
    AND m.is_active = true
    AND ps.profile_id <> auth.uid();
END;
$$;

-- Drops subscriptions the push service reported as gone (404/410).
-- Endpoints are unguessable capability URLs, so deleting by exact match is safe.
CREATE OR REPLACE FUNCTION prune_push_subscriptions(p_endpoints TEXT[])
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM push_subscriptions WHERE endpoint = ANY(p_endpoints);
$$;

REVOKE ALL ON FUNCTION claim_push_broadcast(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION claim_push_broadcast(TEXT, UUID) TO authenticated;
REVOKE ALL ON FUNCTION prune_push_subscriptions(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION prune_push_subscriptions(TEXT[]) TO authenticated;
