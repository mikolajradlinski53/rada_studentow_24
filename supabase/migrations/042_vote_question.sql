-- RadaStudentów24 — Migration 042: the question put to the vote
--
-- An agenda item can carry the exact question members answer, e.g.
-- "Czy jesteś za zaakceptowaniem Zofii Palus na członka Prezydium FUE?".
-- It is copied onto the vote when it opens, so the ballot, the projector and
-- the protocol show what was actually asked even if the agenda changes later.

ALTER TABLE agenda_items ADD COLUMN IF NOT EXISTS vote_question TEXT;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS question TEXT;
