# Development Misc

## Useful Commands

- Full lint: `npm run lint`
- UI lint only: `npm run lint:ui`
- API lint only: `npm run lint:api`
- Build UI: `npm run build:ui`

## Mongo Dev Helpers

- Start Mongo only: `npm run dev:mongo:up`
- View Mongo status: `npm run dev:mongo:status`
- Tail Mongo logs: `npm run dev:mongo:logs`
- Stop Mongo: `npm run dev:mongo:down`
- Reset Mongo data volume: `npm run dev:mongo:reset`

## Quick Size Snapshot (`cloc`)

Install:

```bash
npm install -g cloc
```

Run against tracked files:

```bash
cloc --vcs=git
```

On Windows, prefer the standalone binary:

```powershell
winget install AlDanial.cloc
```
