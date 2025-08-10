# freeboard

This Freeboard is a fork of [Jim Heising's damn-sexy dashboard app](https://github.com/Freeboard/freeboard) with super-powers:

- Persistent storage of dashboards in a **MongoDB**
- **GraphQL** API backend
- Distributable through **docker compose**
- Modern **Vue.js** v3 frontend
- Extendable **HTTP-Proxy** to bypass CORS
- **Monorepo** through `npm` workspaces
- **Commit-Hooks** with `pre-commit`
- **CSS-Variables** for all colors

> [Try Out](https://CameronBrooks11.github.io/freeboard)

![Freeboard dashboard screenshot](freeboard.png)

## Requirements

- Node.js: v18.x (LTS)
- npm: v8+
- Docker Engine: ≥ 20.10
- Docker Compose: v2 (`docker compose` CLI)
- Python: 3.8+ (for Raspberry Pi Ansible playbook)
- Ansible: latest `via pip install ansible`

## Installation

```bash
git clone git@github.com:CameronBrooks11/freeboard.git
cd freeboard
git checkout dev
npm install
```

## Usage

**Login:** admin@freeboard / freeboard

### Docker-Compose

```bash
docker compose -f docker-compose.yml -f docker-compose.mongo.yml up -d
```

### Development

```bash
npm run dev
```

## RaspberryPi

```bash
python -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/ansible-playbook ansible/playbook.yml --become
```

## TODO

- Secure environment variable store
- i18n: externalize strings and labels

## Acknowledgement

Continues the work of [artificialhoney/freeboard](https://github.com/artificialhoney/freeboard) which is an archived prototype branch derived from the once-popular but long-unmaintained [Freeboard/freeboard](https://github.com/Freeboard/freeboard).

## Copyright

Copyright © 2013 Jim Heising ([github.com/jheising](https://github.com/jheising))

Copyright © 2013 Bug Labs, Inc. ([buglabs.net](https://buglabs.net))

Copyright © 2024 Sebastian Krüger ([sk.honeymachine.io](https://sk.honeymachine.io))

Licensed under the [MIT License](/LICENSE)
