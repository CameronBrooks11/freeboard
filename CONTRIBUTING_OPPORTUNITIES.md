# Contributing Opportunities

This file lists high-value contribution tasks that are ready for external help.

## Active Focus: Translation Review (`fr`, `es`, `de`)

Current baseline:

1. UI locale catalogs exist for French, Spanish, and German.
2. Docs translation seed folders exist for French, Spanish, and German.
3. Native-speaker review is required before these translations are considered verified.

How to help:

1. Pick a locale: `fr`, `es`, or `de`.
2. Open or comment on the locale's translation review issue (links below).
3. Submit fixes in a focused PR (single locale preferred).

## Locale Review Issues

Maintainer action required:

1. Create one issue per locale using `.github/ISSUE_TEMPLATE/translation-review.yml`.
2. Add labels: `translation`, `help wanted`, `i18n`, `docs`, and `lang:<locale>`.

Issue links (fill after creation):

1. French (`fr`): `TODO`
2. Spanish (`es`): `TODO`
3. German (`de`): `TODO`

## UI Translation Review Scope

Review for:

1. Terminology consistency (dashboard, datasource, pane, widget, share, admin).
2. Grammar and natural phrasing.
3. Clarity of error and status messages.
4. Placeholder correctness (for example `{theme}`, `{locale}`, `{email}`).

Primary files:

1. `packages/ui/src/i18n/locales/fr.ts`
2. `packages/ui/src/i18n/locales/es.ts`
3. `packages/ui/src/i18n/locales/de.ts`

Validation:

```bash
npm run check:ui:i18n-parity
npm run test:ui
```

## Docs Translation Review Scope

Review for:

1. Language quality of translated manual pages.
2. Technical accuracy relative to the English source page.
3. Metadata completeness (source path, source revision, last-updated, review status).

Primary folders:

1. `docs/manual/translations/fr/`
2. `docs/manual/translations/es/`
3. `docs/manual/translations/de/`

Manual QA checklist per locale:

1. Login flow labels and actions read naturally.
2. Dashboard toolbar actions are clear and consistent.
3. Share dialog terminology is technically accurate.
4. Localized `references.md` page links to `/dev/api/`, `/dev/graphql/`, and `/dev/components/`.
5. Metadata headers are present and current (`source page`, `source revision`, `translation last-updated`, `review status`).

## Generated Reference Docs Policy

Generated references remain canonical English in this project:

1. `/dev/api/` (TypeDoc)
2. `/dev/graphql/` (schema output)
3. `/dev/components/` (Vue component docs)

Contributors should:

1. Translate guide/entry pages that explain how to use references.
2. Link localized guides to canonical generated references.

Contributors should not:

1. Duplicate or translate generated reference artifacts per locale.

## Locale Closeout Threshold

For each locale (`fr`, `es`, `de`) we mark translation status as verified only when:

1. At least one native-speaker review pass is completed.
2. No high-confidence translation defects remain open.
3. UI parity check remains clean (`npm run check:ui:i18n-parity`).

## Recommended Labels

1. `translation`
2. `i18n`
3. `docs`
4. `help wanted`
5. `lang:fr`
6. `lang:es`
7. `lang:de`
