# Installation

## Requirements

- Node.js 24.x (LTS)
- npm 11+
- Docker Engine >= 20.10
- Docker Compose v2 (`docker compose`)
- Git
- Optional: Python 3.8+ and Ansible for kiosk appliance setup

## Get the code

```bash
git clone https://github.com/CameronBrooks11/freeboard.git
cd freeboard
git checkout main
# Optional: align to repo Node baseline via .nvmrc
nvm use || nvm install
npm install
```

## Environment setup

Copy `.env.example` to `.env` and set real secrets.

For quick local development bootstrap, copy `.env.dev` to `.env` first.

### Minimum production-safe values

```bash
# API runtime
FREEBOARD_RUNTIME_ENV=production
JWT_SECRET=replace-with-a-long-random-secret-at-least-32-chars
JWT_GATEWAY_SECRET=replace-with-a-long-random-gateway-secret-at-least-32-chars
GATEWAY_SERVICE_TOKEN=replace-with-a-long-random-gateway-service-token-at-least-32-chars
CREDENTIAL_ENCRYPTION_KEY=replace-with-base64-32-byte-key

# Optional runtime image tag pinning (default is latest)
FREEBOARD_UI_IMAGE_TAG=latest
FREEBOARD_API_IMAGE_TAG=latest
FREEBOARD_GATEWAY_IMAGE_TAG=latest

# Mongo for API
FREEBOARD_MONGO_URL=mongodb://freeboard_app:replace-with-strong-app-password@freeboard-mongo:27017/freeboard

# Mongo init credentials (docker-compose.mongo.yml)
MONGO_INITDB_ROOT_USERNAME=replace-root-user
MONGO_INITDB_ROOT_PASSWORD=replace-with-strong-root-password
MONGO_APP_USERNAME=freeboard_app
MONGO_APP_PASSWORD=replace-with-strong-app-password

# Gateway egress allowlist (required in non-development runtime)
EGRESS_ALLOWED_HOSTS=api.open-meteo.com,api.coingecko.com
```

Secret storage/rotation patterns and incident response are documented in:

- [Secrets Operations Runbook](/manual/secrets-operations)

### Optional local bootstrap admin

```bash
CREATE_ADMIN=true
ADMIN_EMAIL=admin@example.local
ADMIN_PASSWORD=ChangeMe123!
```

After first successful login, set `CREATE_ADMIN=false`.

## Local development

1. `cp .env.dev .env`
2. Set bootstrap credentials if needed (`CREATE_ADMIN=true`)
3. Run `npm run dev`
4. Login once and disable bootstrap (`CREATE_ADMIN=false`)

API env precedence:

1. Process environment (shell/CI)
2. `packages/api/.env` (optional local override)
3. Repo root `.env`
4. API defaults

## Run with Docker Compose

```bash
docker compose -f docker-compose.yml -f docker-compose.mongo.yml up -d
```

Pinning examples:

```bash
# release pin
FREEBOARD_UI_IMAGE_TAG=v0.1.0
FREEBOARD_API_IMAGE_TAG=v0.1.0
FREEBOARD_GATEWAY_IMAGE_TAG=v0.1.0

# immutable build pin
FREEBOARD_UI_IMAGE_TAG=sha-abc1234
FREEBOARD_API_IMAGE_TAG=sha-abc1234
FREEBOARD_GATEWAY_IMAGE_TAG=sha-abc1234
```

Rollback is tag-based: switch to the prior known-good `v*` or `sha-*` tags and redeploy.

Services:

- UI: `http://localhost:8080`
- API (via UI reverse proxy): `http://localhost:8080/graphql` (internal: `freeboard-api:4001`)
- Gateway (via UI reverse proxy): `http://localhost:8080/gateway/http/fetch` (internal: `freeboard-gateway:8001`)

## Security checks before go-live

- Keep `FREEBOARD_RUNTIME_ENV=production`
- Use strong `JWT_SECRET` (32+ chars)
- Use strong `JWT_GATEWAY_SECRET` and `GATEWAY_SERVICE_TOKEN`
- Set valid `CREDENTIAL_ENCRYPTION_KEY` (base64 32-byte key)
- Keep `EGRESS_ALLOW_INSECURE_TLS=false`
- Keep `EGRESS_ALLOW_PRIVATE_DESTINATIONS=false`
- Set strict `EGRESS_ALLOWED_HOSTS`
- Set `API_TRUST_PROXY_HOPS` and `REALTIME_TRUST_PROXY_HOPS` correctly for your reverse-proxy topology
- Keep `SECURITY_LIMITER_BACKEND=mongo` and `SECURITY_LIMITER_FAILURE_MODE=fail-closed` in non-dev runtime
- Keep `REALTIME_LIMITER_FAILURE_MODE=fail-closed` unless degraded-mode fail-open is intentionally approved
- Keep `CREATE_ADMIN=false` after bootstrap
- Use non-default Mongo credentials
- Follow [Secrets Operations Runbook](/manual/secrets-operations) for setup/rotation/incident workflow

## Security Rollout Runbook

For security-control changes (proxy trust headers/hops, limiter backend/failure-mode policy, gateway realtime limiter behavior), use:

- [Security Controls Rollout Runbook](/manual/security-controls-rollout)

This runbook defines staged deploy order (`proxy -> API -> gateway`), canary watch metrics, and rollback steps.
