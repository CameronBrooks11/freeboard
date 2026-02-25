# Translation Contributions

This project keeps translation scope intentionally lean.

## Policy

1. English is the canonical source for both UI and docs.
2. Translation PRs must stay scoped, reviewable, and synchronized with source changes.
3. If translation maintenance stalls, maintainers may archive stale translation content.
4. UI i18n runtime is composition-mode only (`legacy: false`) while keeping template `$t(...)` support via global injection.

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

Use this folder convention for translated manual pages:

1. `docs/manual/translations/<locale>/`
2. Mirror the English page naming where possible.
3. At the top of each translated page, include:
   - source page path
   - source revision/commit reference
   - translation last-updated date
   - review status (`draft`, `needs-native-review`, `verified`)

Example:

```text
docs/manual/translations/es/usage.md
```

Generated reference documentation policy:

1. Keep generated references canonical in English:
   - `/dev/api/`
   - `/dev/graphql/`
   - `/dev/components/`
2. Do not duplicate generated reference outputs per locale.
3. Translate guide pages and localized reference-entry pages that link to canonical generated references.

Current native-speaker review request:

1. Please prioritize language-quality review for `fr`, `es`, and `de` translation seeds.
2. See `CONTRIBUTING_OPPORTUNITIES.md` for active review tasks.

Current seed pages:

1. French:
   - `/manual/translations/fr/`
   - `/manual/translations/fr/installation-quickstart`
   - `/manual/translations/fr/references`
2. Spanish:
   - `/manual/translations/es/`
   - `/manual/translations/es/installation-quickstart`
   - `/manual/translations/es/references`
3. German:
   - `/manual/translations/de/`
   - `/manual/translations/de/installation-quickstart`
   - `/manual/translations/de/references`

## Quality Rules

1. Do not mix unrelated feature work into translation PRs.
2. Do not rewrite technical behavior while translating.
3. If source and translation conflict, source English behavior/docs win until translation is updated.
4. New user-facing UI strings should be introduced via i18n keys, not hardcoded literals.
5. Keep translation PRs scoped to one locale whenever practical.
