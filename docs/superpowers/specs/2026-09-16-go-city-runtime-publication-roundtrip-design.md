# GO City Runtime/Publication Round-trip Design

**Date:** 2026-09-16

## Purpose

Close the remaining runtime seam after PR-B so the active GO Hub no longer returns a synthetic `returned-by-operator` payload. The live Centre → Factory path must carry the same work identity into the Code capability and return a Factory reality packet built from the actual Code task snapshot.

## Scope

1. `go-hub-shell.js` admits the Factory destination and derives a Factory work context from the exact Centre access plus current Code task snapshot.
2. `createCodeCapability()` receives that context so runtime actions are bound to the Centre work identity.
3. Returning from Factory uses `createFactoryRealityReturn(access, task.snapshot())` rather than an operator-generated placeholder.
4. `go-hub-factory-return.js` becomes part of the active publication contract, service-worker cache contract, and syntax gate.
5. Tests prove the active shell uses the real return path and publication includes every required runtime file.

## Non-goals

- Do not change Factory menu/UI ownership.
- Do not pull Optician or `go-hub-city-route.js` into active runtime unless the shell actually imports them.
- Do not redesign Centre persistence, Code task state, or Hephaestus contracts.
- Do not add a second return protocol.

## Runtime Flow

`Centre AWAY` → `admitDestination()` → `createFactoryWorkContext(access, task.snapshot())` → `createCodeCapability({ workspace, task, workContext })` → Factory work proceeds → `createFactoryRealityReturn(access, task.snapshot())` → `centre.return()` → same `workId` and `checkpointId` return to the durable Centre checkpoint.

The return payload is descriptive reality only: task state, Factory stage, next action, blocker, refs, PR, CI, deployment, verification, QC, artifact, and evidence. It must not contain `returned-by-operator`.

## Publication Contract

`go-hub-factory-return.js` must appear in `RELEASE_MANIFEST.json`, `.assetsignore`, `go-hub-sw.js`, the active publication test file list, and the `check:syntax` script. Publication tests remain the authority for parity.

## Failure Behavior

- Invalid Factory access or mismatched Centre identity fails closed through existing `requireFactoryAccess()` / Centre return validation.
- A runtime with no Factory destination access must not register Code.
- No guessed PASS state is synthesized; the return status is derived by `createFactoryRealityReturn()` from the task snapshot.

## Acceptance

- Focused runtime test first fails against current shell because it still contains `returned-by-operator` and does not import/use Factory return helpers.
- Minimal shell/publication changes make focused tests pass.
- Exact branch-head CI is green before PR creation/merge.
- After merge, main exact SHA deploy and safety workflows must be green before Production Reality verification begins.
