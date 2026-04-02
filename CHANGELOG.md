# Changelog

This changelog is being backfilled from internal project history as part of preparation for freeboard's first formal public release.

The first formal public release will appear as the first official release entry in this file. Earlier material below is reserved for historically important internal and pre-release milestones, and should not be read as evidence of prior public releases.

## Unreleased

No unreleased changes recorded yet.

## First Public Release (TBD)

This section will be finalized when the first public release version, date, and scope are locked.

## Historical Internal Milestones

Pre-release project history will be backfilled here from git history, code, docs, and internal planning records.

### 2026-02-15 to 2026-02-16: Gateway, realtime, widgets, and deployment expansion

- Finalized gateway-backed HTTP datasources with server-managed credential profiles, datasource diagnostics, and migration tooling.
- Added gateway-backed realtime datasources for SSE, WebSocket, and MQTT, including local demo and integration fixtures.
- Expanded the widget set with table, bar chart, and status list widgets, along with responsive and mobile hardening plus curated theme packs.
- Hardened deployment operations with versioned container tagging, compose pinning, and a modular kiosk automation model.

### 2026-02-10 to 2026-02-13: Security, identity, and sharing foundation

- Hardened the platform security and access model with centralized authorization, stricter production auth and bootstrap validation, regression gates, and deny-by-default proxy protections.
- Added role-aware identity, a dedicated admin console, and policy-governed login and account flows.
- Replaced ambiguous publish behavior with explicit dashboard visibility and sharing controls for collaboration workflows.
- Moved the project to a Node 24 and npm 11 baseline.

### 2025-08 to 2025-09: Operational baseline, docs platform, and dashboard management

- Improved local runtime behavior, container workflow defaults, and env-driven service host and port configuration.
- Established a VitePress-based documentation platform, staged GitHub Pages builds, and generated GraphQL and API reference material.
- Expanded Raspberry Pi kiosk automation and player deployment support.
- Added UI support for browsing and switching between saved dashboards.

### 2025-01 to 2025-02: Project restart and modern fork bootstrap

- Bootstrapped the modern fork around an npm workspace monorepo with a Vue 3 UI, GraphQL API, proxy and OAuth services, Mongo-backed persistence, Docker Compose packaging, and Raspberry Pi automation.
- Performed early UI, CSS, and iframe stabilization while that new baseline was settling.
