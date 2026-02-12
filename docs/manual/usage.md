# Usage

## First login

- Use `ADMIN_EMAIL` and `ADMIN_PASSWORD` from API env config.
- For bootstrap only, set `CREATE_ADMIN=true`, log in once, then set `CREATE_ADMIN=false`.
- Password policy requires 12+ chars with upper/lower/number/symbol.

## Core workflow

1. Create dashboard
2. Add datasources
3. Add widgets
4. Save dashboard
5. Configure visibility/collaborators in Share dialog

## Visibility model

- `private`: owner/collaborators only
- `link`: accessible via share token URL
- `public`: accessible via public route

In private -> external (`link/public`) transitions, share tokens are rotated.

## Publish behavior

- Editors can publish only when policy `editorCanPublish=true`.
- Admins can always publish.
- If publishing is disabled for editors, create/save paths force private visibility.

## Runtime execution modes

- `safe` (default): trusted script/resource capabilities are blocked.
- `trusted`: advanced script/resource features enabled for trusted environments.

## Common commands

- Full dev stack: `npm run dev`
- Services only: `npm run dev:services`
- Mongo only: `npm run dev:mongo:up`
- Docker deploy: `docker compose -f docker-compose.yml -f docker-compose.mongo.yml up -d`
- Quality gate: `npm run ci`

## Dashboard maintenance commands

- Migrate legacy `published` dashboards to visibility model:
  - Dry run: `npm run dashboards:visibility:migrate-legacy`
  - Apply: `npm run dashboards:visibility:migrate-legacy -- --apply`
- Force all dashboards to `private` (emergency containment):
  - Dry run: `npm run dashboards:visibility:enforce-private`
  - Apply: `npm run dashboards:visibility:enforce-private -- --apply`

## Next references

- [Deployment Profiles](/manual/deployment-profiles)
- [Datasource Reference](/manual/datasource-reference)
- [Widget Reference](/manual/widget-reference)
