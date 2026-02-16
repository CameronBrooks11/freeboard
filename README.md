# freeboard

This Freeboard is a fork of [Jim Heising's damn-sexy dashboard app](https://github.com/Freeboard/freeboard) with super-powers:

- Persistent storage of dashboards in a **MongoDB**
- **GraphQL** API backend
- Distributable through **docker compose**
- Modern **Vue.js** v3 frontend
- Gateway-backed **HTTP datasource runtime** with egress controls
- Gateway-backed realtime datasource runtime (**SSE**, **WebSocket**, **MQTT**)
- Built-in widget set: **Base, Text, Indicator, Gauge, Pointer, Picture, HTML, Sparkline, Table, Bar Chart, Status List, Map**
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
# quick local dev env
cp .env.dev .env
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
- `JWT_GATEWAY_SECRET` (API+gateway shared datasource-session signing key)
- `GATEWAY_SERVICE_TOKEN` (gateway -> API introspection auth token)
- `CREDENTIAL_ENCRYPTION_KEY` (API credential-profile encryption key)
- `EGRESS_ALLOWED_HOSTS` (gateway required allowlist)
- `FREEBOARD_MONGO_URL` (API required Mongo connection string)
- `MONGO_INITDB_ROOT_USERNAME` / `MONGO_INITDB_ROOT_PASSWORD` (Mongo bootstrap)
- `MONGO_APP_USERNAME` / `MONGO_APP_PASSWORD` (application DB account)
- `FREEBOARD_UI_IMAGE_TAG` / `FREEBOARD_API_IMAGE_TAG` / `FREEBOARD_GATEWAY_IMAGE_TAG` (optional service image pinning, default `latest`)

For secret setup/rotation/incident workflow, follow `docs/manual/secrets-operations.md`.

Version tags published by CI:

- `latest`
- `v<workspace-version>` (for example `v0.1.0`)
- `sha-<short-commit>` (immutable build pin)

Example pin + rollback flow:

```bash
# pin all services to a release tag
FREEBOARD_UI_IMAGE_TAG=v0.1.0
FREEBOARD_API_IMAGE_TAG=v0.1.0
FREEBOARD_GATEWAY_IMAGE_TAG=v0.1.0

docker compose -f docker-compose.yml -f docker-compose.mongo.yml up -d

# rollback by changing tags to a previous known-good release
```

### Development

```bash
# if needed (first setup on a machine)
cp .env.dev .env

npm run dev
```

`npm run dev` now:

- Starts Mongo in Docker and waits for healthy status.
- Starts UI/API/Gateway (without coupling Mongo log streaming into the process group).
- On Ctrl+C, stops UI/API/Gateway and keeps Mongo running.

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
npm run format:check
npm run lint
npm run check:ui:store-boundaries
npm run test
npm run build:verify
```

To apply formatting automatically:

```bash
npm run format
```

### Realtime Demo Fixtures

```bash
npm run demo:realtime:up
npm run demo:realtime:smoke
npm run demo:realtime:down
```

One-shot integration run:

```bash
npm run test:realtime:integration
```

Related docs:

- Datasource configuration: `docs/manual/datasource-reference.md`
- Gateway contract/policy: `docs/manual/gateway.md`
- Realtime operator runbook: `docs/manual/realtime-operations.md`
- Secrets operations runbook: `docs/manual/secrets-operations.md`

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
- `Ansible quality` (`.github/workflows/ansible-quality.yml`)
  - Trigger: PRs touching kiosk automation paths, merge queue, and manual dispatch.
  - Runs `ansible-lint` and playbook syntax checks for kiosk provisioning and rollback.

## RaspberryPi

```bash
python -m venv .venv
.venv/bin/pip install -r requirements.txt
cp ansible/inventory.ini.example ansible/inventory.ini
ANSIBLE_CONFIG=ansible/ansible.cfg .venv/bin/ansible-playbook -i ansible/inventory.ini ansible/playbook.yml \
  -e "kiosk_profile=player_only kiosk_player_url=http://<freeboard-host>:8080/s/<share-token>" \
  --check --diff
ANSIBLE_CONFIG=ansible/ansible.cfg .venv/bin/ansible-playbook -i ansible/inventory.ini ansible/playbook.yml \
  -e "kiosk_profile=player_only kiosk_player_url=http://<freeboard-host>:8080/s/<share-token>"
```

Single-device bootstrap (SSH into the Pi and run locally):

```bash
ANSIBLE_CONFIG=ansible/ansible.cfg .venv/bin/ansible-playbook -i localhost, -c local ansible/playbook.yml \
  -e "freeboard_target_group=all kiosk_profile=player_only kiosk_player_url=http://127.0.0.1:8080/s/<share-token>"
```

If Mongo runs on Raspberry Pi 4, review `.env.pi` fallback pinning guidance:

- `docs/manual/raspberry-pi-mongodb.md`
- `docs/manual/ansible.md` (Pattern A vs Pattern B execution details)

Rollback:

```bash
ANSIBLE_CONFIG=ansible/ansible.cfg .venv/bin/ansible-playbook -i ansible/inventory.ini ansible/rollback.yml
```

## Acknowledgement

Continues the work of [artificialhoney/freeboard](https://github.com/artificialhoney/freeboard) which is an archived prototype branch derived from the once-popular but long-unmaintained [Freeboard/freeboard](https://github.com/Freeboard/freeboard).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for PR expectations, widget proposal flow, and quality/security checklists.

## Copyright

Copyright © 2013 Jim Heising ([github.com/jheising](https://github.com/jheising))

Copyright © 2013 Bug Labs, Inc. ([buglabs.net](https://buglabs.net))

Copyright © 2024 Sebastian Krüger ([sk.honeymachine.io](https://sk.honeymachine.io))

Copyright © 2026 Cameron K. Brooks ([github.com/CameronBrooks11](https://github.com/CameronBrooks11))

Licensed under the [MIT License](/LICENSE)
