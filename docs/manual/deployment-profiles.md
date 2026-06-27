# Deployment Profiles

## Overview

Freeboard supports three operational profiles. Choose one per environment and enforce it through policy/env configuration.

## Profile 1: Full App (Interactive)

Use for authoring and operations teams.

- Login enabled
- Admin console enabled
- Dashboard editing enabled for `editor`/`admin`
- Sharing and collaboration enabled

Recommended defaults:

- `EXECUTION_MODE=safe`
- `AUTH_REGISTRATION_MODE=invite` (or `disabled`)
- `AUTH_EDITOR_CAN_PUBLISH=false` unless explicitly needed

## Profile 2: Local-First (Lite)

A single static build (`FREEBOARD_STATIC=true`) that runs with **no server**: it persists the dashboard locally and is editable in the browser. Use for a lightweight self-hosted/offline/embeddable dashboard, docs/demos, or an embed target.

- Built with `FREEBOARD_STATIC=true`; no server, no `/graphql` traffic.
- The dashboard is **locally editable** and persisted to `localStorage` as a single portable v1 `DashboardDocument`. Import/Export to a file also work.
- No login/admin, no sharing/share-tokens/collaborators, and no server saved-dashboards picker — those affordances are absent, not merely hidden.
- Datasource support is bounded by the matrix below (Clock/Static/direct-HTTP; streaming types require the server).

Contract:

- Persistence is local to the browser/origin; it is not a shared or backed-up store.
- Do not rely on static mode for protected private dashboards or server-enforced access control.
- Immutable-display variant (read-only kiosk/embed, Save unwired) is a deferred sub-profile, tracked separately.

### Datasource feasibility (static build)

A static build has no Freeboard server/gateway, so datasource support falls into three tiers:

| Datasource                 | Static build | Why                                                                                                                                                                           |
| -------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Clock**                  | Works        | Pure client-side; no network.                                                                                                                                                 |
| **Static**                 | Works        | Inline value; no network.                                                                                                                                                     |
| **HTTP**                   | Direct only  | Fetches directly from the browser. Subject to the target endpoint's **CORS** policy, and **credential profiles are unavailable** (the secret-holding gateway is server-only). |
| **SSE / WebSocket / MQTT** | Unavailable  | Gateway-only streaming; require the Freeboard server. Not registered in a static build (cannot be added); existing documents referencing them load inert.                     |
| **HTTP via gateway**       | Unavailable  | The gateway is server-only; static HTTP is always direct (no gateway toggle, no session-token mint).                                                                          |

CORS is a real limitation of direct HTTP, not a bug — point HTTP datasources at endpoints that permit cross-origin requests.

### Embedding (Lite)

A static build is an embed target. Host it (the docs site already ships the static build via `site:copy-demo`) and inject a portable v1 `DashboardDocument` through one of two channels:

- **Cross-origin — `postMessage` (recommended for iframes).** The embedder posts a `{ type: "freeboard:load-document", document }` message to the iframe; the document is validated and migrated before it loads, and rejected without side effects if invalid. Restrict who may inject with the build-time `VITE_FREEBOARD_EMBED_ALLOWED_ORIGINS` (comma-separated origins; empty or `*` accepts any — the document is still validated and runs in `safe` execution mode).
- **Same-origin — `localStorage`.** When the host serves the build from the same origin, seed the `freeboard:dashboard` key with the document JSON before load. This is subject to browser storage partitioning across origins, which is why `postMessage` is the cross-origin channel.

The local-edit contract (above) and the datasource matrix apply to embedded instances too.

Minimal iframe example (any portable v1 document works; `packages/core/test/fixtures/full.json` is a ready sample):

```html
<iframe
  id="board"
  src="https://your-host/freeboard/"
  style="width: 100%; height: 600px; border: 0"
></iframe>
<script type="module">
  const board = document.getElementById("board");
  const dashboard = await fetch("./full.json").then((r) => r.json());
  board.addEventListener("load", () => {
    board.contentWindow.postMessage(
      { type: "freeboard:load-document", document: dashboard },
      "https://your-host",
    );
  });
</script>
```

## Profile 3: Kiosk Appliance (Viewer-Only Runtime)

Use for wallboards, signage, and IoT/device interfaces.

User/access contract:

- Device opens one dashboard URL in kiosk browser mode
- Device account should be viewer-only (or link-share/public URL when explicitly intended)
- No admin/editor credentials on kiosk device

Security contract:

- Default to `safe` execution mode
- For control interfaces, keep dashboard visibility `private`
- Use `link/public` only for low-sensitivity signage
- On device compromise: rotate share token or deactivate kiosk account immediately

Container image architecture contract:

- Prefer 64-bit Raspberry Pi OS and mainline images (`latest`, `v*`, `sha-*`).
- 32-bit Raspberry Pi OS uses legacy `-armv7` image tags.
- Legacy `-armv7` tags are intentionally separated to avoid blocking mainline runtime upgrades.
- `arm/v6` is intentionally unsupported.

Architecture verification command:

```bash
docker buildx imagetools inspect node:24.13.1-alpine
```

Reference links:

- Docker Raspberry Pi OS install guidance:
  - https://docs.docker.com/engine/install/raspberry-pi-os/
- Docker Engine 29 release notes (32-bit Pi context):
  - https://docs.docker.com/engine/release-notes/29/
- Node Docker image upstream (platform support varies per tag/variant):
  - https://github.com/nodejs/docker-node
- Node official tags (including legacy-friendly LTS lines):
  - https://hub.docker.com/_/node

### Kiosk Provisioning Subprofiles (Ansible)

Kiosk deployments include three provisioning subprofiles:

- `player_only` (default): display + player service only
- `appliance_with_runtime`: adds container runtime setup
- `appliance_with_runtime_and_boot_tuning`: adds runtime + boot/splash tuning

Use the least invasive profile that meets your target environment.

## URL and access guidance

- Private authenticated dashboard: `/:id`
- Public dashboard route: `/p/:id`
- Link-share dashboard route: `/s/:shareToken`

## Kiosk Decision Tree

1. Need only dashboard playback on an already-managed host?
   - Use `player_only`.
2. Need this host to also run local container runtime dependencies?
   - Use `appliance_with_runtime`.
3. Need boot splash and kernel boot tuning on appliance-class hardware?
   - Use `appliance_with_runtime_and_boot_tuning` (only after canary validation).

## Operational checklist

1. Confirm profile for environment (`full`, `static`, or `kiosk`).
2. For kiosk: choose provisioning subprofile (`player_only`, `appliance_with_runtime`, or `appliance_with_runtime_and_boot_tuning`).
3. Apply matching env/policy settings and role/visibility constraints.
4. Validate behavior (auth role, dashboard visibility, and kiosk URL access).
5. Record profile and rollback path in deployment runbook.
