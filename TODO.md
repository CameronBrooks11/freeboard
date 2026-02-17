# TODO

## Immediate / High Priority

- [ ] None at this time.

## Deferred / Re-evaluate Later

- [ ] **Database migration**: Evaluate alternatives to MongoDB for better Raspberry Pi compatibility and lighter ops footprint; requires data-layer abstraction and migration plan. Defer unless operational pain persists after current Pi/Mongo guidance and provisioning hardening.
- [ ] **i18n/l10n**: Externalize UI strings and labels for internationalization. Defer until there is confirmed multi-locale demand and stable copy/UX surface.
- [ ] **pnpm workspaces migration**: Faster installs and stricter dependency isolation. Defer unless npm workspace performance/reproducibility becomes a sustained issue.
- [ ] **UI build memory hardening**: Replace Node heap workaround with architectural improvements (route/component lazy-loading and explicit Vite `manualChunks` for heavy modules such as Monaco/admin/editor surfaces). Keep heap tuning only as a temporary guardrail.
- [ ] **Apollo Client v4 migration (when officially supported)**: Revisit upgrade once `@vue/apollo-composable` (or an approved replacement integration) has first-class Apollo v4 compatibility, then run a planned migration instead of shims/workarounds.
