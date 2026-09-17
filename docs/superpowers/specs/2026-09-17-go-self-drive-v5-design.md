# GO Self-Drive V5 Design

## Status
Owner-approved architecture direction. This document replaces the old mandatory rail/gate model as the target architecture for the next implementation round.

## Goal
Make GO move directly between real work stations without a mandatory Optician, Centre, or Heimdall travel gate, while preserving work identity, Factory governance, source reality, and one explicit hard gate: Hephaestus for governed Factory actions.

The intended system law is:

`GO chooses -> Route resolves -> Station works -> Station reports reality -> GO chooses next`

Supporting systems observe and advise; they do not silently become route authorities.

## Core laws
1. **GO self-drives.** GO chooses the next station and may move directly between stations.
2. **Identity is not permission.** `workId` and work context travel with the work, but possessing or validating identity is not a reason to require Optician/Centre approval.
3. **Station owns reality.** Each station owns its internal truth. Shared monitoring derives from station truth and does not become a second business state.
4. **Soft checks stay soft.** Relevance/context checks may warn but must not block movement.
5. **One explicit hard gate.** Hephaestus may block governed Factory actions that require Factory admission/ownership/evidence. Hephaestus does not own city travel.
6. **Dashboard observes.** Dashboard is read-mostly monitoring and drill-down, not a route controller.
7. **Optician advises.** Optician may report traffic/context mismatch/re-fit advice but cannot grant or deny travel.
8. **Heimdall reports return state.** Heimdall summarizes the completed or current round for BIG/GO; it is not a permission/stop gate.
9. **Core duty before improvement.** Preserve working governance and evidence boundaries before adding richer monitoring/UI.

## Scope
This design changes how these components relate:
- City Route
- Centre
- Optician
- Library / MIMIR search entry
- Factory / Hephaestus boundary
- Verification
- Heimdall
- shared Traffic Summary
- Dashboard and per-station monitors
- runtime/session/connection reconciliation

It also defines how existing PR73 work should be treated. PR73 must not be merged unchanged because it strengthens the superseded mandatory rail model.

## Non-goals
- Rebuilding Factory internals that already enforce governed mutation correctly.
- Replacing Hephaestus/Foreman merge ownership.
- Making Dashboard the source of station truth.
- Forcing every station to expose identical internal detail schemas or identical UI.
- Creating a new universal Context Gate.
- Treating Notion internal zones as separate GO City stations.

## 1. Route Core

### Responsibility
Route resolves a requested destination into a known station/capability boundary. Route does not approve whether GO is allowed to think about or travel to a station.

### Required behavior
- GO may select a canonical destination directly.
- Unknown destinations fail closed as unresolved/unknown, not as "return to Optician".
- Direct station-to-station movement is valid, for example:
  - `Factory -> Library -> Factory`
  - `Library -> Verification`
  - `Verification -> Factory`
- `workId` remains stable across station changes.
- Changing station must not create duplicate work.
- A return address may be carried as continuity metadata but is not a mandatory physical route through Centre.

### Canonical destinations
Keep a small canonical registry for real capability boundaries. The registry is naming/identity infrastructure, not an admission gate.

## 2. Centre

### New role
Centre becomes a durable work/session anchor rather than mandatory city entry/exit.

### Keep
- work identity
- task
- requested result
- owner/authority metadata
- durable session/persistence where useful

### Remove as mandatory flow
- "must enter/review Centre before every destination"
- "must leave Centre before capability access"
- "must return to Centre every round"
- Centre state as travel permission

Centre may still be visited explicitly when GO needs to review/reframe/resume work.

## 3. Optician

### New role
Traffic/context advisor.

### May do
- read the same shared Traffic Summary as Dashboard
- report station load/availability/problem signals
- compare current work context with new reality
- recommend re-fit/re-frame when context changed
- suggest options such as wait, continue, or use another station

### Must not do
- emit a travel `PASS/WAIT` that Route must obey
- require lens fitting before station movement
- select the destination on GO's behalf
- keep a private competing traffic truth

Existing reality fingerprint/check-round logic may be retained only if converted to advice rather than travel permission.

