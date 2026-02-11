# Installation

## Requirements

- Node.js 18.x (LTS)
- npm 8+
- Docker Engine ≥ 20.10
- Docker Compose v2 (`docker compose`)
- Git
- (Optional) Python 3.8+ and Ansible for Raspberry Pi deployment

## Get the code

```bash
git clone https://github.com/CameronBrooks11/freeboard.git
cd freeboard
git checkout dev
npm install
```

## Environment

Create a .env in the repo root (adjust if your compose uses different names):

```bash
# Mongo
FREEBOARD_MONGO_IMAGE=mongo:7
FREEBOARD_MONGO_URL=mongodb://freeboard:unsecure@freeboard-mongo:27017/freeboard
MONGO_URL=mongodb://freeboard:unsecure@127.0.0.1:27017/freeboard

# Container runtime mode
FREEBOARD_RUNTIME_ENV=production

# API auth (required outside local dev)
JWT_SECRET=replace-with-a-long-random-secret-at-least-32-chars

# Proxy destination allowlist (required for containerized production mode)
PROXY_ALLOWED_HOSTS=api.open-meteo.com,api.coingecko.com

# Optional local one-time admin bootstrap
ADMIN_EMAIL=admin@example.local
ADMIN_PASSWORD=ChangeMe123!
CREATE_ADMIN=true
```

## Local Dev Fast Path

1. Copy `.env.example` to `.env`.
2. Set bootstrap credentials for first login:
   - `ADMIN_EMAIL` in `name@domain.ext` format
   - `ADMIN_PASSWORD` with 12+ chars including uppercase, lowercase, number, symbol
   - `CREATE_ADMIN=true`
3. Run `npm run dev`.
4. Log in once, then set `CREATE_ADMIN=false`.

API env resolution order:

1. process env (shell/CI)
2. `packages/api/.env` (optional package-local override)
3. repo root `.env`
4. API defaults

When `CREATE_ADMIN=true`, API startup validates:

- `ADMIN_EMAIL` format must be `name@domain.ext`
- `ADMIN_PASSWORD` must be at least 12 chars and include uppercase, lowercase, number, and symbol

Containerized deployment is now fail-fast:

- API container will not start without `JWT_SECRET`.
- Proxy container will not start without `PROXY_ALLOWED_HOSTS`.

## Deployment Security Checklist

- `FREEBOARD_RUNTIME_ENV=production`
- strong `JWT_SECRET` (32+ chars)
- strict `PROXY_ALLOWED_HOSTS` allowlist
- keep `PROXY_ALLOW_INSECURE_TLS=false`
- keep `PROXY_ALLOW_PRIVATE_DESTINATIONS=false`
- keep `CREATE_ADMIN=false` after bootstrap

## Run (Docker)

```bash
docker compose -f docker-compose.yml -f docker-compose.mongo.yml up -d
```

This starts the MongoDB service and the packages (API, Proxy, UI).

## Run (Dev)

```bash
npm run dev
```

This starts Docker MongoDB service and the workspaces (API, Proxy, UI).
