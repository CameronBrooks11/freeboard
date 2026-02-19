# TypeScript Migration Conventions

This guide defines the migration rules for Phase 17.

## Scope Rules

- Migration PRs are for typing/runtime transition only.
- Do not bundle feature work into migration PRs.
- Keep PRs package-scoped and boundary-scoped.

## Import Rules (Node ESM)

- Use explicit `.js` import specifiers for local module imports in Node ESM code.
- Keep module boundaries stable while converting files (`.js` and `.ts` can coexist temporarily).

## Suppression Rules

- Prefer fixing the type issue over suppressing it.
- `@ts-expect-error` requires a short rationale comment and a follow-up issue/task reference.
- Do not use broad file-level disable directives as a default strategy.

## Type Safety Rules

- Do not use `any` in production source (`packages/*/src`).
- Prefer `unknown` at trust boundaries, then narrow with explicit guards.
- Prefer domain interfaces/types over unstructured mutable bags.
- CI enforces a TS source debt check for unsafe typing patterns.

## Progression Gate

- Do not start migrating the next package until the current package completion criteria are met.
- If CI/runtime stability regresses, roll back to the last green checkpoint before continuing.

## Validation Baseline

Run for migration PRs:

```bash
npm run format:check
npm run lint
npm run test
npm run build:verify
npm run typecheck
```

Add `npm run test:e2e:smoke` for UI-affecting slices.
