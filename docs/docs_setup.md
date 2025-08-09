# Documentation Setup

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

We generate three kinds of reference docs.

### 2.1 Node services (API, OAuth, Proxy)

- Tool: `jsdoc`
- Source: only `.js` files in `packages/api/src`, `packages/oauth/src`, `packages/proxy/src`
- Output: `docs/auto/api/`
- Config: `jsdoc.json` uses `includePattern` matching `\.(js)$` and a real template such as `minami` via `opts.template: node_modules/minami`
- Important: keep JSDoc types strictly to JSDoc-native forms (see standards below)

### 2.2 GraphQL schema

- Tool: `@graphql-codegen/cli` (or your existing schema export script)
- Source: schema from `packages/api/src/gql.js` and merged SDL in `packages/api/src/types`
- Output: `docs/auto/graphql/` (for example `schema.graphql`)

### 2.3 Vue components (UI)

- Tool: `vue-docgen-cli`
- Source: `.vue` files in `packages/ui/src/components` (or the whole `packages/ui/src` as needed)
- Output: `docs/auto/components/` (markdown per component)

---

## 3. Scripts

Add or confirm these in the root `package.json`:

- `docs:generate:api` → `jsdoc -c jsdoc.json`
- `docs:generate:graphql` → `graphql-codegen --config codegen.yml`
- `docs:generate:vue` → `vue-docgen -o docs/auto/components packages/ui/src/components`
- `docs:generate` → `npm run docs:generate:api && npm run docs:generate:graphql && npm run docs:generate:vue`

Run everything with `npm run docs:generate`.

---

## 4. Viewing the docs

- API, OAuth, Proxy (JSDoc HTML): open `docs/auto/api/index.html` in a browser. Examples: Windows `start "" docs/auto/api/index.html`, macOS `open docs/auto/api/index.html`, Linux `xdg-open docs/auto/api/index.html`. You can also serve the folder with `npx http-server docs/auto/api -p 8081`.
- GraphQL schema: open `docs/auto/graphql/schema.graphql` in your editor or wire it into a schema viewer.
- Vue components: browse markdown files under `docs/auto/components`. Use your editor’s markdown preview or feed the folder into a static-site generator such as VitePress later.

---

## 5. CI integration

- In GitHub Actions, ensure a workflow runs `npm ci` and `npm run docs:generate` before publishing docs or deploying pages.
- Either commit `docs/auto/` or build it in CI and publish the `docs` directory to Pages.

---

## 6. Code commenting standards (JSDoc)

To keep generation clean and portable:

- Use only JSDoc-native types: `string`, `number`, `boolean`, `Object`, `Array.<T>`, `Record.<K,V>`, `Promise.<T>`, union with `A|B`, optional `T=`, nullable `?T`.
- Do not use TypeScript import types or `typeof` inside tags. Replace `import('x').Y` and `typeof Z` with `Object` or a local `@typedef` alias.
- For third-party or complex shapes, prefer local aliases:
  - Example: `@typedef {Object} ExpressRequest` and `@typedef {Object} ExpressResponse`, then use `ExpressRequest` and `ExpressResponse` in `@param` tags.
  - Example: `@typedef {Object} PubSub` for pubsub-like objects.
- Every module or exported function should have a header with `@module` or `@function`, a clear description, and parameter and return docs.
- Keep `.vue` files out of JSDoc runs. They are handled by `vue-docgen-cli`.

---

## 7. Dependencies

Dev dependencies you will likely need:

- `jsdoc`
- `minami` (or another maintained JSDoc template)
- `@graphql-codegen/cli` and schema plugins you use
- `vue-docgen-cli`
- Optionally `http-server` to serve HTML locally

Install as needed with your package manager.

---

## 8. Troubleshooting

- Error like `Invalid type expression "import('x').Y"`: replace with a native type or a local `@typedef` alias as described above.
- JSDoc fails parsing `.vue`: ensure `jsdoc.json` limits to `.js` and generate UI docs with `vue-docgen-cli`.
- Template error `Cannot find module 'default/publish'`: set `opts.template` to an installed template such as `node_modules/minami`.
