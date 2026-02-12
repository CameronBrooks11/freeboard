# freeboard

This Freeboard is a fork of [Jim Heising's damn-sexy dashboard app](https://github.com/Freeboard/freeboard) with super-powers:

- Persistent storage of dashboards in a **MongoDB**
- **GraphQL** API backend
- Distributable through **docker compose**
- Modern **Vue.js** v3 frontend
- Extendable **HTTP-Proxy** to bypass CORS
- Built-in widget set: **Base, Text, Indicator, Gauge, Pointer, Picture, HTML, Sparkline, Map**
- **Monorepo** through `npm` workspaces
- **Commit-Hooks** with `pre-commit`
- **CSS-Variables** for all colors

> [Try Out](https://CameronBrooks11.github.io/freeboard)

![Freeboard dashboard screenshot](freeboard.png)

## Requirements

- Node.js: v24.x (LTS)
- npm: v11+
- Docker Engine: ≥ 20.10
- Docker Compose: v2 (`docker compose` CLI)
- Python: 3.8+ (for Raspberry Pi Ansible playbook)
- Ansible: latest `via pip install ansible`

## Installation

```bash
git clone git@github.com:CameronBrooks11/freeboard.git
cd freeboard
git checkout main
# Optional: align to repo Node baseline via .nvmrc
nvm use || nvm install
npm install
```

## Usage

**Login:** Use the credentials configured in `.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`).
For local bootstrap, set `CREATE_ADMIN=true` once, then log in with those values.
`CREATE_ADMIN=true` now validates credentials strictly:
- `ADMIN_EMAIL` must be `name@domain.ext`
- `ADMIN_PASSWORD` must be at least 12 chars and include uppercase, lowercase, number, and symbol
The same email/password policy is enforced for `registerUser`.

### Docker-Compose

```bash
docker compose -f docker-compose.yml -f docker-compose.mongo.yml up -d
```

For containerized production mode, set these in `.env` first:
- `JWT_SECRET` (API required)
- `PROXY_ALLOWED_HOSTS` (Proxy required allowlist)
- `FREEBOARD_MONGO_URL` (API required Mongo connection string)
- `MONGO_INITDB_ROOT_USERNAME` / `MONGO_INITDB_ROOT_PASSWORD` (Mongo bootstrap)
- `MONGO_APP_USERNAME` / `MONGO_APP_PASSWORD` (application DB account)

### Development

```bash
npm run dev
```

`npm run dev` now:

- Starts Mongo in Docker and waits for healthy status.
- Starts UI/API/Proxy (without coupling Mongo log streaming into the process group).
- On Ctrl+C, stops UI/API/Proxy and keeps Mongo running.

API env loading order is deterministic:
1. existing process env (shell/CI)
2. `packages/api/.env` (optional override file)
3. repo root `.env`
4. code defaults

Useful Mongo dev commands:

```bash
npm run dev:mongo:up
npm run dev:mongo:status
npm run dev:mongo:logs
npm run dev:mongo:down
npm run dev:mongo:reset
```

Recommended local loop:

1. `npm run dev` (or `npm run dev:mongo:up` + `npm run dev:services`)
2. use `npm run dev:mongo:logs` only when troubleshooting Mongo
3. use `npm run dev:mongo:reset` only when a clean DB is needed

### Local Quality Checks

```bash
npm run lint
npm run test
npm run build:verify
```

### CI Workflows

- `CI` (`.github/workflows/ci.yml`)
  - Trigger: pull requests to `main` (and merge queue/manual dispatch).
  - Path-aware: docs-only changes skip heavy lint/test/build jobs.
  - Required check job: `Required CI` (stable branch-protection target).
- `Deploy to GitHub Pages` (`.github/workflows/build-pages.yml`)
  - Trigger: push to `main` for docs/demo-relevant paths only.
  - Uses concurrency cancellation by branch/ref.
- `Build & publish docker images` (`.github/workflows/build-docker-images.yml`)
  - Trigger: push to `main` and manual dispatch.
  - Matrix builds skip unchanged packages.
  - Concurrency auto-cancel is intentionally disabled to avoid missing publishes during rapid sequential pushes.

## RaspberryPi

```bash
python -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/ansible-playbook ansible/playbook.yml --become
```

## Acknowledgement

Continues the work of [artificialhoney/freeboard](https://github.com/artificialhoney/freeboard) which is an archived prototype branch derived from the once-popular but long-unmaintained [Freeboard/freeboard](https://github.com/Freeboard/freeboard).

## Copyright

Copyright © 2013 Jim Heising ([github.com/jheising](https://github.com/jheising))

Copyright © 2013 Bug Labs, Inc. ([buglabs.net](https://buglabs.net))

Copyright © 2024 Sebastian Krüger ([sk.honeymachine.io](https://sk.honeymachine.io))

Copyright © 2026 Cameron K. Brooks ([github.com/CameronBrooks11](https://github.com/CameronBrooks11))

Licensed under the [MIT License](/LICENSE)
