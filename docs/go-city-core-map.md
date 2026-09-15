# GO City — Core Map

Status: implementation map
Base truth: `main@9928f69158259af7fdd4c2abb3d16f466e5efd3e`
Owner: BIG
Operator: GO

## Requested Result

Map the existing GO Hub implementation into the approved GO City structure before moving or inventing code. Preserve the Factory menu and already-working Factory machinery as an application/building, not as the city routing core.

## City Map

```text
BIG / CHAT
    |
    v
OPTICIAN — ENTRY / 5W / LENS / GATE
    |
    v
GO WORK LOOP — GO -> ACTION -> REALITY -> PROGRESS -> GO
    |
    +---- FACTORY / other capabilities
    |
    +---- MIMIR — information/navigation
    |
   DONE
    |
    v
HEIMDALL — EXIT READINESS / SAFETY
    |
    +-- not ready -> WORK LOOP
    |
    +-- ready -> BIFROST -> BIG / CHAT
```

## Existing Truth -> City Responsibility

### 1. Optician / Entry

Primary existing fit: `go-hub-centre.js`.

Existing behavior already covers most of the entry responsibility:

- creates Work/Checkpoint identity;
- intakes Task + Requested Result + Authority;
- WAITs when decision-critical intake is incomplete;
- fits a Lens before handoff;
- creates a destination handoff with an explicit Return Address;
- validates returning work identity.

Decision: **reuse and bend; do not replace.**

Gap: the module is named Centre and currently models entry + handoff + return together. GO City should treat its intake/lens/gate behavior as the Optician boundary without renaming code prematurely. A later refactor is justified only if runtime evidence shows the mixed name/responsibility causes friction.

### 2. GO Work Loop

Existing primitives:

- `go-hub-foundation.js` — dispatches an action, commits proposed state, observes Reality through the commit receipt/change boundary, and prevents overlapping commits.
- `go-hub-runtime.js` — registry for capabilities/buildings available to GO.
- `go-hub-centre.js` — handoff/return identity around capability trips.
- Workbench, persistence, evidence and verification modules provide continuity/evidence around the loop.

Decision: **compose existing primitives; do not invent a second controller.**

The conceptual loop is:

`GO decision -> capability/action -> committed/observed result -> progress/evidence -> next GO decision`

A capability is not the loop owner. Factory, MIMIR and future capabilities are destinations used by the loop.

### 3. MIMIR / Information Layer

Primary existing fit: `go-hub-mimir-destination.js` plus the live Notion catalog port.

Existing behavior already:

- receives the same Centre work identity;
- searches catalog using Task + Requested Result + Lens reference;
- applies availability/permission/callable/verification Gate before GO Rating;
- returns PASS or explicit WAIT evidence;
- returns a route when a usable capability is found;
- sends the result back to GO for decision rather than acting as owner.

Decision: **keep MIMIR as information/navigation, not actor/owner.**

This matches GO City directly. No new MIMIR core is required for this phase.

### 4. Factory / Buildings

Existing Factory modules, Workbench, QC, assembly, artifact, GitHub workspace and lifecycle machinery remain application/building internals.

The approved Factory menu is the building entrance. It must not be promoted into city-wide routing.

Decision: **freeze the passed Factory entrance and reuse Factory as one capability destination.**

### 5. Heimdall / Exit

Current closest implementation is distributed rather than represented by one city-level module:

- piece readiness: `go-hub-ready-gate.js`;
- verification: `go-hub-verification-scanner.js`;
- product/assembly QC modules;
- guarded PR/CI/merge/deployment evidence in the GitHub lifecycle.

Important conflict: `go-hub-ready-gate.js` is specifically a Factory Piece -> Assembly gate. It is **not** the GO City exit gate and must not be renamed/reused as Heimdall merely because both are called gates.

Decision: **city-level Heimdall is a real gap.** Reuse evidence produced by existing QC/readiness systems, but keep the responsibility distinct: before Bifrost, decide whether the Requested Result is actually ready/safe to return to BIG. Failure routes back to the Work Loop.

### 6. Bifrost / Return

`go-hub-centre.js` already has exact Return Address and return-packet identity primitives. These can carry the final return path, but Bifrost remains a route/boundary after Heimdall rather than a new work owner.

Decision: **reuse return identity; avoid a new subsystem until a concrete transport responsibility appears.**

## First-Broken-Truth Findings

1. The approved conceptual map is compatible with the current implementation; a rewrite is not justified.
2. MIMIR is already structurally close to its intended city role.
3. Factory is already a destination/building and should stay that way.
4. Entry can be built by fitting `go-hub-centre.js` to the Optician responsibility rather than replacing it.
5. The clearest missing responsibility is **city-level Heimdall exit readiness**. Existing Factory Ready Gate must not be mistaken for it.
6. The GO Work Loop exists as useful primitives but is not yet expressed as one explicit city-level orchestration contract.

## Implementation Order

1. Lock this map as the responsibility reference.
2. Add contract tests that prove existing Centre behavior satisfies Optician entry invariants without breaking existing callers.
3. Define the smallest GO Work Loop orchestration contract by composing Centre + runtime/capability + persistence/evidence; do not duplicate Factory lifecycle.
4. Route MIMIR through that same loop and prove PASS/WAIT returns to GO decision.
5. Define Heimdall from Requested Result + evidence + known limitations; prove FAIL returns to the loop and PASS permits Bifrost return.
6. Only after those contracts are proven, expose/adjust UI navigation if required. Factory menu remains untouched unless evidence shows an integration defect.

## Brakes

- Context is not authority.
- Lens is not actor/owner.
- MIMIR informs/routes; GO decides.
- Factory is a building, not the city core.
- Factory Ready Gate is not Heimdall.
- No new subsystem when an existing primitive fits.
- No rename/restructure solely to make the metaphor visible in filenames.
- No claim of DONE until the Requested Result is verified at the city exit boundary.
