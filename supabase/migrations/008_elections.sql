-- RadaStudentów24 — Migration 008: candidate elections (wybory)
-- An election is a vote where members pick a candidate instead of for/against.
-- v1 is anonymous (like secret motions): the choice is stored UNLINKED, dedupe
-- via secret_ballot_receipts, turnout via votes.secret_cast_count.

ALTER TABLE votes ADD COLUMN IF NOT EXISTS vote_kind TEXT NOT NULL DEFAULT 'motion'
  CHECK (vote_kind IN ('motion', 'election'));
ALTER TABLE votes ADD COLUMN IF NOT EXISTS seats INT NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS vote_candidates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vote_id    UUID NOT NULL REFERENCES votes(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  mandate_id UUID REFERENCES mandates(id) ON DELETE SET NULL,
  position   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vote_candidates_vote ON vote_candidates(vote_id, position);

CREATE TABLE IF NOT EXISTS election_ballots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vote_id      UUID NOT NULL REFERENCES votes(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES vote_candidates(id) ON DELETE CASCADE,
  cast_at      TIMESTAMPTZ  -- NULL: no timestamp so it cannot be correlated to a receipt
);
CREATE INDEX IF NOT EXISTS idx_election_ballots_vote ON election_ballots(vote_id, candidate_id);

ALTER TABLE vote_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE election_ballots ENABLE ROW LEVEL SECURITY;

-- Candidates: readable by org members; managed by the session manager.
DROP POLICY IF EXISTS "vote_candidate_read" ON vote_candidates;
CREATE POLICY "vote_candidate_read" ON vote_candidates FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM votes v JOIN sessions s ON s.id = v.session_id JOIN organs o ON o.id = s.organ_id
    WHERE v.id = vote_id AND user_has_org_access(o.org_id)
  ));

DROP POLICY IF EXISTS "vote_candidate_write" ON vote_candidates;
CREATE POLICY "vote_candidate_write" ON vote_candidates FOR ALL
  USING (EXISTS (SELECT 1 FROM votes v WHERE v.id = vote_id AND user_can_manage_session(v.session_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM votes v WHERE v.id = vote_id AND user_can_manage_session(v.session_id)));

-- Election ballots: NO direct inserts (RPC only); aggregate readable by org members
-- (unlinked, so anonymity holds).
DROP POLICY IF EXISTS "election_ballot_no_direct_insert" ON election_ballots;
CREATE POLICY "election_ballot_no_direct_insert" ON election_ballots FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS "election_ballot_read" ON election_ballots;
CREATE POLICY "election_ballot_read" ON election_ballots FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM votes v JOIN sessions s ON s.id = v.session_id JOIN organs o ON o.id = s.organ_id
    WHERE v.id = vote_id AND user_has_org_access(o.org_id)
  ));

-- Cast an anonymous election ballot.
CREATE OR REPLACE FUNCTION cast_election_ballot(p_vote_id UUID, p_mandate_id UUID, p_candidate_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind   TEXT;
  v_status TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM mandates m WHERE m.id = p_mandate_id AND m.profile_id = auth.uid() AND m.is_active = true
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT vote_kind, status INTO v_kind, v_status FROM votes WHERE id = p_vote_id;
  IF v_kind IS DISTINCT FROM 'election' THEN RAISE EXCEPTION 'not_election'; END IF;
  IF v_status IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'vote_not_open'; END IF;
  IF NOT EXISTS (SELECT 1 FROM vote_candidates c WHERE c.id = p_candidate_id AND c.vote_id = p_vote_id) THEN
    RAISE EXCEPTION 'bad_candidate';
  END IF;

  -- Dedupe (one vote per member) then store the unlinked choice + bump turnout.
  INSERT INTO secret_ballot_receipts (vote_id, mandate_id) VALUES (p_vote_id, p_mandate_id);
  INSERT INTO election_ballots (vote_id, candidate_id, cast_at) VALUES (p_vote_id, p_candidate_id, NULL);
  UPDATE votes SET secret_cast_count = secret_cast_count + 1 WHERE id = p_vote_id;
END;
$$;

-- Realtime for candidate list + turnout (guarded).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'vote_candidates') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE vote_candidates;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'election_ballots') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE election_ballots;
  END IF;
END $$;
