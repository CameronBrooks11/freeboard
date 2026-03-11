# Usage

## First login

- Use `ADMIN_EMAIL` and `ADMIN_PASSWORD` from API env config.
- For bootstrap only, set `CREATE_ADMIN=true`, log in once, then set `CREATE_ADMIN=false`.
- Password policy requires 12+ chars with upper/lower/number/symbol.
- Secret bootstrap/rotation guidance: [Secrets Operations Runbook](/manual/secrets-operations).

## Machine integrations

- For non-human automation, use scoped service accounts instead of user passwords.
- Service account setup and rotation guidance: [Service Accounts Runbook](/manual/service-accounts).

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

- Dashboard settings include: `auto`, `light`, `paper`, `dark`, `slate`, `high-contrast`, `colorblind`, `amber-night`.
- `auto` follows the browser/system color scheme and resolves to `light` or `dark`.
- Theme preview updates immediately when selected in Settings.
- `Cancel` reverts preview changes; `Apply` keeps the selection in the dashboard draft.
- Theme persistence still occurs on dashboard `Save`/`Update`.

## Common commands

- Full dev stack: `npm run dev`
- Services only: `npm run dev:services`
- Postgres only: `npm run dev:postgres:up`
- Docker deploy (default): `docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d`
- Quality gate: `npm run ci`

## Container image pinning

- Compose defaults to `latest` tags for UI/API/Gateway images.
- To pin a release, set:
  - `FREEBOARD_UI_IMAGE_TAG=v<version>`
  - `FREEBOARD_API_IMAGE_TAG=v<version>`
  - `FREEBOARD_GATEWAY_IMAGE_TAG=v<version>`
- To pin an immutable build, use `sha-<short-commit>` tags from the publish workflow.
- Rollback is tag-based: set prior known-good tags and redeploy with compose.

## Dashboard maintenance

- Legacy one-off dashboard migration/enforcement scripts were removed from active runtime operations.
- Use standard admin flows (dashboard settings, sharing, and account controls) for ongoing maintenance.

## Next references

- [Deployment Profiles](/manual/deployment-profiles)
- [Datasource Reference](/manual/datasource-reference)
- [Widget Reference](/manual/widget-reference)
