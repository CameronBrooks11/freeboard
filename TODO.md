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
- [x] **Apollo Client v4 migration**: Completed — upgraded to `@apollo/client@4.1.6`, updated error handler to `CombinedGraphQLErrors` API, and fixed SSE `operationName` compatibility (PR #78).
