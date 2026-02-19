# TypeScript Retained Legacy Manifest

This file tracks intentional non-TS or legacy artifacts retained after TS completion.

## Current Entries

1. `scripts/*.mjs` (selected operational scripts)
   - Reason: direct Node ESM execution and operational portability.
   - Owner: repository maintainers.
   - Reevaluate when: script maintenance burden or typing regressions justify TS conversion.

## Notes

1. This manifest should remain small.
2. Remove entries as soon as artifacts are retired.
3. Do not use this document to justify temporary migration leftovers.
