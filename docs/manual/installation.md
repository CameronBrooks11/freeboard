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

### Minimum production-safe values

```bash
# API runtime
FREEBOARD_RUNTIME_ENV=production
JWT_SECRET=replace-with-a-long-random-secret-at-least-32-chars

# Mongo for API
FREEBOARD_MONGO_URL=mongodb://freeboard_app:replace-with-strong-app-password@freeboard-mongo:27017/freeboard

# Mongo init credentials (docker-compose.mongo.yml)
MONGO_INITDB_ROOT_USERNAME=replace-root-user
MONGO_INITDB_ROOT_PASSWORD=replace-with-strong-root-password
MONGO_APP_USERNAME=freeboard_app
MONGO_APP_PASSWORD=replace-with-strong-app-password

# Proxy allowlist (required in production)
PROXY_ALLOWED_HOSTS=api.open-meteo.com,api.coingecko.com
```

### Optional local bootstrap admin

```bash
CREATE_ADMIN=true
ADMIN_EMAIL=admin@example.local
ADMIN_PASSWORD=ChangeMe123!
```

After first successful login, set `CREATE_ADMIN=false`.

## Local development

1. `cp .env.example .env`
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

Services:

- UI: `http://localhost:8080`
- API (via UI reverse proxy): `http://localhost:8080/graphql` (internal: `freeboard-api:4001`)
- Proxy (via UI reverse proxy): `http://localhost:8080/proxy` (internal: `freeboard-proxy:8001`)

## Security checks before go-live

- Keep `FREEBOARD_RUNTIME_ENV=production`
- Use strong `JWT_SECRET` (32+ chars)
- Keep `PROXY_ALLOW_INSECURE_TLS=false`
- Keep `PROXY_ALLOW_PRIVATE_DESTINATIONS=false`
- Set strict `PROXY_ALLOWED_HOSTS`
- Keep `CREATE_ADMIN=false` after bootstrap
- Use non-default Mongo credentials
