# Documentation Site Setup

## 1. Manual Documentation

Place all hand-written guides under `docs/manual/`.

Filename conventions:

- `architecture.md` – High-level system overview
- `installation.md` – Local, Docker, and Raspberry Pi install steps
- `usage.md` – How to run, configure, and operate the dashboard
- `ansible.md` – Details on the Ansible playbook and templates
- `contributing.md` – How to update docs, code comments, and run generators

Updates to manual docs are committed directly in this directory.

---

## 2. Auto-Generated Documentation

We generate three kinds of reference docs, staged into VitePress so they are navigable within the site.

### 2.1 Node services (API, Proxy)

- Tool: `jsdoc`
- Source: `.js`, `.mjs`, `.cjs` files in `packages/api/src` and `packages/proxy/src`
- Output: `docs/auto/api/` (HTML theme) and `docs/auto/api-md/` (Markdown for VitePress)
- Config: `jsdoc.json` uses `clean-jsdoc-theme` for HTML, plus a separate `jsdoc2md` run for the Markdown export
- Markdown output is staged into `docs/dev/api/` using a template (`docs/_templates/api-index.md`), replacing the old external link approach

### 2.2 GraphQL schema

- Tool: `@graphql-codegen/cli` or a custom schema build script
- Output: `docs/auto/graphql/` (e.g. `schema.graphql`)
- The schema is embedded into a VitePress page using `docs/_templates/graphql-index.md` so it renders with syntax highlighting and includes a raw download link

### 2.3 Vue components (UI)

- Tool: `vue-docgen-cli`
- Source: `.vue` files in `packages/ui/src/components` (or entire `src` as needed)
- Output: `docs/auto/components/` (Markdown per component), staged into `docs/dev/components/` with an auto-generated index

---

## 3. Staging Script

### 3.1 `site-stage.mjs`

The `site-stage` script:

- Cleans `docs/public/dev` and `docs/dev` auto-docs folders
- Copies API HTML into `docs/public/dev/api`
- Copies GraphQL SDL into `docs/public/dev/graphql` and generates `docs/dev/graphql/index.md` from its template
- Copies Vue component docs into `docs/dev/components` with a generated index
- Copies API Markdown into `docs/dev/api` from `docs/auto/api-md` using the API index template
- Adds a demo `404.html` fallback from `docs/_templates/demo-404.html` into `docs/public/demo/` so `/demo/*` routes work without committing `public/demo` to git

All templates (`api-index.md`, `graphql-index.md`, `demo-404.html`) live under `docs/_templates/` and are required — missing templates should be treated as an error.

---

### 3.2 `build-schema.mjs`

This script extracts the GraphQL schema from `packages/api/src/gql.js` and writes it as an SDL file to `docs/auto/graphql/schema.graphql`.  
It expects a valid `GraphQLSchema` export (`default` or `schema`) and will fail if none is found.  
The generated SDL is later used by `site-stage` to embed the schema into the VitePress site via `docs/_templates/graphql-index.md`.

---

## 4. Scripts

Key `package.json` scripts (what they do):

- `docs:generate:api` — build HTML API docs with JSDoc (`docs/auto/api`)
- `docs:generate:api:md` — build Markdown API reference with jsdoc2md (`docs/auto/api-md/all.md`)
- `docs:generate:graphql` — emit GraphQL SDL via `scripts/build-schema.mjs` (`docs/auto/graphql/schema.graphql`)
- `docs:generate:vue` — generate Vue component docs with `vue-docgen-cli` (`docs/auto/components`)
- `docs:generate` — run all four generators above (API HTML + API MD + GraphQL + Vue)

- `site:stage` — stage generated docs into VitePress structure (`docs/dev/*`, `docs/public/dev/*`, demo 404 template)

- `demo:build:local` — build the demo app for `/demo/` (local preview base)
- `demo:build:pages` — build the demo app for `/freeboard/demo/` (GitHub Pages base)

- `site:build:local` — VitePress build with `SITE_BASE=/` (local)
- `site:build:pages` — VitePress build with `SITE_BASE=/freeboard/` (GitHub Pages)
- `site:copy-demo` — copy demo build into `docs/.vitepress/dist/demo/`

- `site:local` — full local pipeline: generate docs → stage → build demo (local base) → build site (local base) → copy demo
- `site:pages` — full Pages pipeline: generate docs → stage → build demo (pages base) → build site (pages base) → copy demo
- `site:preview` — serve the built VitePress site at port 8000

---

## 5. Viewing the docs

Once staged:

- **API** – Visit `/dev/api/` in the local VitePress site to see the Markdown-based reference
- **GraphQL** – Visit `/dev/graphql/` for the embedded schema and download link
- **Components** – Visit `/dev/components/` for component reference

The HTML API theme is also available under `/dev/api/` (from `docs/public/dev/api`) if directly opened.

---

## 6. CI integration

- CI should run `npm ci`, `npm run docs:generate`, and `npm run site:stage` before `vitepress build docs`
- `docs/auto/` and `docs/public/` are ignored in `.gitignore` — they are always regenerated
- Templates in `docs/_templates/` must be present in the repo for staging to succeed

---

## 7. Code commenting standards (JSDoc)

- Use JSDoc-native types (`string`, `number`, `boolean`, `Object`, `Array.<T>`, etc.)
- No TypeScript `import()` or `typeof` — instead, define `@typedef` aliases
- Every exported function/module gets a description, params, and return docs
- `.vue` files are excluded from JSDoc and handled via `vue-docgen-cli`

---

## 8. Dependencies

Dev dependencies include:

- `jsdoc`, `clean-jsdoc-theme`, `jsdoc-to-markdown`
- `@graphql-codegen/cli`
- `vue-docgen-cli`
- `vitepress`
- `shx`, `rimraf` for cross-platform file ops
