# Secrets Operations Runbook

Use this as the primary operator runbook for secret setup, bootstrap, rotation, and incident response.

## Scope

This runbook covers:

- API auth/session signing secrets
- API <-> gateway shared trust secrets
- Credential profile encryption key lifecycle
- Admin bootstrap password handling
- Postgres credential variables used by Compose deployments

## Secret Inventory

| Variable                              | Used by             | Purpose                                                  | Production requirement                     |
| ------------------------------------- | ------------------- | -------------------------------------------------------- | ------------------------------------------ |
| `JWT_SECRET`                          | API                 | Signs user auth JWTs                                     | Required, strong value (>=32 chars)        |
| `JWT_GATEWAY_SECRET`                  | API + Gateway       | Signs/verifies datasource session tokens                 | Required, strong value (>=32 chars)        |
| `GATEWAY_SERVICE_TOKEN`               | API + Gateway       | Auth for gateway internal introspection/revocation calls | Required, strong value (>=32 chars)        |
| `CREDENTIAL_ENCRYPTION_KEY`           | API                 | Encrypts datasource credential profile secrets at rest   | Required, valid base64-encoded 32-byte key |
| `ADMIN_PASSWORD`                      | API bootstrap only  | One-time initial admin creation when `CREATE_ADMIN=true` | Bootstrap-only; disable after first login  |
| `FREEBOARD_POSTGRES_URL`              | API (containerized) | App DB connection string                                 | Required for containerized runtime         |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | Postgres container  | DB bootstrap account used for compose init               | Required for compose postgres init         |
| `POSTGRES_DB`                         | Postgres container  | Default database name                                    | Required for compose postgres init         |

## Env Precedence and Runtime Expectations

### API env precedence (implemented)

1. Existing process environment (shell/CI/orchestrator)
2. `packages/api/.env` (optional local override file)
3. Repo root `.env`
4. Code defaults

### Gateway env behavior

- Gateway reads process environment first.
- `dotenv/config` loads `.env` if present (without overwriting already-set process vars).
- Missing values fall back to gateway defaults (development defaults are intentionally insecure and must not be used in production).

### Docker Compose interpolation

- Shell-exported vars override `.env` file values.
- `.env` values are then used for `${VAR}` interpolation.
- Compose defaults (`${VAR:-default}`) are last fallback.
- Required vars (`${VAR:?error}`) fail fast at startup.

## Development vs Production Contract

Development:

- Local `.env` is acceptable.
- API/gateway may use development defaults.
- `CREATE_ADMIN=true` may be used for first local bootstrap only.

Production:

- Inject secrets from a managed secret store, not committed files.
- Keep `CREATE_ADMIN=false` after initial bootstrap.
- Use explicit strong values for `JWT_SECRET`, `JWT_GATEWAY_SECRET`, `GATEWAY_SERVICE_TOKEN`.
- Use valid base64 32-byte `CREDENTIAL_ENCRYPTION_KEY`.
- Use non-default Postgres credentials.

## Initial Setup and Bootstrap

