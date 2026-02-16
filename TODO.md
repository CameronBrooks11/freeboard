# TODO

## Deferred Strategic Work

The following items are intentionally deferred for Phase 8+ to avoid blocking current progress and allow for more comprehensive planning:

- [ ] **Service accounts / M2M auth**: Scoped API tokens, rotation/revocation, audit trail, admin UX (requires Phase 6 session patterns as foundation)
- [ ] **pnpm workspaces migration**: Faster installs, better monorepo dependency isolation (requires planning for lock file compatibility in CI/metrics workflows)
- [ ] **Database migration**: Evaluate alternatives to MongoDB for better Raspberry Pi compatibility and lighter operational footprint (sqlite, postgres, nedb, lowdb). Requires careful data model redesign and data access layer abstraction planning.
- [ ] **i18n/l10n**: Externalize UI strings and labels for internationalization (requires stable UI component surface after Phase 7 store refactor)
- [ ] **Metrics dashboard**: implement basic health and performance metrics collection (e.g. response times, error rates) and expose via a simple dashboard (admin dashboard or separate monitoring interface)
