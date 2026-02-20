# TypeScript Standards and Governance

This document defines the TypeScript baseline and governance model for Freeboard.

## Baseline Requirements

1. TypeScript strictness is the default posture.
2. Product source lives in TS-first paths:
   - `packages/ui/src`
   - `packages/api/src`
   - `packages/gateway/src`
   - `packages/shared/src`
3. CI must enforce:
   - lint,
   - TS debt checks,
   - source-artifact checks,
   - typecheck.

## Prohibited Patterns (Product Source)

1. `any` types and `as any` casts.
2. `as unknown as` double-casts.
3. `@ts-ignore` and `@ts-nocheck`.
4. Catch-all index signatures used as escape hatches.
5. Accessing unknown error properties without explicit narrowing.

## Allowed Patterns

1. `unknown` at trust boundaries (network/input/plugin edges), followed by explicit guards.
2. Narrow, local casts where there is no safe runtime alternative and a typed helper is used.
3. Shared compatibility helpers preferred over repeated inline casts/hacks.

## Error Handling Rules

1. `catch (error)` variables are treated as `unknown`.
2. Narrow before property access:
   - check object shape,
   - extract known fields safely,
   - provide fallback messages/codes.

## Script and Tooling Policy

1. Scripts may remain `.mjs` when runtime portability and direct Node execution are preferred.
2. All quality-critical scripts must be linted and run in CI.
3. Transitional scripts/config fragments must be removed once no longer needed.

## Legacy and Exception Policy

1. Non-TS or legacy artifacts kept intentionally must be documented with:
   - reason,
   - owner,
   - reevaluation trigger.
2. Temporary exceptions require:
   - explicit note in PR,
   - follow-up task,
   - no silent carry-forward.

## Retained Artifacts

Intentional non-TS artifacts:

1. `scripts/*.mjs` (selected operational scripts)
   - Reason: direct Node ESM execution and operational portability.
   - Owner: repository maintainers.
   - Reevaluate when: script maintenance burden or typing regressions justify TS conversion.

## Typed Ownership Map

Ambient declarations and generated-type ownership:

1. `packages/ui/src/types/global.d.ts`
   - Scope: app-wide UI globals.
   - Owner: UI maintainers.
2. `packages/ui/src/types/vue-grid-layout-v3.d.ts`
   - Scope: third-party module typing coverage.
   - Owner: UI maintainers.
3. `packages/ui/src/vite-env.d.ts`
   - Scope: Vite environment typing.
   - Owner: UI maintainers.
4. `packages/api/src/types/bcryptjs.d.ts`
   - Scope: API third-party module typing coverage.
   - Owner: API maintainers.

Generated typing/model artifacts:

1. `docs/auto/graphql/schema.graphql` and `docs/public/dev/graphql/schema.graphql`
   - Generated from GraphQL schema tooling.
   - Owner: API maintainers.
2. `docs/auto/api/*` and `docs/public/dev/api/*`
   - Generated API documentation artifacts.
   - Owner: repository maintainers.

## Validation Baseline

Run for every TypeScript-sensitive change:

```bash
npm run format:check
npm run lint
npm run check:ts:debt
npm run check:ts:source-artifacts
npm run typecheck
npm run test
npm run build:verify
```

For UI/runtime-affecting changes also run:

```bash
npm run test:e2e:smoke
```

## TypeScript Regression Prevention Checklist

Apply this checklist to TS-sensitive PRs:

1. No `any`, `as unknown as`, `@ts-ignore`, or `@ts-nocheck` introduced.
2. New trust-boundary parsing starts at `unknown` and narrows with guards.
3. New `.d.ts` additions include scope + owner in this document.
4. `npm run lint`, `npm run check:ts:debt`, `npm run check:ts:source-artifacts`, and `npm run typecheck` are all green.
5. If runtime behavior changed, tests/docs were updated in the same PR.
