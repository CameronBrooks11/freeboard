# Documentation Site Setup

## Purpose

This project ships a VitePress site that combines:

- manual docs (`docs/manual`)
- generated API/GraphQL/component references (`docs/auto` -> staged to `docs/dev`/`docs/public/dev`)
- UI demo build (`/demo/`)

## Authoring Rules

- Write user/dev guides in `docs/manual/`.
- Write localized docs under first-class locale roots (for example `docs/fr/`, `docs/es/`, `docs/de/`).
- Keep manual docs concise; link to generated references for deep detail.
- Do not commit generated outputs from `docs/auto/` or `docs/public/`.
- When adding a new first-class manual page (`docs/manual/*.md`), also update manual sidebar navigation in `docs/.vitepress/config.mjs`.

## Core Scripts

- `npm run docs:generate`
  - runs API TypeDoc + GraphQL SDL + Vue component docs
  - TypeDoc source boundary is controlled by `typedoc.json` + `tsconfig.typedoc.json`
- `npm run site:stage`
  - stages generated outputs into VitePress-consumable paths
- `npm run docs:verify`
  - runs `docs:generate` + `site:stage` as a fast docs pipeline sanity check
- `npm run check:docs:manual-sidebar`
  - verifies manual sidebar links resolve to real docs pages
  - verifies first-class manual pages are represented in the sidebar
- `npm run check:docs:i18n`
  - validates translated docs metadata/frontmatter contract
  - validates translation source path + source SHA shape + alternate locale mapping
- `npm run site:local`
  - full local docs+demo build pipeline
- `npm run site:pages`
  - full GitHub Pages pipeline
- `npm run site:preview`
  - preview built site

## Typical Local Workflow

```bash
npm run docs:generate
npm run site:stage
npm run site:build:local
npm run site:preview
```

Or use the full pipeline in one command:

```bash
npm run site:local
```

Quick verification without full site build:

```bash
npm run docs:verify
```

Manual docs navigation check:

```bash
npm run check:docs:manual-sidebar
```

Translated docs integrity check:

```bash
npm run check:docs:i18n
```

## Maintainability Baseline

- `lastUpdated` is enabled in VitePress config and should remain on.
- Edit links are enabled for authored docs and intentionally disabled for generated reference pages.
- Search is explicitly configured with the local provider.
- Locale routing is first-class via VitePress `locales` config (`/fr`, `/es`, `/de`).
- Manual sidebar drift is guarded by `npm run check:docs:manual-sidebar`.
- Translated page metadata drift is guarded by `npm run check:docs:i18n`.

## CI Notes

- Pages workflow should only run when docs/demo-relevant files change.
- Keep templates in `docs/_templates/` present; `site:stage` depends on them.
