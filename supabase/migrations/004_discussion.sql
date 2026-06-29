-- RadaStudentów24 — Migration 004: discussion / speaker queue + procedural motions

-- Break state lives on the session (one active break at a time).
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS on_break_until TIMESTAMPTZ;

-- Floor requests: zabranie głosu / ad vocem / wniosek formalny (proceduralny).
CREATE TABLE IF NOT EXISTS floor_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  mandate_id  UUID NOT NULL REFERENCES mandates(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('speak', 'ad_vocem', 'formal')),
  formal_type TEXT CHECK (formal_type IN ('break', 'extend_time', 'close_list', 'reconsider', 'other')),
  minutes     INT,
  note        TEXT,
  status      TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'speaking', 'done', 'withdrawn', 'rejected')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  called_at   TIMESTAMPTZ,
  ended_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_floor_requests_session ON floor_requests(session_id, status);

ALTER TABLE floor_requests ENABLE ROW LEVEL SECURITY;

-- Read: any org member of the session.
DROP POLICY IF EXISTS "floor_read" ON floor_requests;
CREATE POLICY "floor_read" ON floor_requests FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM sessions s JOIN organs o ON o.id = s.organ_id
    WHERE s.id = session_id AND user_has_org_access(o.org_id)
  ));

-- Insert: a member may only request on their own mandate.
DROP POLICY IF EXISTS "floor_insert" ON floor_requests;
CREATE POLICY "floor_insert" ON floor_requests FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM mandates m
    WHERE m.id = mandate_id AND m.profile_id = auth.uid() AND m.is_active = true
  ));

-- Update: the requester (e.g. withdraw) OR the session manager (call/end/reject).
DROP POLICY IF EXISTS "floor_update" ON floor_requests;
CREATE POLICY "floor_update" ON floor_requests FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM mandates m WHERE m.id = mandate_id AND m.profile_id = auth.uid())
    OR user_can_manage_session(session_id)
  );

-- Realtime for the queue and for session break/status changes (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'floor_requests') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE floor_requests;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sessions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
  END IF;
END $$;
