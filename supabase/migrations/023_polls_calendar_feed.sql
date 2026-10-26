-- RadaStudentów24 — Migration 023
--   1. Polls (ankiety) outside sittings - single/multi choice, optional "no names"
--   2. Private calendar feed token per user (webcal subscription)
--   3. Push broadcast learns 'poll_opened'

-- ============================================================
-- 1. POLLS
-- ============================================================
CREATE TABLE IF NOT EXISTS polls (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id      UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  title        TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  description  TEXT CHECK (char_length(description) <= 2000),
  multi        BOOLEAN NOT NULL DEFAULT false,
  -- true: others see only counts; names stay in the DB for "one answer per member".
  hide_names   BOOLEAN NOT NULL DEFAULT false,
  closes_at    TIMESTAMPTZ,
  closed_at    TIMESTAMPTZ,
  created_by   UUID REFERENCES profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS polls_term_idx ON polls(term_id, created_at DESC);

CREATE TABLE IF NOT EXISTS poll_options (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id   UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  label     TEXT NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 200),
  position  INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS poll_answers (
  poll_id     UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  option_id   UUID NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  mandate_id  UUID NOT NULL REFERENCES mandates(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, option_id, mandate_id)
);

ALTER TABLE polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_answers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION user_can_manage_term(p_term_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_platform_admin() OR EXISTS (
    SELECT 1 FROM mandates m WHERE m.term_id = p_term_id AND m.profile_id = auth.uid()
      AND m.is_active AND m.role IN ('admin', 'chair')
  );
$$;

CREATE OR REPLACE FUNCTION user_in_term(p_term_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_platform_admin() OR EXISTS (
    SELECT 1 FROM mandates m WHERE m.term_id = p_term_id AND m.profile_id = auth.uid() AND m.is_active
  );
$$;

DROP POLICY IF EXISTS "poll_read" ON polls;
CREATE POLICY "poll_read" ON polls FOR SELECT USING (user_in_term(term_id));
DROP POLICY IF EXISTS "poll_write" ON polls;
CREATE POLICY "poll_write" ON polls FOR ALL
  USING (user_can_manage_term(term_id)) WITH CHECK (user_can_manage_term(term_id));

DROP POLICY IF EXISTS "poll_option_read" ON poll_options;
CREATE POLICY "poll_option_read" ON poll_options FOR SELECT
  USING (EXISTS (SELECT 1 FROM polls p WHERE p.id = poll_id AND user_in_term(p.term_id)));
DROP POLICY IF EXISTS "poll_option_write" ON poll_options;
CREATE POLICY "poll_option_write" ON poll_options FOR ALL
  USING (EXISTS (SELECT 1 FROM polls p WHERE p.id = poll_id AND user_can_manage_term(p.term_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM polls p WHERE p.id = poll_id AND user_can_manage_term(p.term_id)));

-- Answers: own rows always; others' only when the poll shows names.
DROP POLICY IF EXISTS "poll_answer_read" ON poll_answers;
CREATE POLICY "poll_answer_read" ON poll_answers FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM mandates m WHERE m.id = mandate_id AND m.profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM polls p WHERE p.id = poll_id AND NOT p.hide_names AND user_in_term(p.term_id))
  );

-- Answering/changing: own mandate in the poll's term, while the poll is open.
-- (Single-choice is enforced by poll_answer() which replaces previous rows.)
DROP POLICY IF EXISTS "poll_answer_write" ON poll_answers;
CREATE POLICY "poll_answer_write" ON poll_answers FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM polls p JOIN mandates m ON m.term_id = p.term_id
    WHERE p.id = poll_id AND m.id = mandate_id AND m.profile_id = auth.uid() AND m.is_active
      AND p.closed_at IS NULL AND (p.closes_at IS NULL OR p.closes_at > now())
  ));
