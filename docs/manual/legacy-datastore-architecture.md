# Legacy Datastore Architecture

Last updated: March 11, 2026

This page is archival context only. Freeboard release runtime is Postgres-only.

## Previous MongoDB Architecture Snapshot

Before Phase 31 hard cutover, Freeboard used a MongoDB-first datastore path:

1. API runtime supported `DB_BACKEND=mongo|postgres`.
2. Mongo runtime relied on Mongoose models and repository adapters.
3. Operational helpers included Mongo compose/bootstrap artifacts and optional Ansible preload tooling for Raspberry Pi paths.
4. Several one-off migration scripts existed to bridge schema and visibility transitions.

## Why MongoDB Was Removed

MongoDB support was removed because this project is unreleased and had no production users, so a hard cutover had lower risk than preserving long-term dual-backend complexity.

The old dual-path shape imposed ongoing cost:

1. More runtime branching and test matrix surface.
2. More environment and deployment permutations.
3. More CI/docs maintenance and operator ambiguity.
4. More platform-specific fragility on constrained ARM targets.

## Raspberry Pi Limitations and Workarounds

### Platform limitations

1. Reliable MongoDB support on Raspberry Pi varied by board generation, OS image, architecture, and Mongo release line.
2. Pi 4 and mixed 32-bit environments frequently depended on non-official image/binary paths.
3. Operational behavior and support expectations were inconsistent compared to mainstream amd64/arm64 server targets.

### Brittle/community workarounds previously used

1. Pinning community-maintained Raspberry Pi Mongo images/tarballs.
2. Keeping separate profile toggles and preload automation for ARM-specific bootstrapping.
3. Maintaining fallback notes and manual operator playbooks outside normal production flow.

### Operational risks introduced by those workarounds

1. Supply and maintenance risk when community artifacts changed, lagged, or disappeared.
2. Upgrade risk from pinned artifact drift and manual validation overhead.
3. Incident response complexity due to target-specific behavior differences.
4. Higher onboarding burden for contributors and operators.

## Final Postgres-Only Rationale

Postgres is the long-term release datastore because it reduces runtime branches, simplifies operations, and aligns better with deterministic CI/testing and supported deployment targets.

This repository intentionally removed Mongo runtime/ops paths to keep one durable architecture:

1. Single backend contract.
2. Single schema lifecycle toolchain.
3. Single release-readiness path.
4. Lower long-term maintenance overhead.
