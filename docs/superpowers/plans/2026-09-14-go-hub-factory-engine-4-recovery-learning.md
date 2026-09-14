# GO Hub Factory Engine 4 — Recovery & Learning Implementation Plan

**Goal:** Scan the completed factory truth in order, identify the first broken station without blame, close a verified Product safely, and retain one reusable lesson through the existing resumable CodeTask.

**Architecture:** Keep one CodeTask authority and reuse the mounted Blueprint, Evidence Ledger, persistence, Workbench, and publication contracts. Add three small pure stations: Verification Scanner, Housekeeper closeout planner, and Learning Recorder. Recovery is a deterministic first-broken-truth result, not a second workflow engine.

**Start revision:** `fd2103412a230446359ac74c10c2175f284b7b5c` (locked Engine 3 main)

## Constraints

- No dependency or paid service.
- No person/blame scoring and no invented evidence.
- Scanner stops at the first missing or failed truth in factory order.
- Closeout requires a passing scan bound to the current verified artifact digest.
- Learning records context, action, finding, resolution, and reuse condition; it does not create a generic memory framework.
- Preserve exact save/reload fidelity and publish every runtime module.
- Stop after Engine 4 Verify and Lock; no Engine 5 scope.

## Task 1 — Verification Scanner and recovery target

- Add `go-hub-verification-scanner.js` and tests.
- Define the ordered stations: Blueprint, Piece QC, Ready Gate, Assembly QC, Artifact, Product QC.
- Return `FIRST_BROKEN_TRUTH` with station/reason/recovery action at the first failure, otherwise `VERIFIED_CHAIN` bound to the artifact digest.
- Observe RED, implement fail-closed behavior, then GREEN.

## Task 2 — Housekeeper closeout

- Add `go-hub-housekeeper.js` and tests.
- Produce an immutable closeout plan only for `PRODUCT_VERIFIED` plus a current `VERIFIED_CHAIN`.
- Bind final artifact identity/digest and list explicit transient/obsolete keys; do not perform deletion.
- Observe RED, implement, then GREEN.

## Task 3 — Learning Recorder

- Add `go-hub-learning-recorder.js` and tests.
- Create immutable lessons with source task/artifact identity and non-empty reusable conditions.
- Reject generic or incomplete lessons.
- Observe RED, implement, then GREEN.

## Task 4 — Resumable Engine 4 truth

- Extend `go-hub-code-task.js` with `verificationScan`, `closeout`, and `lessons` plus guarded record methods.
- Project them through `go-hub-code-module.js`; Workbench continues to derive status from the one task.
- Invalidate downstream closeout/lessons when the scan or artifact truth changes.
- Test legacy restoration and exact state transitions first.

## Task 5 — Functional Test, publication, and Assembly Review

- Exercise `PRODUCT_VERIFIED → scan → closeout → lesson → save/reload` with real station modules.
- Prove an intentional earlier break returns the correct first recovery target.
- Add modules to syntax, release manifest, allowlist, and service-worker cache with a new cache generation.
- Run `npm run deploy:gate` and review against the mounted Blueprint.
- Open PR, require exact-head CI, squash merge, verify main CI/deploy and production HTTP 200, then record the lock in Notion.

## Completion Boundary

Engine 4 is complete only when the verified chain can fail closed at its first broken truth or close into a source-bound record with a reusable lesson, survive persistence exactly, and pass deployed production verification.