## 4. Library / MIMIR

### External shape
`GO -> Library -> Search Adapter -> Source -> Return`

Library is one station. Work/Learning/Ideas remain internal Notion organization and are not Hub routes.

### Soft relevance check
Before search, Library asks only:
1. `ตอนนี้ทำอะไร`
2. `หาอะไร`
3. `เกี่ยวไหม`

The check may warn when the query is weakly related to current work. It must never block search.

### Search contract
Library returns usable source context where available:
- source/reference
- freshness/timestamp where known
- relevance signal where useful
- conflict/no-match signal where useful

The search adapter may later change from regular Notion Search to Notion AI Search without changing the Hub/Library route contract. AI search is not truth authority.

## 5. Factory and Hephaestus

### Preserve
- Factory work context on state-changing repository actions
- governed mutation boundaries
- direct REST merge closed
- Foreman/Hephaestus ownership of governed merge
- Factory-internal queue/QC/evidence behavior that is already valid

### Change
GO must be able to enter/leave Factory without Optician travel permission or Centre `AWAY` being the travel authorization.

### Hephaestus hard-gate boundary
Hephaestus is the only explicit architecture-level hard gate in this design. It may block only governed Factory actions whose contract requires ownership/evidence/slot/admission, such as governed assembly/merge paths as defined by Factory.

Hephaestus must not:
- block GO from visiting Factory
- decide GO's next city destination
- duplicate Verification as a universal checker

Every Hephaestus block must have a concrete Factory reason/evidence state.

## 6. Verification

Verification reports reality/evidence for the requested result.

Required outcome vocabulary:
- `PASS`
- `FAIL`
- `UNKNOWN`

Verification must not automatically become a city travel gate. GO decides what to do with the result unless a specific governed Factory action separately requires verified evidence.

Before implementation, audit current verification modules to distinguish:
- Factory-internal QC
- independent Verification station behavior

Do not create duplicate checks under two names.

## 7. Heimdall

### New role
Return Reporter / Exit Observer.

### Remove
- generic `PERMISSION`
- generic `STOP`
- `WAIT` as a condition that traps the route at Heimdall
- mandatory return-to-Optician behavior

### Report
Heimdall may summarize:
- what work was attempted
- where GO went
- what result/reality returned
- verification status
- unresolved/blocking facts
- important references
- recommended next attention point

Suggested return states:
- `READY`
- `CAUTION`
- `INCOMPLETE`
- `UNKNOWN`

These are reporting states, not permission states.

## 8. Shared Traffic Summary

### Purpose
Provide one small read model consumed by both Dashboard and Optician.

### Ownership
Station remains source of truth. Traffic Summary derives/normalizes; it owns no business state.

### Common fields
At minimum:
- `station`
- `status`
- `active`
- `queue`
- `blocked`
- `lastUpdate`

Shared status vocabulary should remain small, for example:
- `NORMAL`
- `BUSY`
- `FULL`
- `ERROR`
- `UNKNOWN`
- `STALE`

A full queue is not automatically an error. Stale data must not be presented as current truth.

## 9. Dashboard

Dashboard is BIG's central monitoring/control-room view, but not a workflow controller.

### Overview
Show each station using the common traffic language only. Keep the overview small enough to scan quickly.

Typical overview signals:
- active count/state
- queue
- status
- blocker if present
- freshness

### Drill-down
Clicking a station opens that station's own monitor. Internal monitor schemas may differ because stations have different behavior.

Examples:
- Factory: Assembly / Merge / Queue / Hephaestus / blockers
- Library: Query / Search / Match / No Match / Conflict / Source
- Verification: Checking / PASS / FAIL / UNKNOWN / Evidence

Dashboard failure must not stop actual station work.

## 10. Runtime / Connection

Audit and preserve explicit ownership of:
- session
- auth expiry
- worker/transport lifecycle
- reconnect
- resume/reconcile

A disconnected/stale station must not continue appearing as fresh `ACTIVE` truth. Reconnect should reconcile source reality and must not duplicate work.

Connection health may be summarized as:
- `ONLINE`
- `DEGRADED`
- `OFFLINE`
- `UNKNOWN`

