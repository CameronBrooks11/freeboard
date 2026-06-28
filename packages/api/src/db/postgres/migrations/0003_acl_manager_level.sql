-- Add the 'manager' dashboard ACL level (edit + sharing management) alongside
-- 'viewer' and 'editor'. Replace the inline CHECK constraint from 0001.
ALTER TABLE dashboard_acl DROP CONSTRAINT IF EXISTS dashboard_acl_access_level_check;
ALTER TABLE dashboard_acl
  ADD CONSTRAINT dashboard_acl_access_level_check
  CHECK (access_level IN ('viewer', 'editor', 'manager'));
