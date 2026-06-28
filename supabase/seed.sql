-- RadaStudentów24 — Seed (RUSS UEW pilot)
-- Run AFTER migrations 001 and 002. Idempotent.
-- >>> Set the bootstrap admin email below before running. <<<
--
-- Bootstrap admin (gets an 'admin' invitation -> becomes admin on first login):
--   mikolaj.radlinski.53@gmail.com

INSERT INTO organizations (id, name, slug, accent_color, enabled_modules) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Samorząd Studentów UEW', 'uew',
   '#4f46e5', ARRAY['sessions','resolutions','audit'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO organs (id, org_id, name, short_name, total_seats, quorum_type, resolution_prefix, resolution_pattern) VALUES
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   'Rada Uczelniana Samorządu Studentów', 'RUSS', 16, 'majority',
   'Uchwała', '{nr}/{kadencja}/{organ}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO terms (id, organ_id, label, starts_at, ends_at, is_active) VALUES
  ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222',
   '2025-2026', '2025-09-01', '2026-08-31', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO invitations (term_id, email, role, label) VALUES
  ('33333333-3333-3333-3333-333333333333', 'mikolaj.radlinski.53@gmail.com', 'admin', 'Administrator instancji')
ON CONFLICT (term_id, email) DO UPDATE SET role = EXCLUDED.role;
