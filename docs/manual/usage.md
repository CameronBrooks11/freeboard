# Usage

## Login

- Email: `admin@freeboard`
- Password: `freeboard`

## Common tasks

- Start in dev: `npm run dev`
- Start with Docker only: `docker compose -f docker-compose.yml -f docker-compose.mongo.yml up -d`
- Stop Docker: `docker compose down`

## Raspberry Pi (optional)

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
ansible-playbook ansible/playbook.yml --become
```
