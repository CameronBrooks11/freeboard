# Changelog

This changelog is being backfilled from internal project history as part of preparation for freeboard's first formal public release.

The first formal public release will appear as the first official release entry in this file. Earlier material below is reserved for historically important internal and pre-release milestones, and should not be read as evidence of prior public releases.

## Unreleased

The first public release has not been cut yet. The notes below capture current pre-release stabilization work that is expected to feed into that first formal release entry once version, date, and scope are locked.

- Stabilized the UI client for Apollo Client v4 and aligned Vue dependency resolution to clear typecheck regressions.
- Fixed demo/build behavior for the upcoming release path, resolved dependency audit issues, and completed Vite 8 and TypeScript 6 compatibility adjustments.
- Added CodeQL, dependency review, and `CODEOWNERS` guardrails, then cleaned up verified code-scanning findings and hardened script execution paths.

## First Public Release (TBD)

This section will be finalized when the first public release version, date, and scope are locked. At that point, the `Unreleased` notes above should be reviewed and moved here as the first official release entry.

## Historical Internal Milestones

Important pre-release project history is backfilled here from git history, code, docs, and internal planning records.

### 2026-03-10 to 2026-03-31: PostgreSQL cutover and internal 3.0.0 milestone

- Built the PostgreSQL foundation with datastore abstractions, schema tooling, and Postgres-first local and CI workflows.
- Completed a pre-release clean cutover to PostgreSQL as the only supported active datastore, removing Mongo from runtime paths and isolating legacy architecture details to archival documentation.
- Added release-readiness automation for the Postgres release path, including schema checks, API smoke coverage, and CI guardrails against legacy datastore residue.
- Marked the milestone with an internal `3.0.0` version bump across packages.

### 2026-02-24 to 2026-03-02: Localization and multilingual docs foundation

- Added `fr`, `es`, and `de` locale baselines for the UI along with seeded translation workflows and native-review contribution paths.
- Cut the UI i18n runtime over to Vue I18n composition mode with CI guardrails.
- Added first-class multilingual documentation-site support and docs-i18n integrity checks.

### 2026-02-20 to 2026-02-22: Runtime integrity, themes, and contributor/reporting UX

- Hardened shared runtime and limiter policy enforcement, along with CI smoke coverage for non-development and security-sensitive behavior.
- Introduced a canonical theme system with live preview and contrast guardrails.
- Added structured bug, security, and contribution intake plus in-app bug reporting.

### 2026-02-17 to 2026-02-19: Operations, build hardening, and TypeScript cutover

- Added service accounts, scoped machine authentication, runtime metrics, and stronger admin observability.
- Stabilized the UI build pipeline with explicit bundle budgets and build metrics.
- Completed the TypeScript-first cutover across the codebase and enforced typecheck in CI.

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
