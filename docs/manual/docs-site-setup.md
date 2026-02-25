# Documentation Site Setup

## Purpose

This project ships a VitePress site that combines:

- manual docs (`docs/manual`)
- generated API/GraphQL/component references (`docs/auto` -> staged to `docs/dev`/`docs/public/dev`)
- UI demo build (`/demo/`)

## Authoring Rules

- Write user/dev guides in `docs/manual/`.
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

## Maintainability Baseline

- `lastUpdated` is enabled in VitePress config and should remain on.
- Edit links are enabled for authored docs and intentionally disabled for generated reference pages.
- Search is explicitly configured with the local provider.
- Manual sidebar drift is guarded by `npm run check:docs:manual-sidebar`.

## CI Notes

- Pages workflow should only run when docs/demo-relevant files change.
- Keep templates in `docs/_templates/` present; `site:stage` depends on them.
