# Releasing & Versioning

This document defines how freeboard is versioned and how a release is cut. It is
the single source of truth for release process; the changelog records the
outcome of following it.

## Versioning policy (SemVer)

freeboard follows [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`.
A single version applies across the workspace packages (they are versioned and
released together).

What each bump means **for this project**:

- **MAJOR** — a breaking change to a public contract a consumer or deployment
  depends on:
  - the portable `DashboardDocument` contract in a way existing documents cannot
    migrate through (see the schema-version note below),
  - the GraphQL API (removed/renamed/retyped fields, changed semantics),
  - the deployment contract (required env vars, datastore schema requiring manual
    intervention, container/runtime expectations).
- **MINOR** — backward-compatible additions: new widgets or datasources, new
  optional document fields, additive GraphQL fields, new deployment profiles or
  opt-in features.
- **PATCH** — backward-compatible bug fixes, dependency and security patches,
  docs, and internal refactors with no contract change.

When a change could be argued either way, pick the higher bump. Stability of the
published contracts is valued over a low version number.

## Two version numbers — keep them distinct

The document `schemaVersion` (currently `1`) is the **data contract** version of
the portable `DashboardDocument`. It is **independent** of the application
release version (`3.x`):

- A new `schemaVersion` is introduced only for a breaking document-shape change,
  and ships with a `migrate()` step in `@freeboard/core`. As long as older
  documents migrate forward cleanly, that is **not** an app MAJOR by itself.
- Conversely, app MAJOR/MINOR/PATCH releases happen without touching
  `schemaVersion` whenever the document contract is unchanged.

Treat `schemaVersion` as "what shape is persisted" and the release version as
"what the software is."

## Pre-releases

Use SemVer pre-release identifiers when a soak is wanted before a final tag:
`X.Y.Z-rc.N` (release candidate) or `X.Y.Z-beta.N`. Pre-release tags are not
promoted automatically; cut the final `X.Y.Z` once validated.

## Release process

1. **Green main.** Ensure `main` is green in CI.
2. **Readiness gate.** Run the full release-readiness matrix locally:

   ```bash
   npm run check:release
   ```

   This runs the DB schema lifecycle, format/lint/typecheck, all package tests,
   the end-to-end smoke and static (Lite) E2E flows, and `build:verify` against a
   throwaway Postgres. See [Postgres Release Readiness](./release-readiness-postgres).

3. **Lock version, date, scope.** Decide the version per the policy above.
   Confirm every workspace `package.json` carries that version.
4. **Finalize the changelog.** Move the `Unreleased` notes in `CHANGELOG.md` into
   a new dated entry, `## X.Y.Z — YYYY-MM-DD`, and reset `Unreleased` to empty.
5. **Tag.** Create an annotated tag and push it:

   ```bash
   git tag -a vX.Y.Z -m "freeboard vX.Y.Z"
   git push origin vX.Y.Z
   ```

   Tags are `vX.Y.Z` (with the leading `v`).

6. **GitHub Release.** Publish a GitHub Release from the tag, using the new
   changelog entry as the notes.
7. **Open the next cycle.** Subsequent changes accrue under `Unreleased` until the
   next release.

## Changelog discipline

- Keep a human-curated `Unreleased` section current as meaningful changes land —
  group by what a reader cares about, not by commit.
- The changelog is the public record; write entries for users and operators, not
  as a raw git log.