DROP POLICY IF EXISTS "poll_answer_delete" ON poll_answers;
CREATE POLICY "poll_answer_delete" ON poll_answers FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM polls p JOIN mandates m ON m.id = mandate_id
    WHERE p.id = poll_id AND m.profile_id = auth.uid()
      AND p.closed_at IS NULL AND (p.closes_at IS NULL OR p.closes_at > now())
  ));

-- Counts for everyone in the term (even when names are hidden).
CREATE OR REPLACE FUNCTION poll_results(p_poll_id UUID)
RETURNS TABLE (option_id UUID, answers INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, count(a.mandate_id)::int
  FROM poll_options o
  JOIN polls p ON p.id = o.poll_id
  LEFT JOIN poll_answers a ON a.option_id = o.id
  WHERE o.poll_id = p_poll_id AND user_in_term(p.term_id)
  GROUP BY o.id;
$$;

-- Replace my answer atomically (single choice keeps one option).
CREATE OR REPLACE FUNCTION poll_answer(p_poll_id UUID, p_mandate_id UUID, p_option_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_multi BOOLEAN;
BEGIN
  SELECT multi INTO v_multi FROM polls WHERE id = p_poll_id;
  IF v_multi IS NULL THEN RAISE EXCEPTION 'poll_not_found'; END IF;
  IF NOT v_multi AND coalesce(array_length(p_option_ids, 1), 0) > 1 THEN RAISE EXCEPTION 'single_choice'; END IF;
  DELETE FROM poll_answers WHERE poll_id = p_poll_id AND mandate_id = p_mandate_id;
  INSERT INTO poll_answers (poll_id, option_id, mandate_id)
  SELECT p_poll_id, x, p_mandate_id FROM unnest(p_option_ids) x
  WHERE EXISTS (SELECT 1 FROM poll_options o WHERE o.id = x AND o.poll_id = p_poll_id);
END;
$$;

REVOKE ALL ON FUNCTION poll_results(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION poll_results(UUID) TO authenticated;
REVOKE ALL ON FUNCTION poll_answer(UUID, UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION poll_answer(UUID, UUID, UUID[]) TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE poll_answers;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE polls;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 2. CALENDAR FEED TOKEN
-- ============================================================
-- Calendar apps fetch without cookies, so the feed URL carries a long random
-- token. Readable/rotatable by its owner only; resolved server-side.
CREATE TABLE IF NOT EXISTS calendar_tokens (
  profile_id  UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE calendar_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "calendar_token_own" ON calendar_tokens;
CREATE POLICY "calendar_token_own" ON calendar_tokens FOR ALL
  USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());

-- ============================================================
-- 3. PUSH: poll_opened
-- ============================================================
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
    SELECT v.session_id INTO v_session FROM votes v WHERE v.id = p_target_id AND v.status = 'open';
  ELSIF p_event = 'session_opened' THEN
    SELECT s.id INTO v_session FROM sessions s WHERE s.id = p_target_id AND s.status = 'in_progress';
  ELSIF p_event = 'poll_opened' THEN
    SELECT p.term_id INTO v_term FROM polls p WHERE p.id = p_target_id AND p.closed_at IS NULL;
    IF v_term IS NULL OR NOT user_can_manage_term(v_term) THEN RETURN; END IF;
  ELSE
    RAISE EXCEPTION 'unknown push event %', p_event;
  END IF;

  IF p_event <> 'poll_opened' THEN
    IF v_session IS NULL OR NOT user_can_manage_session(v_session) THEN RETURN; END IF;
    SELECT s.term_id INTO v_term FROM sessions s WHERE s.id = v_session;
  END IF;

  INSERT INTO push_events (event, target_id, sent_by)
  VALUES (p_event, p_target_id, auth.uid())
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  IF v_claimed = 0 THEN RETURN; END IF; -- already broadcast

  RETURN QUERY
  SELECT ps.endpoint, ps.p256dh, ps.auth
  FROM push_subscriptions ps
  JOIN mandates m ON m.profile_id = ps.profile_id
  WHERE m.term_id = v_term AND m.is_active = true AND ps.profile_id <> auth.uid();
END;
$$;
