-- Revert to the original viewer/editor-only constraint. Fails if any 'manager'
-- rows exist (demote them first).
ALTER TABLE dashboard_acl DROP CONSTRAINT IF EXISTS dashboard_acl_access_level_check;
ALTER TABLE dashboard_acl
  ADD CONSTRAINT dashboard_acl_access_level_check
  CHECK (access_level IN ('viewer', 'editor'));
