-- RadaStudentów24 — Migration 013: bilingual resolutions (PL + EN)
-- Optional English version of a resolution's title / legal basis / body, so the
-- document can be produced in both languages.

ALTER TABLE resolutions
  ADD COLUMN IF NOT EXISTS title_en       TEXT,
  ADD COLUMN IF NOT EXISTS legal_basis_en TEXT,
  ADD COLUMN IF NOT EXISTS body_en        TEXT;
