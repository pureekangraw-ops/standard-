# Hephaestus MCP Factory Controller Design

## Purpose

Move Hephaestus from a tested policy module beside the Factory into the live `@GO Hub Factory` execution path. Hephaestus is the Factory foreman and the Factory boundary: every Assembly/Merge production route enters through Hephaestus and successful work exits through Hephaestus back to Optician.

This extends the existing `2026-09-15-hephaestus-factory-foreman-design.md`. It does not replace Ready Gate, Assembly QC, GitHub CI, verification, or Optician authority.

## Canonical Factory flow

```text
Enter Factory
  -> Hephaestus
  -> Assembly slot: exactly 1 active job per repository
  -> existing Assembly QC
  -> Merge slot: exactly 1 active job per repository
  -> merge
  -> post-merge Verify
  -> Hephaestus releases the Factory job
  -> Optician
```

Hephaestus controls Factory rhythm and slot ownership. QC proves correctness. Verify proves post-merge Reality. Optician refits the route after Reality changed.

## Current gap

The live plugin path is currently:

`/mcp -> go-hub-mcp-registry.mjs -> createGithubLifecycleService() -> GitHub`

That path can reach GitHub lifecycle operations without passing through Hephaestus. Existing Hephaestus state is pure module state only; it is not durable server authority for live MCP calls.

## Architecture

Use one Cloudflare Durable Object instance per repository as the server-authoritative Hephaestus state holder. The Durable Object reuses the existing pure Hephaestus functions for admission, FIFO queueing, release, recheck, and post-merge return.

A focused `go-hub-factory-controller.mjs` adapter exposes the Foreman to the MCP Worker. To avoid multiplying public commands, the registry adds one `go_hub_factory_foreman` tool with `request`, `release`, and `state` actions. GitHub lifecycle remains authoritative for repository/PR/CI/merge truth.

## Durable state

Binding: `HEPHAESTUS`

Class: `HephaestusForeman`

Object key: exact repository name, for example `pureekangraw-ops/standard-`.

Stored record: the existing `createHephaestusState()` shape under one durable storage key. Durable Object request serialization plus persistent storage provides one queue/slot authority per repository.

## Factory admission and slots

### Assembly

Assembly admission is computed server-side from existing Ready Gate evidence:

- `readyGate.status === READY_FOR_ASSEMBLY`
- `readyGate.headSha === piece.headSha`

Only one Assembly job may be ACTIVE per repository. Additional jobs queue FIFO and return to Chat instead of occupying an active GO.

### QC

Assembly QC stays the existing QC system. Hephaestus does not duplicate or weaken it.

### Merge

Only one Merge job may be ACTIVE per repository. Admission requires:

- current `ASSEMBLED` integration head,
- Assembly QC pass for that exact integration head,
- current PR number/head,
- exact-head CI success,
- SAFE queue-risk result.

The live `go_hub_merge_pull_request` operation must verify matching active Merge-slot ownership before sending any GitHub merge mutation.

### Verify and exit

A merged job remains owned by Hephaestus until post-merge verification passes. Successful Merge release requires:

- `postMergeVerification.status === "pass"`
- exact resulting `mainSha`
- verification timestamp

Only then does Hephaestus release the slot and return the deterministic packet `Hephaestus -> Optician`.

## MCP surface

Add one tool: `go_hub_factory_foreman`.

Actions:

- `request`: request Assembly or Merge slot with GO/job identity and current evidence. Server computes admission; caller cannot submit a precomputed ADMIT decision.
- `release`: release Assembly, or release Merge only with passed post-merge verification.
- `state`: read current repository Foreman state.

Existing `go_hub_merge_pull_request` gains `goId` and `jobId`; the controller must prove that identity owns the active repository Merge slot before GitHub mutation.

## Authority boundaries

- GitHub: repository, branch, PR, CI, merge SHA, workflows.
- Ready Gate / QC / verification systems: correctness evidence.
- Hephaestus: Factory entry, Assembly slot, Merge slot, queues, release, Factory exit.
- Optician: route/refit authority after Factory Reality changes.
- MCP registry: schema/routing only; no duplicated admission policy.
- Browser-local Code task: not server authority.

Read/inspect/edit/branch/PR operations are not globally locked by Hephaestus. The Factory foreman serializes the cost-bearing Assembly and Merge stations defined by the Factory design.

## Failure behavior

- Missing `HEPHAESTUS` binding: Foreman actions and merge fail closed with `FACTORY_FOREMAN_NOT_CONFIGURED`.
- Merge without matching active Merge slot: reject before GitHub mutation with `FACTORY_MERGE_SLOT_REQUIRED`.
- Stale or unsafe admission evidence: WAIT/BLOCK; no slot ownership.
- Merge release without successful post-merge verification: reject and retain slot ownership.
- Durable state write failure: fail closed.

## Success criteria

- Live Factory route is `Hephaestus -> Assembly(1/repo) -> QC -> Merge(1/repo) -> Verify -> Hephaestus -> Optician`.
- Two jobs cannot simultaneously own one repository Assembly slot.
- Two jobs cannot simultaneously own one repository Merge slot.
- MCP merge cannot call GitHub unless matching GO/job owns the active Merge slot.
- Foreman state survives separate Worker requests.
- Admission decisions are server-computed from current evidence.
- Merge release cannot succeed without post-merge verification.
- Missing Foreman configuration never silently bypasses Hephaestus.
