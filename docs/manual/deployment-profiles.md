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

Use for wallboards, signage, and device interfaces.

- Device runs player pointing to a dashboard URL
- Account on device should be viewer-only (or link/public token URL)
- No admin/editor credentials on kiosk device

Security contract:

- Default to `safe` execution mode
- For control interfaces, keep dashboard visibility `private`
- Use `link/public` only for low-sensitivity signage
- On device compromise: rotate share token or deactivate kiosk account immediately

## URL and access guidance

- Private authenticated dashboard: `/:id`
- Public dashboard route: `/p/:id`
- Link-share dashboard route: `/s/:shareToken`

## Operational checklist

1. Confirm profile for environment (`full`, `static`, or `kiosk`)
2. Apply matching env/policy settings
3. Validate role and visibility behavior
4. Record profile in deployment runbook
