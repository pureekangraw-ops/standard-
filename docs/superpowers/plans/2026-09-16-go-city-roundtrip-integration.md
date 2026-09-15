# GO City Roundtrip Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task.

**Goal:** Make one Centre work identity travel through the live GO City route and return to Chat with real evidence.

**Architecture:** Centre owns Work ID/Checkpoint/Return Address. Optician performs relevance-aware intake and refit. Heimdall owns safety/permission passage. Bifrost is transport only. MIMIR returns to Optician. Factory returns real task/workbench truth. MCP city actions carry explicit work context. The active Shell must use the existing City Route.

**Tech Stack:** JavaScript ES modules, Node node:test, Cloudflare Workers/MCP, GitHub lifecycle.

**Spec:** `docs/superpowers/specs/2026-09-16-go-city-roundtrip-integration-design.md`

## Global constraints
- `Chat ⇄ Bifrost ⇄ Optician ⇄ Heimdall ⇄ GO City`.
- One Work ID, Checkpoint ID, Return Address for the full roundtrip.
- Irrelevant 5W fields may be skipped.
- MIMIR returns to Optician before continuation.
- Heimdall is not Product QC.
- Bifrost never gates or mutates work identity.
- Factory may not return `returned-by-operator`.
- No direct writes to main.
- TDD: RED first, then minimal GREEN.

### Task 1: Optician intake and MIMIR refit
**Files:** `tests/go-hub-optician.test.cjs`, `go-hub-optician.js`
- [ ] Add failing test: purpose/target/action/successCondition passes without irrelevant 5W.
- [ ] Add failing test: missing purpose or successCondition WAITs.
- [ ] Add test: MIMIR PASS can REUSE_FIT if unchanged and REFIT if Reality changes.
- [ ] Confirm RED.
- [ ] Replace fixed required 5W with relevance-aware canonical requirements.
- [ ] Verify focused tests GREEN.

### Task 2: Gateway semantics
**Files:** `tests/go-hub-city-route.test.cjs`, `go-hub-city-route.js`
- [ ] Add failing inbound tests: Optician PASS then Heimdall PASS enters city; WAIT/BLOCK does not.
- [ ] Add failing outbound tests: Heimdall PASS may cross Bifrost; refit-needed goes to Optician first.
- [ ] Add failing test: MIMIR defaults resumeAt Optician.
- [ ] Confirm RED.
- [ ] Implement pure route helpers and preserve compatible existing helpers where useful.
- [ ] Verify focused tests GREEN.

### Task 3: Factory work identity and real return
**Files:** `tests/go-hub-factory-return.test.cjs`, `go-hub-factory-return.js`, `go-hub-code-module.js`, `go-hub-shell.js`
- [ ] Add failing test using a real Centre handoff and Code task snapshot.
- [ ] Assert exact Work ID/Checkpoint survive and payload contains real state/evidence.
- [ ] Confirm RED.
- [ ] Implement `createFactoryWorkContext` and `createFactoryRealityReturn`.
- [ ] Replace Shell synthetic `returned-by-operator` return.
- [ ] Verify Centre/Factory/Shell tests GREEN.

### Task 4: MCP lifecycle context
**Files:** `tests/go-hub-mcp-registry.test.cjs`, `tests/go-hub-mimir-destination.test.cjs`, `go-hub-mcp-registry.mjs`, `go-hub-factory-mcp-worker.mjs`, `go-hub-notion-catalog.mjs`
- [ ] Add failing tests for city `workContext` fields: workId/checkpointId/returnAddress/destination/task/requestedResult/lensReference.
- [ ] Reject mismatched checkpoint/return address and wrong city destination.
- [ ] Preserve admin/read-only actions outside active city work.
- [ ] Propagate workContext through MIMIR and Factory city calls.
- [ ] Verify MCP/MIMIR/Factory tests GREEN.

### Task 5: Activate City Route in production Shell
**Files:** `tests/go-hub-shell.test.cjs`, `tests/go-hub-active-publication.test.cjs`, `tests/go-hub-publication-seam.test.cjs`, `go-hub-shell.js`, `.assetsignore`, `go-hub.assetsignore`, `RELEASE_MANIFEST.json`, `GO_HUB_RELEASE_MANIFEST.json`, `go-hub-sw.js`
- [ ] Add failing Shell test proving City Route/Optician are imported and synthetic return is absent.
- [ ] Add failing publication tests for active city runtime modules.
- [ ] Confirm RED.
- [ ] Wire City Route into Shell and update allowlists/manifests/cache.
- [ ] Verify Shell/publication/PWA tests GREEN.

### Task 6: Hephaestus production reality return
**Files:** `tests/go-hub-hephaestus.test.cjs`, `go-hub-hephaestus-return.js`, `.github/workflows/go-hub-deploy.yml`
- [ ] Add failing test requiring structured post-deploy verification evidence in return packet.
- [ ] Add workflow contract for post-deploy smoke bound to exact deployed SHA.
- [ ] Confirm RED.
- [ ] Implement minimal evidence propagation and smoke verification.
- [ ] Verify focused tests GREEN.

### Task 7: End-to-end roundtrip and finish
**Files:** `tests/go-hub-city-roundtrip.test.cjs`
- [ ] Prove Centre identity survives Optician/Heimdall/Factory or MIMIR and returns toward Bifrost.
- [ ] Fix only evidence-backed remaining seam.
- [ ] Run exact-head CI and compare against main.
- [ ] Open PR and require current-head GREEN.
- [ ] Merge only with Hephaestus merge-slot ownership.
- [ ] Observe main deploy and production verification before completion.

## Self-review
All six requested repair lines are covered. Housekeeping, Lost Era cleanup, NormalPocket metadata, and MIMIR ranking are out of scope.