CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'editor', 'admin')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  session_version INTEGER NOT NULL DEFAULT 0 CHECK (session_version >= 0),
  registration_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dashboards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'link', 'public')),
  share_token TEXT NOT NULL UNIQUE,
  share_token_version INTEGER NOT NULL DEFAULT 0 CHECK (share_token_version >= 0),
  image TEXT,
  datasources JSONB,
  columns INTEGER,
  width TEXT DEFAULT 'md',
  panes JSONB,
  settings JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dashboards_owner_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS dashboards_user_id_idx ON dashboards (user_id);
CREATE INDEX IF NOT EXISTS dashboards_visibility_idx ON dashboards (visibility);

CREATE TABLE IF NOT EXISTS dashboard_acl (
  dashboard_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  access_level TEXT NOT NULL CHECK (access_level IN ('viewer', 'editor')),
  granted_by TEXT,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (dashboard_id, user_id),
  CONSTRAINT dashboard_acl_dashboard_fk FOREIGN KEY (dashboard_id) REFERENCES dashboards (id) ON DELETE CASCADE,
  CONSTRAINT dashboard_acl_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS dashboard_acl_user_id_idx ON dashboard_acl (user_id);

CREATE TABLE IF NOT EXISTS credential_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'none' CHECK (type IN ('none', 'header', 'bearer', 'basic')),
  allow_public_use BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  secret JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS broker_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  protocol TEXT NOT NULL DEFAULT 'mqtt' CHECK (protocol IN ('mqtt')),
  broker_url TEXT NOT NULL,
  tls JSONB NOT NULL DEFAULT '{}'::jsonb,
  credential_profile_id TEXT,
  allow_public_use BOOLEAN NOT NULL DEFAULT FALSE,
  topic_allowlist JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT broker_profiles_credential_profile_fk FOREIGN KEY (credential_profile_id)
    REFERENCES credential_profiles (id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS broker_profiles_protocol_broker_url_idx ON broker_profiles (protocol, broker_url);

CREATE TABLE IF NOT EXISTS service_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  scopes TEXT[] NOT NULL DEFAULT '{}'::text[] CHECK (
    scopes <@ ARRAY['datasource:mint', 'datasource:diagnostics:read', 'ops:read']::text[]
  ),
  created_by_user_id TEXT,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT service_accounts_created_by_fk FOREIGN KEY (created_by_user_id)
    REFERENCES users (id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS service_account_tokens (
  id TEXT PRIMARY KEY,
  service_account_id TEXT NOT NULL,
  label TEXT,
  scopes TEXT[] NOT NULL DEFAULT '{}'::text[] CHECK (
    scopes <@ ARRAY['datasource:mint', 'datasource:diagnostics:read', 'ops:read']::text[]
  ),
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by_user_id TEXT,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT service_account_tokens_account_fk FOREIGN KEY (service_account_id)
    REFERENCES service_accounts (id)
    ON DELETE CASCADE,
  CONSTRAINT service_account_tokens_created_by_fk FOREIGN KEY (created_by_user_id)
    REFERENCES users (id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS service_account_tokens_lookup_idx
  ON service_account_tokens (service_account_id, revoked_at, expires_at);

CREATE TABLE IF NOT EXISTS invite_tokens (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
  token_hash TEXT NOT NULL UNIQUE,
  created_by TEXT,
  revoked_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  accepted_user_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invite_tokens_created_by_fk FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT invite_tokens_accepted_user_fk FOREIGN KEY (accepted_user_id)
    REFERENCES users (id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS invite_tokens_email_idx ON invite_tokens (email);
CREATE INDEX IF NOT EXISTS invite_tokens_expires_at_idx ON invite_tokens (expires_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_by TEXT,
  requested_by_email TEXT,
  revoked_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT password_reset_tokens_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT password_reset_tokens_created_by_fk FOREIGN KEY (created_by)
    REFERENCES users (id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx ON password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_at_idx ON password_reset_tokens (expires_at);

CREATE TABLE IF NOT EXISTS policy_kv (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT policy_kv_updated_by_fk FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT audit_events_actor_fk FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS audit_events_created_at_idx ON audit_events (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS audit_events_action_idx ON audit_events (action);

CREATE TABLE IF NOT EXISTS security_limiter_state (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('counter', 'lock')),
  count BIGINT NOT NULL DEFAULT 0 CHECK (count >= 0),
  lock_until TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS security_limiter_state_kind_idx ON security_limiter_state (kind);
CREATE INDEX IF NOT EXISTS security_limiter_state_expires_at_idx ON security_limiter_state (expires_at);

CREATE TABLE IF NOT EXISTS share_token_revocation_events (
  id BIGSERIAL PRIMARY KEY,
  dashboard_id TEXT NOT NULL,
  share_token_version INTEGER NOT NULL CHECK (share_token_version >= 0),
  revoked_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT share_token_revocation_events_dashboard_fk FOREIGN KEY (dashboard_id)
    REFERENCES dashboards (id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS share_token_revocation_events_dashboard_id_idx
  ON share_token_revocation_events (dashboard_id);
CREATE INDEX IF NOT EXISTS share_token_revocation_events_revoked_at_id_idx
  ON share_token_revocation_events (revoked_at, id);
CREATE INDEX IF NOT EXISTS share_token_revocation_events_created_at_id_idx
  ON share_token_revocation_events (created_at, id);
