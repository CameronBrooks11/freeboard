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

## Profile 2: Static Build (View-Only)

Use for docs/demo or immutable displays.

- Built with `FREEBOARD_STATIC=true`
- No authenticated edit/admin workflow
- No runtime save/publish/collaborator management
- Route-level viewing only

Contract:

- Treat static output as read-only content.
- Do not rely on static mode for protected private dashboards.

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
- armv7 Node compatibility track:
  - https://hub.docker.com/r/arm32v7/node

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