1. Generate secrets:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))" # JWT_SECRET
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))" # JWT_GATEWAY_SECRET
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))" # GATEWAY_SERVICE_TOKEN
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"    # CREDENTIAL_ENCRYPTION_KEY
```

2. Set runtime env values (`.env` for local, managed secret store for production).
3. For first admin bootstrap only:
   - `CREATE_ADMIN=true`
   - set `ADMIN_EMAIL` + strong `ADMIN_PASSWORD`
4. Start stack and log in as admin.
5. Set `CREATE_ADMIN=false` and remove bootstrap `ADMIN_PASSWORD` from active runtime secret material.

## Rotation Playbooks

### `JWT_SECRET` (user auth JWT signing key)

1. Generate a new strong value.
2. Deploy API with new value.
3. Expect existing user sessions to become invalid (users re-authenticate).
4. Verify login, registration/invite flows, and password reset flows.

### `JWT_GATEWAY_SECRET` (datasource session token key)

1. Generate a new strong value.
2. Deploy API and gateway together with the same new value.
3. Expect active datasource sessions/realtime streams to reconnect/re-auth.
4. Verify HTTP datasource fetch and realtime subscriptions.

### `GATEWAY_SERVICE_TOKEN` (gateway service auth token)

1. Generate a new strong value.
2. Deploy API and gateway together with matching token.
3. Verify gateway introspection path (`/internal/gateway/datasource-introspect`) via normal datasource execution.

### `CREDENTIAL_ENCRYPTION_KEY` (credential profile at-rest key)

Follow the dedicated runbook:

- [Credential Key Rotation](/manual/credential-key-rotation)

This rotation requires running `npm run credentials:reencrypt` with old/new keys before switching runtime key.

### `ADMIN_PASSWORD` (bootstrap vs ongoing account maintenance)

- `ADMIN_PASSWORD` env var is for bootstrap (`CREATE_ADMIN=true`) only.
- Ongoing password changes should use the normal reset flows:
  - user self-service "Forgot Password"
  - admin-issued reset tokens from Admin Console for managed accounts

### Postgres Credentials (`FREEBOARD_POSTGRES_URL`, `POSTGRES_*`)

For compose-backed Postgres:

1. Create/update DB credentials in a maintenance window.
2. Update `FREEBOARD_POSTGRES_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` in secret store.
3. Restart API and rerun schema status checks (`npm run db:schema:status`) against the updated connection.

Credential rotation should be validated with API login and datasource execution checks before closing the change.

## Secret Storage Patterns (Optional Production Patterns)

Use the pattern that fits your deployment model. Local `.env` remains valid for development.

### Docker Secrets Pattern

If you store secrets as files under `/run/secrets/*`, map them to env vars before service start (wrapper command pattern):

```yaml
services:
  freeboard-api:
    secrets:
      - jwt_secret
      - jwt_gateway_secret
      - gateway_service_token
      - credential_encryption_key
    entrypoint: ["/bin/sh", "-ec"]
    command: >
      export JWT_SECRET="$(cat /run/secrets/jwt_secret)";
      export JWT_GATEWAY_SECRET="$(cat /run/secrets/jwt_gateway_secret)";
      export GATEWAY_SERVICE_TOKEN="$(cat /run/secrets/gateway_service_token)";
      export CREDENTIAL_ENCRYPTION_KEY="$(cat /run/secrets/credential_encryption_key)";
      exec node packages/api/dist/index.js
secrets:
  jwt_secret:
    file: ./secrets/jwt_secret.txt
```

Apply the same pattern for gateway service secrets (`JWT_GATEWAY_SECRET`, `GATEWAY_SERVICE_TOKEN`).

### Kubernetes Secrets Pattern

Inject secrets as environment variables from `Secret` objects:

```yaml
env:
  - name: JWT_SECRET
    valueFrom:
      secretKeyRef:
        name: freeboard-secrets
        key: jwt_secret
  - name: JWT_GATEWAY_SECRET
    valueFrom:
      secretKeyRef:
        name: freeboard-secrets
        key: jwt_gateway_secret
```

### Ansible Vault Pattern

- Keep secret values in encrypted `group_vars`/`host_vars` (`ansible-vault encrypt`).
- Render runtime `.env` from templates with strict file permissions (`0600`).
- Never commit decrypted vault output.

### CI Secret Injection Pattern

GitHub Actions:

```yaml
env:
  JWT_SECRET: ${{ secrets.JWT_SECRET }}
  JWT_GATEWAY_SECRET: ${{ secrets.JWT_GATEWAY_SECRET }}
  GATEWAY_SERVICE_TOKEN: ${{ secrets.GATEWAY_SERVICE_TOKEN }}
```

GitLab CI:

```yaml
variables:
  JWT_SECRET: "$PROD_JWT_SECRET"
  JWT_GATEWAY_SECRET: "$PROD_JWT_GATEWAY_SECRET"
  GATEWAY_SERVICE_TOKEN: "$PROD_GATEWAY_SERVICE_TOKEN"
```

Use masked/protected CI variables and avoid logging secret values.

## Incident Response (Secret Exposure or Suspected Leak)

1. Identify exposed secret class and impacted boundary (user auth, gateway trust, db creds, encryption key).
2. Contain quickly:
   - disable external routes/ingress for impacted surfaces.
   - move impacted dashboards to `private` visibility via admin/API controls.
3. Rotate compromised secrets using the playbooks above.
4. Verify authentication, datasource fetch, realtime flows, and admin access paths.
5. Record rotation timestamp + scope in your operations log.

## Cross-References

- [Installation](/manual/installation)
- [Datasource Gateway](/manual/gateway)
- [Realtime Operations Runbook](/manual/realtime-operations)
- [Credential Key Rotation](/manual/credential-key-rotation)
