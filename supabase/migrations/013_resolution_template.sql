-- RadaStudentów24 — Migration 013: per-org uchwała template
-- Each institution formats resolutions its own way — header/footer text and font
-- are set by the chair/admin and applied to the printed + public document.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS resolution_header TEXT,
  ADD COLUMN IF NOT EXISTS resolution_footer TEXT,
  ADD COLUMN IF NOT EXISTS resolution_font TEXT NOT NULL DEFAULT 'serif'
    CHECK (resolution_font IN ('serif', 'sans'));
