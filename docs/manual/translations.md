# Translation Contributions

This project keeps translation scope intentionally lean and maintainable.

## Read Localized Manuals

1. French: [/fr/manual/](/fr/manual/)
2. Spanish: [/es/manual/](/es/manual/)
3. German: [/de/manual/](/de/manual/)

## Policy

1. English docs are canonical source.
2. Translation PRs must stay scoped, reviewable, and synchronized with source changes.
3. If translation maintenance stalls, maintainers may archive stale localized pages.
4. Generated references stay canonical in English (`/dev/api/`, `/dev/graphql/`, `/dev/components/`).

## UI Translation Workflow

1. Source locale: `packages/ui/src/i18n/locales/en.ts`
2. Add/update locale files under: `packages/ui/src/i18n/locales/`
3. Keep key parity and placeholder parity with English.
4. Run:

```bash
npm run check:ui:i18n-parity
```

5. Include updated tests when translation behavior changes.

## Docs Translation Workflow

Use this folder convention for translated docs pages:

1. `docs/<locale>/...` (for this project: `docs/fr/`, `docs/es/`, `docs/de/`)
2. Mirror English page naming when practical.
3. Keep translation metadata in YAML frontmatter.

Required frontmatter keys for translated pages:

1. `translationOf`: canonical English source file path.
2. `sourceSha`: non-placeholder commit SHA used for translation baseline.
3. `translationUpdated`: `YYYY-MM-DD`.
4. `translationStatus`: `draft`, `needs-native-review`, or `verified`.
5. `alternateLocales`: locale-to-route map used for alternate-language metadata.

Example:

```text
docs/es/manual/installation-quickstart.md
```

Validation:

```bash
npm run check:docs:i18n
```

## Generated Reference Documentation Policy

1. Keep generated references canonical in English:
   - `/dev/api/`
   - `/dev/graphql/`
   - `/dev/components/`
2. Do not duplicate generated reference outputs per locale.
3. Translate guide pages and localized reference-entry pages that link to canonical generated references.

## Current Native-Speaker Review Request

1. Prioritize language-quality review for `fr`, `es`, and `de`.
2. See `CONTRIBUTING_OPPORTUNITIES.md` for active review tasks.

## Quality Rules

1. Do not mix unrelated feature work into translation PRs.
2. Do not rewrite technical behavior while translating.
3. If source and translation conflict, English canonical docs win until translation is updated.
4. Keep translation PRs scoped to one locale whenever practical.
