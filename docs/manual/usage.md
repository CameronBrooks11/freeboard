# Usage

## First login

- Use `ADMIN_EMAIL` and `ADMIN_PASSWORD` from API env config.
- For bootstrap only, set `CREATE_ADMIN=true`, log in once, then set `CREATE_ADMIN=false`.
- Password policy requires 12+ chars with upper/lower/number/symbol.
- Secret bootstrap/rotation guidance: [Secrets Operations Runbook](/manual/secrets-operations).

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

## Mobile (`sm`) layout behavior

- Dashboard width preset `sm` renders panes as a forced single-column stack.
- Use the width toolbar in edit mode to switch `md -> sm` for mobile-oriented layouts.
- On mobile-size viewports, `sm` defaults to view-only mode.
- Advanced override: enable `Allow Mobile Edit (Advanced)` in dashboard settings when in-device editing is required.
- If mobile editing is not required, keep `Allow Mobile Edit (Advanced)` disabled.

## Theme packs

- Dashboard settings include: `auto`, `light`, `dark`, `professional`, `high-contrast`, `colorblind`, `warm`, `cool`.
- `auto` follows the browser/system color scheme and resolves to `light` or `dark`.
- Theme previews are available in the settings dialog so dashboards can be tuned quickly per environment (operator console, kiosk, control-room display).

## Common commands

- Full dev stack: `npm run dev`
- Services only: `npm run dev:services`
- Mongo only: `npm run dev:mongo:up`
- Docker deploy: `docker compose -f docker-compose.yml -f docker-compose.mongo.yml up -d`
- Quality gate: `npm run ci`

## Container image pinning

- Compose defaults to `latest` tags for UI/API/Gateway images.
- To pin a release, set:
  - `FREEBOARD_UI_IMAGE_TAG=v<version>`
  - `FREEBOARD_API_IMAGE_TAG=v<version>`
  - `FREEBOARD_GATEWAY_IMAGE_TAG=v<version>`
- To pin an immutable build, use `sha-<short-commit>` tags from the publish workflow.
- Rollback is tag-based: set prior known-good tags and redeploy with compose.

## Dashboard maintenance commands

- Migrate legacy `published` dashboards to visibility model:
  - Dry run: `npm run dashboards:visibility:migrate-legacy`
  - Apply: `npm run dashboards:visibility:migrate-legacy -- --apply`
- Migrate legacy datasource payloads (`json` type / embedded `authProviders`) to the current HTTP datasource model:
  - Dry run: `npm run dashboards:datasource:migrate-legacy-http`
  - Apply: `npm run dashboards:datasource:migrate-legacy-http -- --apply`
- Force all dashboards to `private` (emergency containment):
  - Dry run: `npm run dashboards:visibility:enforce-private`
  - Apply: `npm run dashboards:visibility:enforce-private -- --apply`

## Next references

- [Deployment Profiles](/manual/deployment-profiles)
- [Datasource Reference](/manual/datasource-reference)
- [Widget Reference](/manual/widget-reference)
