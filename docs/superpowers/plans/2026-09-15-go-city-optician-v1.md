# GO City Optician v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved GO City Optician as the entry and per-round gate that fits context/lens/route without owning destination work.

**Architecture:** Keep the approved city road contract in `go-hub-city-route.js`. Add a focused `go-hub-optician.js` that accepts 5W/context truth, fits a lens and route from supplied candidates, and returns a gate decision. The Optician never executes Factory/MIMIR/other capabilities; it only returns route/gate evidence. Re-checks can reuse the prior fit while Reality/context remains materially unchanged, and refit when it changes.

**Tech Stack:** JavaScript ES modules, Node `node:test`, existing GO Hub immutable/snapshot conventions.

**Spec:** Owner-approved chat design on 2026-09-15; city route contract on branch `feat/city-road-checkpoint`.

## Global Constraints

- Factory menu is already passed: do not modify its UI or make it city centre.
- Entry responsibility is `5W -> LENS -> GATE`.
- Work loop remains `GO -> ACTION -> REALITY -> PROGRESS`, with Optician checking each round.
- MIMIR is city-wide information/navigation, not Optician ownership.
- Heimdall owns exit readiness/safety; Optician must not absorb exit responsibility.
- Reuse existing routes/capabilities by reference; do not embed destination implementations.
- Missing required context/evidence must fail closed as WAIT, not guessed PASS.

---

### Task 1: Define Optician fitting contract

- [ ] Add failing tests in `tests/go-hub-optician.test.cjs` for complete 5W fit, incomplete context WAIT, and destination-reference-only routing.
- [ ] Verify the new tests fail because `go-hub-optician.js` does not exist.
- [ ] Add minimal `go-hub-optician.js` implementation.
- [ ] Verify focused tests pass.

### Task 2: Add round re-check behavior

- [ ] Add failing tests proving unchanged Reality/context reuses the current fit and changed Reality/context requests REFIT.
- [ ] Verify expected RED.
- [ ] Implement deterministic context/reality fingerprint and round gate decision.
- [ ] Verify focused tests pass.

### Task 3: Integrate with city route contract

- [ ] Add failing integration test proving Optician routes into `go-work-loop`, references Factory only as a destination, and leaves Heimdall/Bifrost exit routing untouched.
- [ ] Verify expected RED.
- [ ] Add minimal integration helpers/references without changing `go-hub.html` Factory menu.
- [ ] Run focused Optician + city-route tests.
- [ ] Run repository CI on exact branch head and only merge when exact-head evidence is green.
