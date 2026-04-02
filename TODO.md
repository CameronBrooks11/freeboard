# TODO

## Immediate / High Priority

- [ ] **Accessibility**: Conduct a thorough accessibility audit and implement necessary improvements to meet WCAG 2.1 AA standards. Defer until we have a stable UI surface and can allocate dedicated resources for accessibility work.
- [ ] **A11y**: Add automated accessibility testing to CI pipeline (e.g., axe-core integration) to catch regressions early. Defer until we have a stable UI surface and can allocate dedicated resources for accessibility work.
- [ ] **i18n/l10n expansion**: Baseline translation workflow is in place; add and maintain non-English locales only when there is sustained contributor demand.
- [ ] **Versioning strategy**: Evaluate, adopt, and enforce a formal versioning strategy (e.g. SemVer) for consistent release management and communication. Defer until we have a stable release cadence and process in place to ensure versioning discipline is sustainable.

## Backlog / Medium Priority

- [ ] **Changelog**: Slowly work through and backfill changelog entries for all past releases, then maintain going forward. Defer until we have a stable release cadence and process in place to ensure changelog maintenance is sustainable.

## Deferred / Re-evaluate Later

- [ ] **pnpm workspaces migration**: Faster installs and stricter dependency isolation. Defer unless npm workspace performance/reproducibility becomes a sustained issue.
- [ ] **AJV lint-chain audit advisory**: Track upstream ESLint ecosystem updates to remove transitive `ajv <8.18.0` advisory without forcing global overrides (global AJV override currently breaks lint runtime behavior).
- [ ] **Rolldown `manualChunks` → `codeSplitting` migration**: `rolldownOptions.output.manualChunks` function form is deprecated in Rolldown (used inside Vite 8). The Rolldown docs mark it as a Rollup compatibility shim and point to `output.codeSplitting` as the replacement. Currently functional with no removal timeline. Migrate before the next Rolldown/Vite major that drops the shim.
- [ ] **dompurify audit advisory via monaco-editor**: `monaco-editor@0.55.1` pins `dompurify@3.2.7` (CVE: GHSA-h8r8-wccr-v5f2, moderate). npm workspace overrides cannot re-resolve this transitive dep. Not directly exploitable — freeboard code never calls DOMPurify; monaco uses it internally for hover/markdown rendering. Not flagged by `security:audit:prod` (`--audit-level=high`). Resolve when `monaco-editor` ships a release with `dompurify >=3.3.2`, or if risk profile changes.
- [x] **Apollo Client v4 migration**: Completed — upgraded to `@apollo/client@4.1.6`, updated error handler to `CombinedGraphQLErrors` API, and fixed SSE `operationName` compatibility (PR #78).
