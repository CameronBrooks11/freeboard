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

## Core Scripts

- `npm run docs:generate`
  - runs API JSDoc + API markdown + GraphQL SDL + Vue component docs
- `npm run site:stage`
  - stages generated outputs into VitePress-consumable paths
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

## CI Notes

- Pages workflow should only run when docs/demo-relevant files change.
- Keep templates in `docs/_templates/` present; `site:stage` depends on them.
