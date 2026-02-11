# Usage

## Login

- Email: `ADMIN_EMAIL` from API env config (`packages/api/.env` overrides root `.env`)
- Password: `ADMIN_PASSWORD` from API env config (`packages/api/.env` overrides root `.env`)
- For local first-run bootstrap: set `CREATE_ADMIN=true` temporarily.
- `CREATE_ADMIN=true` requires:
  - email format: `name@domain.ext`
  - password: min 12 chars with uppercase, lowercase, number, and symbol
- The same credential policy is enforced for `registerUser`.

If login fails on first setup:

1. verify API is reading the expected env file (`packages/api/.env` overrides root `.env`)
2. verify `CREATE_ADMIN=true` and credentials meet policy
3. restart API and check startup logs
4. after successful first login, set `CREATE_ADMIN=false`

## Common tasks

- Start in dev: `npm run dev`
- Start only app services (Mongo already running): `npm run dev:services`
- Start Mongo only: `npm run dev:mongo:up`
- Reset Mongo volume: `npm run dev:mongo:reset`
- Tail Mongo logs: `npm run dev:mongo:logs`
- Start with Docker only: `docker compose -f docker-compose.yml -f docker-compose.mongo.yml up -d`
- For Docker mode, ensure `.env` sets `JWT_SECRET` and `PROXY_ALLOWED_HOSTS`
- Stop Docker: `docker compose down`

## Build Dashboard Mashups Quickly

1. Add datasources from [Datasource Reference](/manual/datasource-reference)
2. Add widgets from [Widget Reference](/manual/widget-reference)
3. Use [Widget Examples](/manual/widget-examples/) to copy known-good public API configs
4. If an API has CORS issues, route via proxy (`Use Proxy = true`) and ensure the host is in `PROXY_ALLOWED_HOSTS`
5. For custom behavior, use the [Base Widget Guide](/manual/widget-base-guide)

## Raspberry Pi (optional)

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
ansible-playbook ansible/playbook.yml --become
```
