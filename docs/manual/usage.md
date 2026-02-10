# Usage

## Login

- Email: `admin@freeboard`
- Password: `freeboard`

## Common tasks

- Start in dev: `npm run dev`
- Start only app services (Mongo already running): `npm run dev:services`
- Start Mongo only: `npm run dev:mongo:up`
- Reset Mongo volume: `npm run dev:mongo:reset`
- Tail Mongo logs: `npm run dev:mongo:logs`
- Start with Docker only: `docker compose -f docker-compose.yml -f docker-compose.mongo.yml up -d`
- Stop Docker: `docker compose down`

## Raspberry Pi (optional)

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
ansible-playbook ansible/playbook.yml --become
```
