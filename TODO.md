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

- [x] Review the archived `oauth` branch to look at the oauth package and determine if any of that work can be salvaged or should be reimplemented from scratch with learnings from the phased model implementation
- [x] npm deprecication warnings investigation/fixes (addressed in node 24.x and npm 11.x baseline pinning)
- [ ] Formatting review and clean up (should have package.json commands for this where relevant)
- [ ] Unicode or latex or some kind of support such that gauge units can have proper degree symbol (\deg C, °\deg F) instead of hardcoding (°C, °F)
- [ ] Add tokei + misc (workflow from `anolis`) to track codebase stats and health over time

## Longer-Term Tasks

- [ ] Secure environment variable store
- [ ] i18n: externalize strings and labels
- [ ] docker versions package tags to ensure re-pull on version bump
- [ ] Service accounts / machine-to-machine auth: scoped API tokens, rotation/revocation, audit trail, and admin management UX (defer until after current phased model rollout)
- [ ] Switch to using pnpm workspaces for better monorepo management and performance (defer until after current phased model rollout; must add the lock file to metrics workfow ignore etc.)
- [ ] Switch from MongoDB to something better suited and widely compatible (e.g. see the Raspberry Pi compatibility issues with MongoDB and the general overhead of running a MongoDB instance for a dashboard app; defer until after current phased model rollout). Needs to be considered carefully of what we want our data model to look like and which solution we good as our long-term data store (e.g. file-based like lowdb or sqlite, embedded like nedb, or server-based like postgres or redis). We should also consider the implications for our data access layer and how we structure our code to allow for easier swapping of the underlying data store in the future if needed.
