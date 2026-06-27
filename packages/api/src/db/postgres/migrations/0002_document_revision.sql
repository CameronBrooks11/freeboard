-- Optimistic-concurrency revision for the dashboard document. Bumped only when
-- the document changes (not on visibility/share-token/ACL edits). Existing rows
-- start at 1 via the default.
ALTER TABLE dashboards
  ADD COLUMN IF NOT EXISTS document_revision INTEGER NOT NULL DEFAULT 1
    CHECK (document_revision >= 1);
