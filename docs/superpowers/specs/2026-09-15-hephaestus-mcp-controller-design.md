# Hephaestus MCP Factory Controller Design

## Purpose

Move Hephaestus from a tested policy module beside the Factory into the live `@GO Hub Factory` MCP execution path. The MCP server must no longer be able to perform a repository merge while bypassing Hephaestus merge-slot ownership.

This design extends the existing `2026-09-15-hephaestus-factory-foreman-design.md`; it does not replace Hephaestus policy, Ready Gate, Assembly QC, GitHub exact-head CI checks, or Optician authority.

## Current gap

The live plugin path is currently:

`/mcp -> go-hub-mcp-registry.mjs -> createGithubLifecycleService() -> GitHub`

`go-hub-hephaestus.js` is not in that route. Hephaestus queue state is also not server-authoritative or durable, so an in-memory Worker object would not be sufficient for slot ownership.

## Architecture

Use one Cloudflare Durable Object instance per repository as the server-authoritative Hephaestus state holder. The Durable Object reuses the existing pure Hephaestus functions for admission, FIFO queueing, release, recheck, and post-merge return.

A small `go-hub-factory-controller.mjs` adapter exposes the Durable Object to the MCP Worker. The MCP registry gains explicit Factory tools to request/release slots and inspect current foreman state. Existing GitHub lifecycle operations remain authoritative for GitHub truth.

## Durable state

Binding: `HEPHAESTUS`

Class: `HephaestusForeman`

Object key: exact repository name, e.g. `pureekangraw-ops/standard-`.

Stored record: the existing `createHephaestusState()` shape under one durable storage key. Durable Object request serialization plus persistent storage provides one authoritative queue/slot state per repository.

New Durable Object namespaces use SQLite-backed storage.

## MCP surface

Add three tools:

1. `go_hub_factory_request_slot`
   - Inputs: `repository`, `slot`, `goId`, `jobId`, plus supplied current admission evidence.
   - Server computes admission with `evaluateFactoryAdmission()`; caller cannot submit a precomputed `ADMIT` decision.
   - Returns ACTIVE, QUEUED, WAIT, or BLOCKED plus queue evidence.

2. `go_hub_factory_release_slot`
   - Inputs: `repository`, `slot`, `goId`, `jobId`.
   - Assembly release uses `releaseFactorySlot()`.
   - Merge release additionally requires passed `postMergeVerification` and uses `completeMergeAndReturn()`.

3. `go_hub_factory_get_state`
   - Read-only current repository Foreman state for operator/GO inspection.

The existing `go_hub_merge_pull_request` tool additionally requires `goId` and `jobId`. Before any GitHub merge request is sent, the MCP Worker must verify that the same GO/job currently owns the repository Merge slot. This is a hard gate.

## Admission evidence

Assembly admission consumes the existing Hephaestus contract:

- `readyGate.status === READY_FOR_ASSEMBLY`
- `readyGate.headSha === piece.headSha`

Merge admission consumes:

- current assembled integration head,
- Assembly QC pass for that integration head,
- current PR number/head,
- exact-head CI success,
- `SAFE` queue-risk result.

The server re-evaluates this evidence using the existing pure Hephaestus evaluator. Missing or stale evidence fails closed.

## Authority boundaries

- GitHub remains source of truth for repository, branch, PR, CI, merge SHA, and workflow state.
- Existing QC/Ready Gate modules remain source of truth for correctness evidence.
- Hephaestus owns only Factory admission, queue/slot ownership, release, and return packet.
- MCP Registry remains tool schema/routing only; it must not duplicate Hephaestus rules.
- The browser-local Code task is not treated as server authority.
- Read/inspect/edit/branch/PR operations are not globally locked by Hephaestus. The existing design only serializes Assembly and Merge slots.

## Failure behavior

- Missing `HEPHAESTUS` binding: Factory slot tools and merge fail closed with `FACTORY_FOREMAN_NOT_CONFIGURED`.
- Merge without active matching Merge slot: reject before GitHub mutation with `FACTORY_MERGE_SLOT_REQUIRED`.
- Stale/unsafe evidence: WAIT/BLOCK from Hephaestus; no slot ownership is granted.
- Merge release without passed post-merge verification: reject and keep slot active.
- Durable state write failure: fail closed; never continue to merge.

## Publication/deployment

`wrangler.go-hub.jsonc` declares the `HEPHAESTUS` Durable Object binding and SQLite-backed `HephaestusForeman` export. `go-hub-edge-worker.mjs` re-exports the Durable Object class from the controller module so Wrangler can provision it.

The new controller and existing Hephaestus modules must be included in syntax/publication gates required by the active Worker bundle.

## Success criteria

- Live MCP merge cannot call GitHub unless matching GO/job owns active repository Merge slot.
- Foreman slot/queue state survives separate Worker requests.
- Two jobs cannot simultaneously own one repository Merge slot.
- Admission decisions are computed server-side from evidence, not trusted from the caller.
- Merge release cannot succeed without post-merge verification.
- Missing controller binding fails closed rather than silently bypassing Hephaestus.
- Existing non-Factory MCP tools retain their current behavior.