## 11. Treatment of PR73

PR73 contains useful work and superseded control-flow assumptions.

### Preserve or reuse conceptually
- canonical destination registry
- shared identity/work-context validation where it protects real mutation/capability boundaries
- Factory mutation context propagation
- direct REST merge closure
- Foreman-owned merge
- publication/test scaffolding that remains valid

### Do not merge unchanged
- mandatory Optician `PASS` inbound route
- Centre as mandatory entry/exit travel gate
- required return/refit before another trip
- Heimdall as outbound permission/stop gate
- tests/spec text that assert the rail model as the intended architecture

The implementation plan should cherry-pick/recreate valid pieces intentionally rather than merge the whole branch by default.

## 12. Data flow

Primary movement:

`GO -> Route.resolve(destination) -> Station`

Monitoring:

`Station Reality -> Traffic Adapter -> Shared Traffic Summary -> Dashboard + Optician`

Library search:

`GO -> Library Soft Check -> Search Adapter -> Source -> GO`

Factory governed mutation:

`GO -> Factory -> governed action -> Hephaestus/Foreman when required -> evidence/result -> GO`

Return reporting:

`Current result + Verification evidence -> Heimdall summary -> BIG/GO`

No general step in these flows may silently reintroduce mandatory Optician/Centre/Heimdall travel permission.

## 13. Error handling

- Unknown destination: return unresolved/unknown destination error; do not silently reroute through Optician.
- Missing identity on actions that require governed identity: reject that action at its real boundary.
- Library relevance mismatch: warn only.
- Traffic source unavailable/stale: expose `UNKNOWN`/`STALE`; do not fabricate normal status.
- Verification cannot prove result: `UNKNOWN`, not guessed `PASS`.
- Factory hard-gate requirement missing: Hephaestus blocks the governed Factory action with explicit reason/evidence gap.
- Dashboard unavailable: no effect on station operation.

## 14. Migration order

Implementation must follow this dependency order:

1. Audit current route/gate behavior against this design.
2. Separate identity from travel permission.
3. Convert Centre from mandatory gate to session/work anchor.
4. Convert Optician from gate to advisor.
5. Preserve and revalidate Factory/Hephaestus governance.
6. Add Library soft relevance check.
7. Audit/split Verification responsibilities without duplication.
8. Convert Heimdall to reporter.
9. Create shared Traffic Summary adapters.
10. Build Dashboard overview.
11. Build per-station drill-down monitors.
12. Audit connection/reconnect/freshness.
13. Run regression and E2E sweep.
14. Remove old rail contracts/tests/docs once replacements are proven.

Do not build Dashboard before the shared traffic read model exists.

## 15. Acceptance criteria

The architecture is not complete until all of the following are proven:

- GO can move `Factory -> Library -> Factory` without an Optician travel gate.
- GO can move to Verification without returning through Centre first.
- Station switching preserves the same work identity without duplicating work.
- Optician advice may warn/recommend but cannot block movement.
- Library soft relevance check appears before search and cannot block search.
- Centre persists useful work/session identity but is not mandatory for every station hop.
- Heimdall reports `READY/CAUTION/INCOMPLETE/UNKNOWN` without blocking return to BIG/GO.
- Hephaestus still blocks governed Factory actions that lack required ownership/evidence.
- Factory mutation governance and direct-REST-merge closure remain intact.
- Verification reports `PASS/FAIL/UNKNOWN` with evidence and does not duplicate Factory QC.
- Dashboard and Optician display the same Traffic Summary truth.
- Traffic freshness is visible; stale/unavailable data is not shown as current normal state.
- Dashboard outage does not stop work.
- No active test, runtime path, publication statement, or manifest still claims mandatory Optician/Centre/Heimdall city travel gates.
- Final E2E proves free movement plus preserved Factory governance.

## Final architecture statement

**Freedom of movement + context discipline + shared reality + one hard gate.**

GO drives. Route resolves. Stations own reality. Library guards context softly. Optician advises. Dashboard observes. Verification reports. Heimdall summarizes. Hephaestus alone may hard-block governed Factory actions.