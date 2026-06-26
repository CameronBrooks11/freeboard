# Dashboard document contract

`dashboard-document.v1.schema.json` is the **canonical, language-neutral contract**
for a portable Freeboard dashboard (JSON Schema 2020-12). It is the source of
truth: TypeScript types and a runtime validator are generated from it (later
phase), never hand-maintained alongside it.

A `DashboardDocument` is the portable artifact — what import/export and the
client `toDocument()` produce. The server wraps it in a `DashboardRecord`
envelope; see the foundation epic.

## Fixtures

| File                         | Validates against v1? | Purpose                                                                                                                                                              |
| ---------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fixtures/minimal.json`      | ✅ yes                | Smallest valid document.                                                                                                                                             |
| `fixtures/full.json`         | ✅ yes                | Representative document (datasource + pane + bound widget + generator).                                                                                              |
| `fixtures/legacy-input.json` | ❌ **no, by design**  | A pre-v1 payload (no `schemaVersion`, has `_id`/`visibility`, panes without `id`). Valid only **after** `migrate()`. It pins what the migration must accept and fix. |

## Decisions ratified for v1

1. **Stable `pane.id` (new).** Panes previously serialized only `title`,
   `layout`, `widgets`; the grid `layout.i` is the grid library's item key, not a
   semantic identity. v1 adds a canonical, document-unique `pane.id`. `layout.i`
   mirrors it. Migration derives `pane.id` from `layout.i` for legacy panes.
   Canonical entities with stable, document-unique ids: `datasource.id`,
   `pane.id`, `widget.id`.

2. **`schemaVersion` vs `generator` (split).** `schemaVersion` (integer, currently
   `1`) is the migration key and nothing else. Tool/app provenance lives in the
   optional `generator: { name, version }`. The pre-v1 top-level `version` string
   (the running app's version at save time) maps to `generator.version`, **not**
   to `schemaVersion`.

3. **Portability of instance references.** A document is portable and contains
   **no secrets and no access-control metadata**. Datasource `settings` may carry
   instance-specific references (`credentialProfileId`, `brokerProfileId`) that
   point at resources in one server installation; these **may be unresolved** when
   a document moves between servers. Resolving/reporting them is a deployment
   concern, out of scope for the document contract. (Logical
   `credentialRef`/`brokerRef` names are a possible future direction.)

4. **Envelope boundary.** These are server-owned and never appear in a document:
   `id`, `ownerId`, `visibility`, `shareToken`, `shareTokenVersion`, `acl`,
   `revision`, `createdAt`, `updatedAt`.

5. **Structure strict, plugin config open.** Document/pane/widget/datasource
   shapes are closed (`additionalProperties: false`); per-plugin `settings` and
   the grid `layout` stay open. Per-widget/per-datasource settings validation
   waits for the manifest system.

6. **Version handling policy** (enforced by `migrate()`/`validate()` in a later
   phase): absent `schemaVersion` ⇒ treat as legacy and migrate; known older ⇒
   migrate sequentially; current ⇒ accept unchanged; **future ⇒ reject clearly**;
   malformed ⇒ reject; never silently downgrade.

## Deferred (with reason)

- **`description` / `tags`** — not added in v1. They are unused today, and adding
  optional fields later is backward-compatible (no version bump needed), so YAGNI.
- **Concrete resource limits** (max panes/widgets/datasources, string lengths,
  nesting depth) — enforced at the import/mutation boundary in a later phase, not
  baked into the schema, to avoid arbitrary caps that reject legitimate large
  dashboards and to give friendly errors at the trust boundary instead of opaque
  schema failures.
