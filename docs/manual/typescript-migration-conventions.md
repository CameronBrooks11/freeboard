# TypeScript Standards and Governance

This document defines the post-migration TypeScript baseline for Freeboard.

## Baseline Requirements

1. TypeScript strictness is the default posture.
2. Product source lives in TS-first paths:
   - `packages/ui/src`
   - `packages/api/src`
   - `packages/gateway/src`
3. CI must enforce:
   - lint,
   - TS debt checks,
   - migration-artifact checks,
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
3. Migration-only scripts/config fragments must be removed once no longer needed.

## Legacy and Exception Policy

1. Non-TS or legacy artifacts kept intentionally must be documented with:
   - reason,
   - owner,
   - reevaluation trigger.
2. Track retained artifacts in `docs/manual/typescript-retained-legacy-manifest.md`.
3. Temporary exceptions require:
   - explicit note in PR,
   - follow-up task,
   - no silent carry-forward.

## Validation Baseline

Run for every TypeScript-sensitive change:

```bash
npm run format:check
npm run lint
npm run check:ts:debt
npm run check:ts:migration-artifacts
npm run typecheck
npm run test
npm run build:verify
```

For UI/runtime-affecting changes also run:

```bash
npm run test:e2e:smoke
```
