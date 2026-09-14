# GO Hub Code Station — Engine Map & Connection Audit

Date: 2026-09-14
Status: Design / architecture audit
Base truth: `main` at `bbd43e1c5bfd0217efb335353a684e6a8581f854`

## 1. Purpose

Code Station is the GO Hub operating engine that takes a coding mission from Centre and carries it from unknown repository state to a verified released result, then returns evidence and next state to Centre.

The station must be designed as a connected engine, not as a list of APIs or passing tests.

Primary flow:

`Centre -> Inspect -> Work -> Validate -> Integrate -> Release -> Result/Centre`

A shared Task / Continuity / Authority engine runs underneath every stage. It is not a sixth sequential slot.

## 2. Design rule

A slot is complete only when all four conditions hold:

1. It receives a defined input from the previous boundary.
2. It performs its responsibility end-to-end.
3. It emits evidence/output that the next slot can consume without reconstructing hidden state.
4. Its failure path returns to an explicit prior slot or blocker state without losing the mission.

Presence of methods, tests, or UI labels does not make a slot complete.

## 3. Slot map

### Slot 1 — Inspect

Purpose: establish exact repository reality before mutation.

Input:
- coding mission / repository target from Centre

Required output:
- repository
- default/base branch
- base SHA
- selected/work branch when present
- current head SHA
- recursive tree
- file identity / content SHA where mutation will occur
- relevant current task context

Current implementation assets:
- GitHub workspace `inspect`
- recursive `listTree`
- `listFiles`
- `readText`
- Worker repository / branch / tree / file reads

Gap to completion:
- shell/runtime does not yet run an inspect mission and commit its evidence into the active task as an authoritative transition
- capability readiness proves method presence, not a completed inspect handoff

Assessment: strong components, incomplete end-to-end slot.

### Slot 2 — Work

Purpose: mutate only an isolated work branch while preserving branch and SHA truth.

Input:
- inspected base/head evidence
- requested change

Required output:
- work branch
- touched paths
- resulting head SHA
- diff evidence/fingerprint
- explicit conflict or blocker when mutation cannot be applied safely

Current implementation assets:
- branch creation
- create/update/delete file
- default-branch write guard
- stale file SHA conflict mapping
- compare/diff
- task fields for workBranch/headSha/touchedPaths/diffFingerprint

Gap to completion:
- no mission-level orchestrator connects inspect -> branch -> edit -> diff -> persisted task transition
- shell currently loads a task and registers capability but does not execute or save this cycle

Assessment: strong components, incomplete end-to-end slot.

### Slot 3 — Validate

Purpose: decide whether the work actually satisfies the intended change before integration.

Input:
- reviewed diff/head SHA
- mission intent and acceptance behavior

Required output:
- validation result bound to exact head SHA
- test evidence when applicable
- functional acceptance evidence
- explicit defer reason when a test cannot or should not run
- route back to Work on failure

Current implementation assets:
- task states `DIFF_REVIEWED` and `TESTED_OR_TEST_DEFERRED`
- later CI observation exists in integration

Gap to completion:
- no Code Station validation engine exists that executes/records functional validation against the mission intent
- CI is not a substitute for this slot; CI answers repository integration checks, not necessarily whether the requested behavior is correct
- current state model can record a target state without a strict source->target transition graph

Assessment: first clearly incomplete functional engine and the next sequential slot that must be finished before extending later stages.

## 4. Later slots already contain useful machinery but are not yet complete engines

### Slot 4 — Integrate

Purpose: turn validated work into a safely merged repository result.

Current assets:
- open/read PR
- exact-head CI observation
- rerun failed jobs
- guarded merge with expected head SHA
- PR/CI/merge task evidence

Remaining assembly concerns:
- no complete orchestrated Validate -> PR -> CI -> Merge mission loop
- required-check policy may be looser than actual branch-protection requirements and must be audited before declaring the slot complete
- state machine does not yet enforce a strict legal transition graph

Assessment: advanced machinery, not yet a complete slot.

### Slot 5 — Release

Purpose: observe deployment of the merged SHA, verify the real target, and recover when release verification fails.

Current assets:
- workflow-run observation by SHA
- deployment and verification task fields/states
- rollback state vocabulary

Remaining gaps:
- no complete deploy -> real-target verification executor
- no fully wired rollback/recovery execution path
- deploy success must remain distinct from external production verification

Assessment: partial engine.

## 5. Shared engine — Task / Continuity / Authority

This engine is orthogonal to slots 1-5.

