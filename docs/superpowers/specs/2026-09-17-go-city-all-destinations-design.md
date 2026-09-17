# GO City All Destinations Design

## Goal
Complete the Route core duty without inventing fake UI capabilities: Factory, MIMIR, Linear, and Browser must be explicit canonical destinations, each enforced at the boundary where that capability really runs, with exact Centre identity, return/refit/exit rules, and regression coverage against bypasses.

## Route law
`Centre identity -> Optician fit -> canonical City destination -> real capability boundary -> reality/evidence -> Return Address -> refit if reality changed -> Heimdall exit -> Bifrost -> BIG chat`

Core duty is complete before optional improvements. A route is not complete merely because a module exists; the active caller and backend boundary must enforce the contract.

## Destination topology
- `destination://factory`: Code/Factory capability. Active shell path plus governed Factory MCP mutations/Foreman/merge.
- `destination://mimir`: MIMIR Catalog/Knowledge service through MCP. Information search remains evidence-gated and returns to the originating work context.
- `destination://linear`: Linear service through MCP. Mutations require exact City work context; read-only discovery remains usable as observation before a mutation route is selected.
- `destination://browser`: Browser reality-reading edge route. Host/owner policy remains, and routed reads additionally require exact Browser work context rather than being an unscoped City bypass.

## Shared route contract
Create one small route-contract module that owns canonical destination strings and exact work-context validation. `checkpointId` must equal `returnAddress`; `destination` must be canonical and match the expected boundary. This removes duplicated route strings and prevents a caller from presenting Factory context to MIMIR/Linear/Browser.

## City route
`go-hub-city-route.js` exposes all four destinations. `routeInbound()` accepts only an Optician PASS whose route and destination id agree with the canonical registry. Unknown/mismatched destinations fail closed instead of entering the work loop.

## Shell
The shell remains the Code/Factory workstation; it must not pretend MIMIR/Linear/Browser are local Code capabilities. Its Factory path uses the same canonical route contract rather than a private destination string. Shell handoff must still run Optician then City Route before Centre leave.

## MIMIR and Linear
MIMIR MCP calls already carry work context and must validate against the shared contract. Linear mutations must do the same. Read-only Linear list/get can remain direct observation because they do not change state and are useful before routing a mutation.

## Browser
Browser REST is a real capability boundary. A routed `/hub/api/browser/read` request carries `workContext` and is rejected if the context is missing, identity is inconsistent, or destination is not `destination://browser`. Existing host allowlist and owner-passcode checks remain mandatory.

## Return, refit, exit
Destination returns preserve `workId` and `checkpointId`. After a returned reality snapshot, `checkRound()` determines `REUSE_FIT` vs `REFIT`. Exit remains Heimdall-owned: only a PASS may proceed to Bifrost/chat; Heimdall is not inserted into inbound routing.

## Bypass policy
Read-only source observation may occur before a work route is selected. State-changing Factory and Linear operations must keep governed work context. Browser routed reads must not bypass City identity. Direct GitHub workspace mutations from the shell must carry Factory work context to the REST boundary; merge itself remains Foreman-owned via the governed MCP merge path and must not be exposed as a shell bypass.

## Completion gate
Before calling Route complete, tests must cover: all canonical destinations, route mismatch fail-closed, Factory shell wiring, MIMIR/Linear boundary destination enforcement, Browser work-context enforcement plus host policy, Factory REST mutation work-context enforcement, return identity, refit on changed reality, Heimdall exit, publication assets, and an end-to-end route contract sweep.
