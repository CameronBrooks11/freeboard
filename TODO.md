# TODO

## Immediate Tasks

- [x] Set up widget runtime foundations (`ReactiveWidget`, binding resolver, template resolver)
- [x] Define and enforce widget plugin contract at registration time
- [x] Reimplement core widgets with clean runtime architecture: Text, Indicator, Gauge
- [x] Register new core widgets in app bootstrap alongside `BaseWidget`
- [x] Pass normalized datasource snapshot/context through dashboard update flow
- [x] Add datasource title uniqueness validation (required for deterministic binding paths)
- [x] Add runtime widget error state/channel and non-crashing UI fallback
- [x] Add pane min-height calculation + resize clamping to content minimum

## Subsequent Tasks

- [x] Implement next widget set with same runtime patterns: Pointer, Picture, HTML
- [x] Implement advanced widgets: Sparkline, Map
- [x] Add focused tests for runtime + widget lifecycle
- [x] Add focused tests for serialization/pane sizing smoke paths
- [x] Add CI job(s) for critical test and lint gates
- [x] Update docs for runtime contract and migrated widgets
- [x] Raise a PR and verify required PR CI runs/passes (`Required CI`)
- [x] Change default branch to `main`
- [x] Create branch protection rules to enforce PR reviews and CI passing before merge
- [x] Test and verify branch protection rules are working as expected (e.g. by attempting to merge a PR with failing CI or without required reviews)

## Misc Tasks

- [ ] npm deprecication warnings investigation/fixes
- [ ] Formatting review and clean up (should have package.json commands for this where relevant)
- [ ] Unicode or latex or some kind of support such that gauge units can have proper degree symbol (\deg C, °\deg F) instead of hardcoding (°C, °F)
- [ ] Add tokei + misc (workflow from `anolis`) to track codebase stats and health over time
- [x] Review the archived `oauth` branch to look at the oauth package and determine if any of that work can be salvaged or should be reimplemented from scratch with learnings from the phased model implementation

## Longer-Term Tasks

- [ ] Secure environment variable store
- [ ] i18n: externalize strings and labels
- [ ] docker versions package tags to ensure re-pull on version bump
- [ ] Service accounts / machine-to-machine auth: scoped API tokens, rotation/revocation, audit trail, and admin management UX (defer until after current phased model rollout)
