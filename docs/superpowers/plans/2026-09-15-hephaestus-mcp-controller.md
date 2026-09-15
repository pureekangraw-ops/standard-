# Hephaestus MCP Factory Controller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the existing Hephaestus Factory foreman into the live `@GO Hub Factory` MCP path with durable per-repository slot state and a hard pre-merge ownership gate.

**Architecture:** Reuse the existing pure Hephaestus admission/queue/release modules inside a Cloudflare Durable Object keyed by repository. Route live `/mcp` through a focused Factory MCP worker, expose one consolidated `go_hub_factory_foreman` tool for request/release/state, and require active Merge-slot ownership before the existing GitHub merge lifecycle operation may execute.

**Tech Stack:** JavaScript ES modules, Node 22 `node:test`, Cloudflare Workers, SQLite-backed Durable Objects, MCP registry, GitHub REST lifecycle service.

**Spec:** `docs/superpowers/specs/2026-09-15-hephaestus-mcp-controller-design.md`

## Global Constraints

- Canonical flow: `Factory -> Hephaestus -> Assembly(1/repo) -> QC -> Merge(1/repo) -> Verify -> Hephaestus -> Optician`.
- Existing Hephaestus policy modules remain the only admission/queue policy implementation.
- GitHub remains authoritative for repository/PR/CI/merge truth.
- Caller may supply evidence but may not supply a precomputed ADMIT decision.
- Missing Foreman configuration fails closed for Foreman operations and merge.
- `go_hub_merge_pull_request` must verify matching active Merge-slot ownership before GitHub mutation.
- Read/inspect/edit/branch/PR operations remain unchanged.
- Durable state is keyed per repository and stored server-side.
- Merge public commands before multiplying them: one Foreman tool handles request/release/state.
- TDD: failing test first, confirm RED, minimal implementation, then exact-head GREEN.

---

### Task 1: RED contract for live MCP Foreman enforcement

**Files:**
- Create: `tests/go-hub-factory-controller.test.cjs`
- Create: `tests/go-hub-factory-mcp-edge.test.cjs`
- Modify: `tests/go-hub-mcp-registry.test.cjs`

**Interfaces:**
- Expected `HephaestusForeman` and `createFactoryControllerService({ namespace })`.
- Expected MCP tool: `go_hub_factory_foreman` with `request|release|state` action.
- Existing `go_hub_merge_pull_request` gains required `goId` and `jobId`.

- [x] **Step 1: Write controller tests** proving one active Assembly slot plus FIFO queue, stale evidence refusal, Verify-before-release, and missing binding fail-closed.
- [x] **Step 2: Write registry tests** proving one Foreman tool is published and merge requires GO/job identity.
- [x] **Step 3: Write guard test** proving merge without active matching Merge slot never calls GitHub merge.
- [x] **Step 4: Confirm RED in exact-head Safety Gate.** Commit `2a4599beb15bb3517301b86d13173c5800aca630` failed because `go-hub-factory-controller.mjs` did not exist.

### Task 2: Durable Hephaestus controller

**Files:**
- Create: `go-hub-factory-controller.mjs`
- Modify: `wrangler.go-hub.jsonc`
- Modify: `package.json`

**Interfaces:**
- `HephaestusForeman` persists state under `state`.
- `createFactoryControllerService({ namespace })` returns `foreman(input)`, `getState(input)`, `assertActiveMerge(input)`.

- [x] **Step 1: Implement Durable Object wrapper** around existing Hephaestus create/admission/request/release/return functions.
- [x] **Step 2: Re-admit FIFO queue head only after current evidence passes recheck.**
- [x] **Step 3: Configure `HEPHAESTUS`** with SQLite-backed `HephaestusForeman` migration.
- [x] **Step 4: Add controller and existing Hephaestus modules to syntax gate.**
- [ ] **Step 5: Confirm focused/full CI GREEN.**

### Task 3: Live MCP gate and guarded merge

**Files:**
- Create: `go-hub-factory-mcp-worker.mjs`
- Modify: `go-hub-edge-worker.mjs`
- Modify: `go-hub-mcp-registry.mjs`

**Interfaces:**
- `createFactoryGuardedLifecycle({ lifecycle, factory })`.
- `createFactoryMcpWorker({ fetchImpl })`.
- Registry operation `factoryForeman`.
- Existing merge input: `{repository, number, expectedHeadSha, goId, jobId, method?}`.

- [x] **Step 1: Add one Foreman MCP definition** with request/release/state actions.
- [x] **Step 2: Extend merge schema** so `goId` and `jobId` are required.
- [x] **Step 3: Create Factory MCP worker** using `env.HEPHAESTUS` plus the existing GitHub lifecycle and Notion catalog.
- [x] **Step 4: Guard merge** with `assertActiveMerge()` before existing GitHub merge lifecycle; reject with `FACTORY_MERGE_SLOT_REQUIRED` before mutation.
- [x] **Step 5: Route live `/mcp` through Factory MCP at `go-hub-edge-worker.mjs`; other routes delegate unchanged.**
- [x] **Step 6: Add live-edge routing regression test.**
- [ ] **Step 7: Confirm exact-head CI GREEN.**

### Task 4: Full safety gate and review

**Files:**
- Modify only if required by repository gates/publication parity.

- [ ] **Step 1: Inspect exact-head Safety Gate failure evidence, if any.**
- [ ] **Step 2: Fix only evidence-backed defects; do not broaden scope.**
- [ ] **Step 3: Re-run via PR until exact-head Safety Gate is GREEN.**
- [ ] **Step 4: Compare branch against current `main` and verify no live `/mcp` bypass remains in the deployed edge entrypoint.**

### Task 5: Merge and production verification

**Files:**
- No new production files unless verification finds a defect.

- [ ] **Step 1: Merge only after exact PR head CI is green and PR remains mergeable.**
- [ ] **Step 2: Observe main workflow/deploy runs for merge SHA.**
- [ ] **Step 3: Re-list MCP tools and confirm `go_hub_factory_foreman` is published.**
- [ ] **Step 4: Verify Foreman state route non-destructively.**
- [ ] **Step 5: Confirm incorrect Merge-slot ownership is rejected before GitHub mutation.**

## Self-Review

- Spec coverage: Factory entry/exit, Assembly serialization, QC boundary, Merge serialization, Verify-before-release, durable state, live MCP routing, and hard merge gate are mapped to Tasks 1–5.
- Placeholder scan: no TBD/TODO/deferred implementation placeholders remain.
- Type consistency: Foreman/controller/guard names match across production and tests.
- Scope: this closes only the live Factory/MCP authority seam and does not redesign Optician, QC, GitHub lifecycle, or browser-local task state.
