# GO City All Destinations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Factory, MIMIR, Linear, and Browser explicit governed GO City routes with exact work-context enforcement, return/refit/exit behavior, and bypass regression tests.

**Architecture:** Add one shared route contract for destination constants and identity validation. City Route consumes it for inbound routing; each real capability boundary consumes it according to its transport. The shell remains a Factory workstation but uses the shared contract and sends Factory context on mutation requests rather than inventing parallel destination logic.

**Tech Stack:** JavaScript ES modules, Cloudflare Worker APIs, Node `node:test`, existing GO Hub Factory lifecycle.

**Spec:** `docs/superpowers/specs/2026-09-17-go-city-all-destinations-design.md`

## Global Constraints
- Core Duty before Improvement.
- No fake destination UI: wire each destination at its real capability boundary.
- Optician owns inbound fit/routing; Heimdall owns outbound safety/exit.
- `checkpointId === returnAddress` for routed work.
- Unknown or mismatched destination fails closed.
- Read-only observation may remain available before route selection; mutations must carry the correct City work context.
- TDD: every behavior change starts with a failing test.

---

### Task 1: Shared City Route Contract

**Files:**
- Create: `go-hub-route-contract.js`
- Create: `tests/go-hub-route-contract.test.cjs`
- Modify: `go-hub-city-route.js`
- Modify: `tests/go-hub-city-route.test.cjs`

**Interfaces:**
- Produces: `CITY_DESTINATIONS`, `getCityDestination(routeOrId)`, `assertCityWorkContext(value, expectedDestination)`.
- `routeInbound({ fit })` only admits a canonical route/id pair.

- [ ] Write tests asserting four destinations: factory/mimir/linear/browser; exact identity; wrong destination rejected; unknown destination rejected.
- [ ] Run the focused tests and confirm RED because the shared contract/all destinations do not exist.
- [ ] Implement the route contract and update City Route to consume it.
- [ ] Run focused tests and confirm GREEN.
- [ ] Commit.

### Task 2: MIMIR and Linear Boundaries Use the Shared Contract

**Files:**
- Modify: `go-hub-mcp-registry.mjs`
- Modify: `tests/go-hub-mcp-registry.test.cjs`

**Interfaces:**
- Consumes: `assertCityWorkContext` and canonical destination constants.
- MIMIR search requires MIMIR context.
- Linear create/update requires Linear context.
- Factory mutation/Foreman path requires Factory context.

- [ ] Add tests that each boundary rejects another destination while valid exact context passes.
- [ ] Run focused registry tests and confirm RED after switching expectations to the shared validator.
- [ ] Replace duplicated destination/work-context validation with the route contract.
- [ ] Run tests and confirm GREEN.
- [ ] Commit.

### Task 3: Browser Becomes a Governed City Destination

**Files:**
- Modify: `go-hub-edge-worker.mjs`
- Modify: `tests/go-hub-browser-worker.test.cjs`
- Modify: `tests/go-hub-browser-owner-auth.test.cjs`

**Interfaces:**
- `/hub/api/browser/read` body consumes `{ url, waitUntil?, workContext }`.
- `workContext.destination` must equal `destination://browser`; identity must be exact.
- Existing host allowlist and passcode gates remain unchanged.

- [ ] Add tests for missing Browser work context, wrong destination, mismatched Return Address, and valid Browser context.
- [ ] Run focused browser tests and confirm RED.
- [ ] Validate Browser context before calling `createBrowserInterface().readPage()`.
- [ ] Run tests and confirm GREEN including existing host/auth behavior.
- [ ] Commit.

### Task 4: Factory REST Mutation Bypass Is Closed

**Files:**
- Modify: `go-hub-github-workspace.js`
- Modify: `go-hub-worker.mjs`
- Modify: `tests/go-hub-github-workspace.test.cjs`
- Modify: `tests/go-hub-worker-workstation.test.cjs`

**Interfaces:**
- `createGitHubWorkspace({ ..., workContext })` carries Factory context on mutation requests: create branch, write/delete, PR open, rerun.
- Worker mutation endpoints require `destination://factory` exact context.
- Read-only inspect/read/compare/CI remain observation paths.
- Direct REST merge remains unavailable to the active shell route; governed merge stays MCP+Foreman.

- [ ] Add failing client tests asserting mutation payloads include Factory context.
- [ ] Add failing worker tests rejecting missing/wrong mutation context.
- [ ] Implement client propagation and worker validation with the shared route contract.
- [ ] Verify focused tests GREEN.
- [ ] Commit.

### Task 5: Shell Uses Canonical Factory Route and Round Refit

**Files:**
- Modify: `go-hub-shell.js`
- Modify: `tests/go-hub-shell.test.cjs`
- Modify: `tests/go-hub-runtime-roundtrip.test.cjs`

**Interfaces:**
- Shell imports canonical Factory destination from route contract.
- Workspace receives work context only after Centre handoff/admission.
- Returned reality is checked with `checkRound(previousFit, { context, reality })`; changed reality produces REFIT before another handoff.

- [ ] Add failing tests removing private Factory route literal ownership and requiring `checkRound`/REFIT behavior.
- [ ] Run focused tests and confirm RED.
- [ ] Refactor shell Factory routing to canonical contract and preserve the fit used for the round.
- [ ] On return, evaluate round change before allowing the next outbound route; preserve Centre identity.
- [ ] Run focused tests and confirm GREEN.
- [ ] Commit.

### Task 6: Heimdall Exit and End-to-End Route Sweep

**Files:**
- Modify: `tests/go-hub-city-route.test.cjs`
- Modify/Create: `tests/go-hub-route-e2e.test.cjs`
- Modify publication tests/manifests only if the new route-contract file is a production dependency.

**Interfaces:**
- E2E contract: Centre -> Optician -> one of four canonical destinations -> return identity -> optional refit -> Heimdall -> Bifrost/chat.

- [ ] Add E2E tests for all four destination registry routes and fail-closed mismatches.
- [ ] Add return/refit/Heimdall exit tests using real modules rather than string-only source scans.
- [ ] Run E2E tests and confirm RED for any missing wiring.
- [ ] Make only the minimal production/publication changes needed.
- [ ] Run focused tests, full `npm test`, syntax, UTF-8, no-ride/publication gates.
- [ ] Inspect branch diff against main and ensure no unrelated changes.
- [ ] Open PR and verify exact-head CI.
- [ ] Stop at Hephaestus/merge gate if structured Factory evidence or lane ownership is unavailable; do not fabricate evidence or bypass the gate.
