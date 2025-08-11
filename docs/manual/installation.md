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
FREEBOARD_MONGO_DB_PATH=./db
FREEBOARD_MONGO_URL=mongodb://freeboard:unsecure@freeboard-mongo:27017/freeboard

# Bootstrap admin
FREEBOARD_ADMIN_EMAIL=admin@freeboard
FREEBOARD_ADMIN_PASSWORD=freeboard

# UI → API
VITE_API_URL=http://localhost:4001/graphql
```

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
