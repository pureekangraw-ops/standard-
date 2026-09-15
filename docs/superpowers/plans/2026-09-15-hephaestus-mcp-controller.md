# Hephaestus MCP Factory Controller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the existing Hephaestus Factory foreman into the live `@GO Hub Factory` MCP path with durable per-repository slot state and a hard pre-merge ownership gate.

**Architecture:** Reuse the existing pure Hephaestus admission/queue/release modules inside a Cloudflare Durable Object keyed by repository. Add a thin Factory controller service used by the MCP Worker; add explicit MCP tools for slot request/release/state and require an active merge slot before the existing GitHub merge lifecycle operation may execute.

**Tech Stack:** JavaScript ES modules, Node 22 `node:test`, Cloudflare Workers, SQLite-backed Durable Objects, MCP registry, GitHub REST lifecycle service.

**Spec:** `docs/superpowers/specs/2026-09-15-hephaestus-mcp-controller-design.md`

## Global Constraints

- Existing Hephaestus policy modules remain the only admission/queue policy implementation.
- GitHub remains authoritative for repository/PR/CI/merge truth.
- Caller may supply evidence but may not supply a precomputed ADMIT decision.
- Missing Foreman configuration fails closed for Factory slot operations and merge.
- `go_hub_merge_pull_request` must verify matching active Merge-slot ownership before GitHub mutation.
- Read/inspect/edit/branch/PR operations remain unchanged.
- Durable state is keyed per repository and stored server-side.
- TDD: failing test first, confirm RED in PR CI, then production code, then confirm GREEN.

---

### Task 1: RED contract for live MCP Foreman enforcement

**Files:**
- Create: `tests/go-hub-factory-controller.test.cjs`
- Modify: `tests/go-hub-mcp-registry.test.cjs`
- Modify: `tests/go-hub-mcp-worker.test.cjs`

**Interfaces:**
- Expected future `createFactoryControllerService({ namespace })`.
- Expected future MCP tools: `go_hub_factory_request_slot`, `go_hub_factory_release_slot`, `go_hub_factory_get_state`.
- Existing `go_hub_merge_pull_request` gains required `goId` and `jobId` and must fail before lifecycle merge if slot ownership is absent.

- [ ] **Step 1: Write controller tests** proving persisted repository state, FIFO slot ownership, server-side admission evaluation, and fail-closed missing namespace.
- [ ] **Step 2: Write registry tests** proving the three Factory tools are published and merge requires GO/job identity.
- [ ] **Step 3: Write Worker test** proving a merge request with no active matching Foreman Merge slot never calls upstream GitHub.
- [ ] **Step 4: Open/update the PR and inspect exact-head Safety Gate.** Expected: RED because Factory controller/tool wiring does not exist.

### Task 2: Durable Hephaestus controller

**Files:**
- Create: `go-hub-factory-controller.mjs`
- Modify: `go-hub-edge-worker.mjs`
- Modify: `wrangler.go-hub.jsonc`
- Modify: `package.json`

**Interfaces:**
- `createFactoryControllerService({ namespace })` returns `requestSlot(input)`, `releaseSlot(input)`, `getState(input)`, `assertActiveMerge(input)`.
- `HephaestusForeman` Durable Object persists existing Hephaestus state under key `state`.
- Edge Worker re-exports `HephaestusForeman`.

- [ ] **Step 1: Implement the minimal Durable Object wrapper** around `createHephaestusState`, `evaluateFactoryAdmission`, `requestFactorySlot`, `releaseFactorySlot`, and `completeMergeAndReturn`.
- [ ] **Step 2: Implement the controller service** using `namespace.getByName(repository)`; return `FACTORY_FOREMAN_NOT_CONFIGURED` if the binding is absent.
- [ ] **Step 3: Configure `HEPHAESTUS`** in `wrangler.go-hub.jsonc` using a SQLite-backed Durable Object export.
- [ ] **Step 4: Re-export the class** from `go-hub-edge-worker.mjs` and add controller/Hephaestus files to syntax checking.
- [ ] **Step 5: Verify focused controller tests are GREEN.**

### Task 3: MCP tools and guarded merge

**Files:**
- Modify: `go-hub-mcp-registry.mjs`
- Modify: `go-hub-worker.mjs`
- Modify: tests from Task 1.

**Interfaces:**
- Registry operations: `requestFactorySlot`, `releaseFactorySlot`, `getFactoryState`.
- Existing merge input: `{repository, number, expectedHeadSha, goId, jobId, method?}`.

- [ ] **Step 1: Add the three Factory MCP definitions** with explicit schemas and annotations.
- [ ] **Step 2: Extend merge schema** so `goId` and `jobId` are required.
- [ ] **Step 3: Instantiate Factory controller in `/mcp`** from `env.HEPHAESTUS` and add its operations to the registry lifecycle object.
- [ ] **Step 4: Wrap `mergePullRequest`** so `assertActiveMerge()` runs before the existing GitHub merge lifecycle method; reject with `FACTORY_MERGE_SLOT_REQUIRED` without any upstream mutation when ownership does not match.
- [ ] **Step 5: Run focused MCP/Worker tests and confirm GREEN.**

### Task 4: Publication and full safety gate

**Files:**
- Modify only if required by active publication tests: `RELEASE_MANIFEST.json`, `.assetsignore`, `go-hub-sw.js`, publication tests.

**Interfaces:**
- `npm run deploy:gate` remains the final repository gate.

- [ ] **Step 1: Run/inspect full PR Safety Gate on the exact head.**
- [ ] **Step 2: If publication parity fails, add only the files required by the active Worker/runtime publication contract.**
- [ ] **Step 3: Re-run exact-head Safety Gate until GREEN.**
- [ ] **Step 4: Re-read spec and diff; confirm no bypass path from MCP merge to GitHub remains.**

### Task 5: Merge and production verification

**Files:**
- No new production files unless verification finds a defect.

**Interfaces:**
- PR head is exact and green before merge.

- [ ] **Step 1: Merge only through guarded GO Hub merge lifecycle after current-head CI is green.**
- [ ] **Step 2: Observe main workflow/deploy runs for the merge SHA.**
- [ ] **Step 3: Re-list MCP tools and verify Factory tools are published.**
- [ ] **Step 4: Non-destructively inspect Factory state and confirm missing/incorrect Merge-slot ownership rejects merge before GitHub mutation.**

## Self-Review

- Spec coverage: durable state, server-side admission, explicit Factory tools, hard merge gate, fail-closed missing binding, and existing lifecycle preservation are mapped to Tasks 1–5.
- Placeholder scan: no TBD/TODO/deferred implementation steps remain.
- Type consistency: controller methods and registry operation names are defined once and reused consistently.
- Scope: this closes only the MCP/controller authority seam. It does not redesign Optician, QC, GitHub lifecycle, or browser-local task state.
