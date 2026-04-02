# Changelog

This changelog is being backfilled from internal project history as part of preparation for freeboard's first formal public release.

The first formal public release will appear as the first official release entry in this file. Earlier material below is reserved for historically important internal and pre-release milestones, and should not be read as evidence of prior public releases.

## Unreleased

No unreleased changes recorded yet.

## First Public Release (TBD)

This section will be finalized when the first public release version, date, and scope are locked.

## Historical Internal Milestones

Pre-release project history will be backfilled here from git history, code, docs, and internal planning records.

### 2025-08 to 2025-09: Operational baseline, docs platform, and dashboard management

- Improved local runtime behavior, container workflow defaults, and env-driven service host and port configuration.
- Established a VitePress-based documentation platform, staged GitHub Pages builds, and generated GraphQL and API reference material.
- Expanded Raspberry Pi kiosk automation and player deployment support.
- Added UI support for browsing and switching between saved dashboards.

### 2025-01 to 2025-02: Project restart and modern fork bootstrap

- Bootstrapped the modern fork around an npm workspace monorepo with a Vue 3 UI, GraphQL API, proxy and OAuth services, Mongo-backed persistence, Docker Compose packaging, and Raspberry Pi automation.
- Performed early UI, CSS, and iframe stabilization while that new baseline was settling.
