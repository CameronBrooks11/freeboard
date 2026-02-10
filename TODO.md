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
- [ ] Add focused tests for runtime + widget lifecycle + serialization
- [ ] Add CI job(s) for critical test and lint gates
- [x] Update docs for runtime contract and migrated widgets

## Misc Tasks

- [ ] npm deprecication warnings investigation/fixes
- [ ] Formatting review and clean up (should have package.json commands for this where relevant)
- [ ] Unicode or latex or some kind of support such that gauge units can have proper degree symbol (\deg C, °\deg F) instead of hardcoding (°C, °F)

## Longer-Term Tasks

- [ ] Secure environment variable store
- [ ] i18n: externalize strings and labels
- [ ] docker versions package tags to ensure re-pull on version bump
