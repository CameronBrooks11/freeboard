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

- Introduced datastore abstractions, a PostgreSQL runtime foundation, repository-backed data access, and SQL schema lifecycle tooling for the new release backend.
- Shifted local development, smoke tests, CI, and release-readiness validation to Postgres-first workflows with dedicated schema checks and API smoke coverage.
- Completed a pre-release clean cutover to PostgreSQL as the only supported active datastore, removing Mongo runtime paths, source trees, and active backend selection.
- Retired Mongo operational assets and consolidated the remaining datastore history into a single archival legacy document, then added CI guardrails against residual Mongo references.
- Marked the transition with an internal `3.0.0` version bump across packages.

### 2026-02-24 to 2026-03-02: Localization and multilingual docs foundation

- Established the UI i18n runtime foundation, then added `fr`, `es`, and `de` locale baselines, translated docs seeds, and a native-review contribution workflow.
- Cut the UI i18n runtime over to Vue I18n composition mode with CI guardrails and docs alignment.
- Added first-class multilingual documentation-site routing and docs-i18n integrity checks so translated docs could be surfaced directly in the docs site.

### 2026-02-20 to 2026-02-22: Runtime integrity, themes, and contributor/reporting UX

- Hardened shared limiter controls and aligned realtime fail-mode behavior across API and gateway runtime paths.
- Hardened non-development runtime policy enforcement with stronger CI integrity coverage and runtime dependency checks.
- Introduced a canonical theme system with live preview, a curated theme catalog, and contrast guardrails.
- Added structured bug, security, and contribution intake workflows plus an in-app bug-reporting baseline.

### 2026-02-17 to 2026-02-19: Operations, build hardening, and TypeScript cutover

- Added service accounts, scoped machine authentication, runtime metrics, and stronger admin observability.
- Stabilized the UI build pipeline with explicit bundle budgets, build metrics, and cleaner build-configuration defaults.
- Completed the TypeScript-first cutover across the codebase with stricter type settings, TS-first package conventions, and required typecheck in CI.

### 2026-02-15 to 2026-02-16: Gateway, realtime, widgets, and deployment expansion

- Finalized gateway-backed HTTP datasources with server-managed credential profiles, datasource diagnostics, and cutover and migration tooling.
- Renamed the proxy service to `gateway` and clarified that architecture across packages, runtime scripts, and documentation.
- Added gateway-backed realtime datasources for SSE, WebSocket, and MQTT, including demo fixtures, integration coverage, and realtime operations docs.
- Expanded the widget set with table, bar chart, and status list widgets, along with responsive and mobile hardening, curated theme packs, and widget developer docs.
- Hardened deployment operations with versioned container tagging, compose pinning, and a production-safe modular kiosk automation model.

### 2026-02-10 to 2026-02-13: Security, identity, and sharing foundation

- Hardened the platform security model by centralizing dashboard authorization, enforcing stricter production auth and bootstrap validation, and adding deny-by-default proxy SSRF and TLS protections.
- Added comprehensive regression tests and CI gates for authorization, proxy security, auth and bootstrap validation, and identity and schema contracts.
- Introduced role-aware identity, policy controls, and a dedicated admin console with stronger login and account-management flows.
- Replaced ambiguous publish behavior with explicit dashboard visibility and sharing controls for collaboration and offboarding-safe workflows.
- Moved the project to a Node 24 and npm 11 baseline.

### 2025-08-02 to 2025-09-07: Operational baseline, docs platform, and dashboard management

- Re-established local development and container workflows with example env configuration, streamlined npm dev flows, and env-driven IPv4-safe host and port defaults across the UI, API, and proxy.
- Added contributor-facing maintainability groundwork with JSDoc-based doc-generation prep, ESLint and VS Code defaults, and supporting developer docs.
- Built a VitePress documentation site with GitHub Pages staging and generated GraphQL and API reference material, then internalized API, GraphQL, and demo documentation templates for docs publishing.
- Expanded Raspberry Pi kiosk and player deployment automation with Ansible, X11 handling, service templating, and platform-specific setup improvements.
- Added UI support for browsing and switching between saved dashboards.

### 2025-01-27 to 2025-02-26: Project restart and modern fork bootstrap

- Restarted the project as an npm workspace monorepo with separate Vue 3 UI, GraphQL API, proxy, and OAuth services.
- Established the initial runtime and deployment baseline with Mongo-backed dashboard persistence, Docker Compose packaging, and Raspberry Pi automation.
- Applied early CSS, iframe, and general UI stabilization while the new baseline settled.
