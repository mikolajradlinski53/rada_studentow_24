-- RadaStudentów24 — Migration 041: realtime via Broadcast from the database
--
-- postgres_changes made the database re-check RLS for EVERY subscriber on EVERY
-- change (realtime.list_changes was ~40% of all DB time; it choked the DB at a
-- sitting with ~20 phones). Now triggers send ONE message per change to a
-- private topic; access is checked when a client joins the topic.
--
-- Topics (all private):
--   session:<session_id>   live sitting (votes, attendance, agenda, queue, sitting, candidates)
--   organ:<organ_id>       sittings of an organ (the "Na żywo" pill)
--   comments:<item_id>     agenda item questions
--   poll:<poll_id>         poll answers
--   rsvp:<session_id>      "będę / nie będę"
-- Payloads carry only rows every org member may read anyway (votes, agenda
-- items); everything else is just a "changed" signal and the client refetches
-- through RLS.

-- Who may receive a topic.
CREATE OR REPLACE FUNCTION can_receive_topic(p_topic TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_kind TEXT; v_id UUID;
BEGIN
  IF p_topic !~ '^(session|organ|comments|poll|rsvp):[0-9a-f-]{36}$' THEN RETURN FALSE; END IF;
  v_kind := split_part(p_topic, ':', 1);
  v_id := split_part(p_topic, ':', 2)::uuid;
  IF v_kind IN ('session', 'rsvp') THEN
    RETURN EXISTS (SELECT 1 FROM sessions s JOIN organs o ON o.id = s.organ_id WHERE s.id = v_id AND user_has_org_access(o.org_id));
  ELSIF v_kind = 'organ' THEN
    RETURN EXISTS (SELECT 1 FROM organs o WHERE o.id = v_id AND user_has_org_access(o.org_id));
  ELSIF v_kind = 'comments' THEN
    RETURN EXISTS (SELECT 1 FROM agenda_items a JOIN sessions s ON s.id = a.session_id JOIN organs o ON o.id = s.organ_id
                   WHERE a.id = v_id AND user_has_org_access(o.org_id));
  ELSIF v_kind = 'poll' THEN
    RETURN EXISTS (SELECT 1 FROM polls p WHERE p.id = v_id AND user_in_term(p.term_id));
  END IF;
  RETURN FALSE;
END;
$$;
REVOKE ALL ON FUNCTION can_receive_topic(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION can_receive_topic(TEXT) TO authenticated;

DROP POLICY IF EXISTS "rada24_receive_broadcast" ON realtime.messages;
CREATE POLICY "rada24_receive_broadcast" ON realtime.messages FOR SELECT TO authenticated
  USING (realtime.messages.extension = 'broadcast' AND public.can_receive_topic(realtime.topic()));

-- One sender for all tables.
CREATE OR REPLACE FUNCTION broadcast_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r RECORD; v_sid UUID; v_payload JSONB;
BEGIN
  r := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  v_payload := jsonb_build_object('table', TG_TABLE_NAME, 'op', TG_OP);

  IF TG_TABLE_NAME = 'votes' THEN
    PERFORM realtime.send(v_payload || jsonb_build_object('row', to_jsonb(r)), 'vote', 'session:' || r.session_id, true);
  ELSIF TG_TABLE_NAME = 'agenda_items' THEN
    PERFORM realtime.send(v_payload || jsonb_build_object('row', to_jsonb(r)), 'agenda_item', 'session:' || r.session_id, true);
  ELSIF TG_TABLE_NAME IN ('attendance', 'floor_requests') THEN
    PERFORM realtime.send(v_payload, 'changed', 'session:' || r.session_id, true);
  ELSIF TG_TABLE_NAME = 'sessions' THEN
    PERFORM realtime.send(v_payload, 'changed', 'session:' || r.id, true);
    PERFORM realtime.send(v_payload, 'changed', 'organ:' || r.organ_id, true);
  ELSIF TG_TABLE_NAME = 'vote_candidates' THEN
    SELECT session_id INTO v_sid FROM votes WHERE id = r.vote_id;
    IF v_sid IS NOT NULL THEN PERFORM realtime.send(v_payload, 'changed', 'session:' || v_sid, true); END IF;
  ELSIF TG_TABLE_NAME = 'agenda_comments' THEN
    PERFORM realtime.send(v_payload, 'changed', 'comments:' || r.agenda_item_id, true);
  ELSIF TG_TABLE_NAME = 'poll_answers' THEN
    PERFORM realtime.send(v_payload, 'changed', 'poll:' || r.poll_id, true);
  ELSIF TG_TABLE_NAME = 'session_rsvps' THEN
    PERFORM realtime.send(v_payload, 'changed', 'rsvp:' || r.session_id, true);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- A realtime hiccup must never fail the user's write (a ballot, a check-in).
  RAISE WARNING 'broadcast_change(%): %', TG_TABLE_NAME, SQLERRM;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION broadcast_change() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['votes','agenda_items','attendance','floor_requests','sessions','vote_candidates','agenda_comments','poll_answers','session_rsvps'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_broadcast', t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION broadcast_change()', t || '_broadcast', t);
  END LOOP;
END $$;
