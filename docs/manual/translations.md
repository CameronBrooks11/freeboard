# Translation Contributions

This project keeps translation scope intentionally lean.

## Policy

1. English is the canonical source for both UI and docs.
2. Translation PRs must stay scoped, reviewable, and synchronized with source changes.
3. If translation maintenance stalls, maintainers may archive stale translation content.

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

Example:

```text
docs/manual/translations/es/usage.md
```

## Quality Rules

1. Do not mix unrelated feature work into translation PRs.
2. Do not rewrite technical behavior while translating.
3. If source and translation conflict, source English behavior/docs win until translation is updated.
4. New user-facing UI strings should be introduced via i18n keys, not hardcoded literals.
