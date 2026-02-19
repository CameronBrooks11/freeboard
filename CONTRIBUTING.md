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

## Branch and PR Expectations

- Keep PRs scoped to one logical change.
- Include docs updates in the same PR when behavior changes.
- Include tests for regressions and new behavior.

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