Responsibilities:
- mission identity
- current slot/state
- exact repository/head evidence
- durable snapshot
- audit journal
- revision/version
- command idempotency
- conflict detection
- resume after browser/process restart
- blocker and next action
- eventual specialist ownership/lease without splitting central truth

Current assets:
- `go-hub-code-task.js` snapshot/state/audit vocabulary
- local persistence abstraction with durable readback check
- localStorage-backed session load/save

Current structural problem:
- localStorage is currently the effective state store in shell
- there is no server-side single writer
- no revision concurrency enforcement
- no command dedupe/idempotency
- no lease/ownership model
- shell loads the task but does not show a complete transition -> save -> resume execution loop

Conclusion:
Task Authority is required infrastructure, but it must be treated as a shared engine under every slot, not as Slot 6 and not as an excuse to skip Slot 3 Validate.

## 6. Correct connection graph

Forward path:

`Centre`
`  -> Inspect`
`  -> Work`
`  -> Validate`
`  -> Integrate`
`  -> Release`
`  -> Result/Centre`

Failure routes:

- Inspect uncertainty -> remain Inspect / BLOCKED
- Work conflict -> Work / CONFLICT
- Validate failure -> Work
- Integrate CI failure -> Work or Validate depending on cause
- stale PR/head -> Work/Integrate reconciliation, never blind merge
- deploy failure -> Release recovery
- verification failure -> Release or Work/Validate according to defect class

Shared underneath all routes:

`Task / Continuity / Authority`

No stage may silently reconstruct authoritative mission state from UI memory.

## 7. Important correction to previous completeness estimate

The earlier estimate that several slots were "complete" was too generous because it measured available capabilities rather than complete connected behavior.

Using the engine definition in this document:

- Inspect: components strong, engine incomplete
- Work: components strong, engine incomplete
- Validate: incomplete
- Integrate: advanced components, engine incomplete
- Release: partial
- Shared Task Authority: partial/local only

Therefore Code Station currently has **zero fully closed end-to-end slots by the stricter engine definition**, even though Slots 1, 2, and 4 already contain substantial production-grade machinery.

This is not a regression. It is a correction of the measuring lens.

## 8. Build order from here

Do not chase whichever bug or API appears next.

Build order:

1. Close Slot 1 Inspect as a complete mission handoff.
2. Close Slot 2 Work as a complete branch/edit/diff handoff.
3. Build and close Slot 3 Validate.
4. Assembly-review Slots 1-3 together.
5. Close Slot 4 Integrate using existing PR/CI/merge machinery.
6. Close Slot 5 Release with real verification and recovery.
7. Assembly-review the entire station.

Task Authority is developed only to the degree required to provide shared truth beneath this sequence; it is not counted as a later slot. Its server-side authority upgrade remains a separate architectural engine and should be introduced without changing the sequential slot order.

## 9. Definition of Done for the first three slots

### Inspect done
A fresh mission can start with only repository + intent and finish with a persisted, exact inspect snapshot that Work can consume directly.

### Work done
Given an Inspect snapshot, Code Station can create/use an isolated branch, mutate files with SHA safety, produce exact diff/head evidence, persist it, and surface conflicts without losing the task.

### Validate done
Given Work evidence and mission intent, Code Station can evaluate the requested behavior, bind validation evidence to the exact head SHA, explicitly pass/fail/defer, and route failure back to Work.

## 10. Assembly review criteria

After each engine is complete, review the assembly rather than merely its unit tests:

- output from prior slot is sufficient input for next slot
- exact SHA truth survives each boundary
- stale evidence is invalidated on head changes
- failures return to a valid prior state
- task state survives reload/resume
- no UI/local cache is treated as repository truth
- GitHub remains repository source of truth
- Centre receives explicit result/blocker/next action
- green CI cannot override failed functional acceptance
- deployment success cannot masquerade as production verification

## 11. Non-goals of this design

- no UI redesign
- no generalized plugin/tool gateway
- no Workflow/webhook/event-resume implementation yet
- no replacement of GitHub or Notion
- no broad refactor unrelated to Code Station engine boundaries

## 12. Immediate next engine

The next implementation target is **Slot 1 Inspect closure**, not Task Authority v1 in isolation and not Slot 4/5 hardening.

Minimal shared-state changes may accompany Slot 1 only when needed to preserve its exact handoff and resume behavior. Larger Durable Object Task Authority work follows as a shared-engine upgrade after the slot boundary is proven, or earlier only if Inspect closure demonstrably cannot be correct without it.

This ordering exists to prevent another architecture jump: finish the engine in front of us, test its real behavior, review how it connects, then move to the next engine.
