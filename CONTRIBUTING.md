# Contributing

This project prioritizes maintainability, security, and predictable operations over backwards compatibility.

## Development Baseline

- Node.js `24.13.1` and npm `11.10.0` (see `.nvmrc` and `package.json` engines).
- Install deps: `npm install`
- Run quality gate locally before opening a PR:

```bash
npm run format:check
npm run lint
npm run check:ui:store-boundaries
npm run test
npm run build:verify
```

For changes touching `packages/ui/**`, `packages/api/**`, `packages/gateway/**`, `packages/shared/**`, or `e2e/**`, also run:

```bash
npm run test:e2e:smoke
```

## Branch and PR Expectations

- Keep PRs scoped to one logical change.
- Include docs updates in the same PR when behavior changes.
- Include tests for regressions and new behavior.
- Use the PR template checklist and include exact validation commands in the PR description.

## Reporting Bugs and Security Issues

- General defects: use the GitHub **Bug Report** issue form.
- Widget proposals: use the existing **Widget Proposal** issue form.
- Support/questions: use GitHub Discussions.
- Security vulnerabilities: do **not** open public issues; report privately via `SECURITY.md`.

TypeScript PR policy:

- Type-focused refactors must not include unrelated feature behavior changes.
- Keep type-system refactors scoped by package and boundary.
- For Node ESM imports, use explicit `.js` specifiers for local module imports.
- Any `@ts-expect-error` requires a short rationale and follow-up reference.
- Do not start migrating the next package until the current package closeout criteria are met.

TypeScript regression prevention checklist:

- No `any`, `as unknown as`, `@ts-ignore`, or `@ts-nocheck` introduced in product source.
- New boundary inputs start as `unknown` and are narrowed with guards/adapters.
- `npm run check:ts:debt`, `npm run check:ts:source-artifacts`, and `npm run typecheck` must pass.
- Any new ambient declaration (`*.d.ts`) must be documented in `docs/manual/typescript-standards.md`.

Security/control guardrails:

- UI behavior regression tests must assert runtime behavior (component behavior or e2e), not source text shape/regex patterns.
- Runtime source under `packages/{ui,api,gateway,shared}/src` must not use `eval`, `new Function`, or string-based timer eval patterns.
- Changes to trusted IP derivation, limiter policy, auth throttling, or gateway security controls require integration coverage in affected package tests.
- Cross-service security-control changes (UI + API + gateway behavior path) require an `e2e/smoke` update or assertion review in the same PR.

## Widget Contribution Process

1. Open a **Widget Proposal** issue (use the issue template).
2. Confirm use case, display-only scope, and datasource/binding model.
3. Submit PR with implementation + tests + docs updates.

Required docs for new/updated widgets:

- `docs/manual/widget-reference.md`
- `docs/manual/widget-examples/*`
- `docs/manual/widget-developer-guide.md` (when standards/patterns change)

## Widget Design Review Checklist

- Display-only behavior (no direct input/edit workflow).
- Fits existing grid/pane model and `getPreferredRows()` behavior.
- Responsive behavior defined for narrow panes and `sm` layout.
- Empty/error states are explicit and user-readable.
- Uses existing theme tokens (`--color-*`) and avoids hard-coded visual assumptions.

## Widget Testing Checklist

- Unit tests for parsing/normalization helpers.
- Runtime tests for normal + empty + malformed input states.
- Responsive tests for narrow-width behavior.
- Plugin registry test coverage for widget registration.

## Widget Security Checklist

- No `eval`, `Function`, or dynamic script execution.
- No widget runtime network requests.
- No unsafe HTML injection paths.
- No storage writes (`localStorage`/`sessionStorage`) from widgets.
- No bypasses around execution mode controls.

## Docs Drift Rule

If implementation changes invalidate existing docs, update docs in the same PR.  
Do not defer documentation alignment for “later cleanup”.

Docs maintenance checklist:

- If you add a first-class manual page under `docs/manual/*.md`, update the manual sidebar in `docs/.vitepress/config.mjs`.
- Run `npm run check:docs:manual-sidebar` for docs-nav integrity.
- For docs pipeline changes, also run `npm run docs:verify`.

## Translation Contributions (UI + Docs)

UI translation baseline:

- English (`en`) is canonical source for keys and placeholder contract.
- Locale messages live in `packages/ui/src/i18n/locales/`.
- Keep locale key sets aligned with English. Run `npm run check:ui:i18n-parity`.
- Do not introduce hardcoded user-facing strings in runtime UI paths.

Docs translation baseline:

- Translation workflow and file conventions are defined in `docs/manual/translations.md`.
- Keep translated docs scoped and track source/translation drift explicitly.
- Docs locale routing is first-class under `docs/{fr,es,de}/` and must stay aligned with `docs/.vitepress/config.mjs`.
- Translated docs metadata is CI-enforced via `npm run check:docs:i18n`.
- Active translation tasks and native-speaker review requests are listed in `CONTRIBUTING_OPPORTUNITIES.md`.
