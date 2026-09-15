# GO Hub Factory Controller Bridge Design

Date: 2026-09-15  
Status: Design draft — awaiting owner written-spec review  
Owner: BIG  
Primary operator: GO  
Base revision: `f69a342b04e224a055c2dafc72eb2aadf32c39b3`

## 1. Purpose

Connect the existing GO Hub Factory truth model to the existing GitHub/MCP machinery so one real action produces one Reality Receipt, one authoritative task transition, and one evidence update.

The problem is not that GO Hub lacks a factory model or GitHub tools. Both exist. The defect is that they currently operate as parallel lines:

- `go-hub-code-task.js`, Workbench, QC, Evidence Ledger, Verification Scanner, Housekeeper, and Learning Recorder model factory truth.
- `go-hub-worker.mjs`, `go-hub-github-workspace.js`, MCP registry, and GitHub lifecycle operations perform real repository work.
- Real tool actions do not automatically advance or reconcile the factory truth model.

This permits a task snapshot to claim a state that is not causally bound to the action that happened in Reality.

The bridge must remove that split without replacing GitHub, MCP, CodeTask, QC modules, or the existing Factory line.

## 2. Root Cause

The audited root cause is:

> The Factory truth model and the operational tool line have no single controller boundary that binds Action -> Reality -> Receipt -> Truth transition.

Consequences:

1. Tool success can occur without CodeTask transition.
2. CodeTask/QC states can be recorded from caller-supplied assertions rather than tool-produced evidence.
3. Resume state can drift from GitHub because local persistence is not reconciled against repository reality before continuation.
4. Workbench can display internally consistent data that is stale relative to GitHub.
5. GO can know a tool failed but not necessarily bind the failure to the current factory task/evidence chain.

## 3. Architectural Decision

Use a thin **Factory Controller Bridge** around existing lifecycle/workspace capabilities.

Do not put task-state ownership inside each tool and do not create a second orchestration framework.

Target flow:

```text
GO Action Request
      |
      v
Factory Controller
      |
      +--> load/reconcile authoritative task
      +--> validate authority / state / expected identity
      +--> call existing workspace/lifecycle operation
      |
      v
Reality Receipt
      |
      +--> validate repository / branch / SHA / run / PR identity
      +--> derive allowed CodeTask transition
      +--> append trusted evidence when applicable
      +--> persist updated task + receipt
      |
      v
Factory Result
  receipt + task snapshot + next action
```

The controller owns coordination, not domain truth. GitHub remains authoritative for repository/branch/commit/PR/Actions state. CodeTask remains the compact Factory task truth. Existing QC evaluators remain responsible for QC decisions.

## 4. Placement and One Durable Authority

The production Factory Controller runs **server-side in the GO Hub Worker boundary**, so browser Code and MCP/ChatGPT can use the same Factory task authority.

The current browser `localStorage` task snapshot cannot be that authority because MCP cannot access it and two operators could diverge silently.

Current deployment configuration has no server-side durable state binding. Therefore correctness requires one small new infrastructure seam:

**Cloudflare Durable Object: `GO_HUB_FACTORY_STATE`**

Use one Durable Object instance per Factory task ID. It stores only compact operational truth:

- CodeTask snapshot,
- monotonically increasing revision,
- recent/required Reality Receipts,
- audit events needed for recovery/reconciliation.

It must not store:

- GitHub credentials,
- OAuth secrets,
- full CI log archives,
- repository source files,
- a second copy of GitHub branch/PR truth.

Why Durable Object rather than KV: the task controller needs serialized updates and a single strongly ordered task authority; eventual-consistency storage is not appropriate for transitions such as write -> head update -> CI evidence invalidation.

### Browser localStorage after cutover

Browser localStorage becomes a **cache/projection only**, never authoritative Factory truth.

An existing legacy local task may be imported only when all of these match server-observed Reality:

- task/repository identity,
- work branch identity,
- current head SHA,
- PR identity when present.

Otherwise the legacy snapshot is ignored and the controller rebuilds operational truth from GitHub plus explicit task intent. No local snapshot may overwrite server/GitHub reality.

## 5. Responsibility Boundaries

### 5.1 Factory Controller

Responsible for:

- accepting one explicit Factory action request,
- loading and reconciling the current authoritative task,
- verifying that the action is compatible with task state and authority,
- invoking the existing operational capability,
- normalizing the response into a Reality Receipt,
- validating receipt identity against current task context,
- applying the corresponding CodeTask transition,
- adding trusted evidence only from verified receipts,
- persisting the resulting task snapshot and receipt,
- returning the updated next action.

Not responsible for:

- inventing evidence,
- deciding Blueprint intent,
- performing Piece/Assembly/Product QC itself,
- replacing GitHub policy,
- replacing MCP,
- becoming Heimdall.

### 5.2 Existing Workspace / Lifecycle

Remains responsible for real side effects and readback:

- inspect/read/tree,
- branch creation,
- file mutation,
- compare/diff,
- PR,
- CI/workflow observation,
- failure evidence,
- merge,
- deploy observation.

Operational methods return raw external truth. They do not directly mutate CodeTask.

### 5.3 CodeTask

Remains responsible for:

- lifecycle state,
- repository/base/work/head identity,
- PR/CI/deploy/verification summaries,
- Factory stage truth,
- audit trail,
- next action and blocker.

CodeTask may only advance from controller-validated receipts for operational states covered by the bridge.

### 5.4 Evidence Ledger

Evidence created through the bridge must carry provenance sufficient to answer:

- what produced this evidence,
- for which repository/branch/head/run/artifact,
- when it was observed,
- what claim it can support.

Manual evidence is a separate explicit evidence class. It is never labeled as a tool-produced Reality Receipt.

## 6. Reality Receipt Contract

A Reality Receipt is immutable normalized evidence from one operational action.

Minimum shape:

```js
{
  id,
  action,
  status,          // success | failure | blocked
  repository,
  observedAt,
  source,          // github | go-hub-gateway
  identity: {
    baseBranch?,
    baseSha?,
    workBranch?,
    headSha?,
    commitSha?,
    pullRequestNumber?,
    runId?,
    jobId?,
    deploymentSha?
  },
  result,          // normalized operation result
  evidence         // concise machine-usable supporting data
}
```

Rules:

1. Receipts must not contain secrets or raw authorization data.
2. A receipt cannot advance state if its repository or relevant SHA identity does not match the active task.
3. A newer head invalidates prior diff/CI/merge-sensitive receipts according to existing CodeTask stale-head rules.
4. Failure receipts are first-class truth and must be persistable without pretending the action succeeded.
5. Large logs are not embedded wholesale. Failure Evidence stores concise excerpts plus run/job identity.
6. Receipt IDs must be unique within a task and durable enough to deduplicate retry/replay.

## 7. Operator Surface

The bridge introduces one explicit high-level Factory operation surface for GO rather than silently changing the meaning of every low-level GitHub tool.

Initial MCP/operator contract:

`go_hub_factory_action({ taskId, action, input, expectedRevision? })`

`action` is a strict allowlisted enum for implemented Factory actions. `input` is validated per action; this is not an arbitrary GitHub proxy.

The controller result returns:

```js
{
  status,
  receipt,
  task,
  revision,
  nextAction,
  reconciliation?
}
```

Existing low-level lifecycle tools remain available as infrastructure/diagnostic tools. Using them directly may change GitHub reality, but **cannot claim Factory progress**. The next controller call must reconcile any external change before mutation.

Browser Code uses the same controller endpoint/service contract rather than independently owning task transitions.

## 8. Initial Controller Action Set

The first implementation slices cover the path that already exists and is required to unblock current work.

### 8.1 Inspect

Input: repository + optional branch  
Reality: existing inspect operation  
Receipt binds: default branch, base SHA, selected branch, head SHA  
Task effect: update inspect truth and branch context while remaining in an inspect/branch-selection state until an isolated work branch is selected.

### 8.2 Create / Resume Branch

Input: branch + exact base SHA  
Reality: existing create-branch or inspect/compare for resume  
Receipt binds: branch + resulting head SHA  
Task effect: `BRANCH_READY` only when identity matches.

### 8.3 Write / Delete

Input: path/content/expected blob SHA/work branch  
Reality: existing branch-safe mutation  
Receipt binds: operation commit SHA and resulting file blob SHA where applicable  
Task effect: set current head to the returned commit SHA and invalidate stale downstream evidence.

Important current semantic: GitHub Contents API commits each successful mutation. The bridge must represent that truth honestly. It must not call the change merely "staged".

### 8.4 Compare

Input: base + head  
Reality: existing compare operation  
Receipt binds: requested exact base/head identity plus changed-file evidence returned by GitHub  
Task effect: create a deterministic diff fingerprint from normalized compare evidence and mark reviewed diff only from that receipt.

### 8.5 Pull Request

Input: branch/base/title/body  
Reality: existing open/update PR operation  
Receipt binds: PR number, current head SHA, base SHA, mergeability where known  
Task effect: `PR_OPEN` only when PR head matches active head.

### 8.6 CI / Failure Evidence

Input: exact head SHA; optional run ID for diagnosis  
Reality: existing get-CI and deployed failure-evidence capability  
Receipt binds: head SHA, workflow/check IDs, failed jobs/steps/log excerpt  
Task effect: `CI_RUNNING`, `CI_GREEN`, or `CI_FAILED`; diagnostic evidence is attached to the same task/run identity.

This same Failure Evidence capability is reused later for deploy failures.

## 9. Trusted Transition Rule

For operational states covered by the bridge, the controller is the only path allowed to claim a successful operational transition.

Examples:

- `PR_OPEN` requires a PR receipt whose `headSha` equals the active task head.
- `CI_GREEN` requires current-head CI receipts whose applicable signals are completed/success.
- `DIFF_REVIEWED` requires compare evidence generated for the exact base/head pair.
- write/delete must invalidate stale diff/PR/CI evidence when the resulting head changes.

The controller may call existing CodeTask transition functions, but it must derive the transition payload from the receipt rather than accept caller-supplied status objects.

## 10. Persistence and Atomicity

The controller must treat "external action succeeded, task persistence failed" as a real split-brain condition.

Because GitHub side effects cannot be rolled back transactionally with Durable Object storage, the bridge uses recovery-by-reconciliation rather than false atomicity.

Required behavior:

1. Load task at revision N.
2. Reconcile relevant external truth.
3. Perform the external action.
4. Create the Reality Receipt.
5. Apply task transition in memory.
6. Persist task + receipt as revision N+1 in the task Durable Object.
7. Read back/confirm revision N+1.
8. If persistence/confirmation fails, return `RECONCILIATION_REQUIRED` with the receipt; do not report the Factory transition as complete.
9. On resume, reconcile stored state with GitHub before the next mutating action.

`expectedRevision`, when provided, protects callers from acting on a stale task projection. Durable Object serialization protects concurrent writes inside one task authority.

The receipt is the recovery anchor when a side effect succeeds but local task persistence does not.

## 11. Reconciliation Contract

Before resuming a persisted task that is beyond simple inspection, the controller refreshes relevant GitHub truth.

Minimum checks by stage:

- branch work: branch still exists and current head matches or a new head is detected,
- PR work: PR still exists and its head/base match recorded identity,
- CI work: CI evidence is still for the current head,
- merged/deploy work: merge/deploy SHA identity still matches recorded result.

Outcomes:

- `MATCH` — continue.
- `ADVANCED_EXTERNALLY` — update task from observed Reality and invalidate stale evidence.
- `CONFLICT` — record blocker and require explicit resolution.
- `MISSING` — fail closed with exact missing-resource evidence.

Local cache or chat memory must never override GitHub reality.

## 12. QC Trust Boundary

This design does not yet redesign all QC modules, but the bridge establishes the rule required for the following hardening slice:

> Operational evidence used by Piece QC, Assembly QC, Product QC, or Verification Scanner must come from a trusted receipt or an explicitly marked manual evidence source.

The future QC hardening step will remove caller-controlled PASS verdicts by making evaluator output canonical at transition boundaries.

That remains a separate slice so this bridge does not become a giant rewrite.

## 13. Failure Semantics

The bridge must distinguish:

- `ACTION_FAILED` — external operation returned failure.
- `IDENTITY_MISMATCH` — returned reality does not match the active task identity.
- `STALE_TASK` — caller/task projection is behind observed GitHub or server revision truth.
- `RECONCILIATION_REQUIRED` — external side effect happened but task persistence/transition did not complete safely.
- `BLOCKED` — permission/policy/authority prevented the action.

No failure mode may be converted to success merely because a side effect partially occurred.

## 14. Audit Contract

Every controller action appends one compact audit event containing:

- action,
- receipt ID,
- prior task state,
- resulting task state,
- prior/resulting revision,
- relevant SHA/run/PR identity,
- success/failure classification,
- timestamp.

Audit events summarize identity and outcome; they do not duplicate full logs.

## 15. Integration with GO City

The Factory Controller is internal to the Factory destination.

It does not replace:

- the Optician/Centre entry gate,
- GO Work Loop ownership,
- MIMIR information/navigation,
- Heimdall city-exit readiness,
- Bifröst return passage.

City-level flow remains:

```text
Optician -> GO Work Loop -> Factory
                         -> Factory Controller -> Reality
                         <- Receipt / Next
          GO Work Loop <- Factory
Heimdall only evaluates exit readiness later.
```

MIMIR may provide routing/information evidence but does not own controller transitions.

## 16. Security and Authority

- Existing owner/repository allowlist remains in force.
- Browser never receives GitHub credentials.
- Default-branch routine mutation remains blocked.
- Controller does not widen permissions beyond the underlying lifecycle method.
- Destructive actions remain governed by existing explicit policy/tool annotations.
- Secrets are never persisted in receipts, Durable Objects, or task snapshots.
- Factory task IDs are owner-scoped and must not allow cross-owner lookup.

## 17. Testing Strategy

TDD is required.

Required layers:

1. **Pure controller tests**
   - action -> receipt -> deterministic transition,
   - stale/mismatched receipt fails closed,
   - failure receipt does not advance success state.

2. **Durable authority tests**
   - revisions serialize correctly,
   - stale expected revision is rejected,
   - no secret-bearing fields are persisted.

3. **Persistence/reconciliation tests**
   - successful side effect + failed save returns `RECONCILIATION_REQUIRED`,
   - resume detects external head advancement,
   - stale CI/diff evidence is invalidated,
   - legacy local snapshot cannot overwrite server/GitHub truth.

4. **Workspace adapter contract tests**
   - controller uses existing methods; no duplicate GitHub implementation.

5. **MCP/controller contract tests**
   - strict action allowlist,
   - task ID and revision binding,
   - low-level tool activity is reconciled before the next controller mutation.

6. **Integration test**
   - `inspect -> branch -> write -> compare -> PR -> CI` advances one server-authoritative CodeTask through receipts while preserving exact repository/head identity.

7. **Regression gate**
   - full `npm run deploy:gate` on exact PR head.

## 18. Delivery Slices

### Slice A — Durable Task Authority + Receipt Core

- add the one-task-per-Durable-Object storage seam,
- introduce Factory Controller module,
- normalize receipts,
- bind inspect/create-branch,
- prove revision and reconciliation-required behavior.

### Slice B — Mutation + Compare

- bind write/delete receipts,
- treat returned commit SHA as new task head,
- bind compare evidence and deterministic diff fingerprint,
- prove stale downstream evidence invalidation.

### Slice C — PR + CI + Failure Evidence

- bind PR receipts,
- bind exact-head CI receipts,
- attach failure evidence to the same run/task identity,
- prove stale-head invalidation.

### Slice D — Reconciliation + Operator Wiring

- refresh branch/PR/CI truth on resume,
- detect external advancement/conflict/missing resources,
- expose strict `go_hub_factory_action`,
- wire browser Code to the same controller authority,
- Workbench reads the resulting authoritative task snapshot.

## 19. Non-Goals

This design does not yet:

- implement staged multi-file atomic commits,
- implement local/preflight test execution,
- harden all QC evaluator/recorder boundaries,
- implement conflict resolution/rebase machinery,
- change merge base-freshness policy,
- implement production verification probes,
- implement operational rollback,
- implement backup/restore/migration drills,
- create Heimdall,
- redesign the Factory menu/UI,
- create a generic distributed workflow framework.

Those remain explicit later slices from the completed end-to-end audit.

## 20. Success Criteria

The Factory Controller Bridge is complete when all are true:

1. Browser and MCP Factory operations use one server-side task authority.
2. A real operational action produces a normalized immutable receipt.
3. The receipt is identity-bound to repository/branch/SHA/run/PR as applicable.
4. CodeTask advances from controller-derived reality rather than caller-declared operational success.
5. Trusted evidence is traceable to the receipt that produced it.
6. A head change invalidates stale downstream evidence automatically.
7. Persistence failure after a successful external side effect returns `RECONCILIATION_REQUIRED` with enough evidence to recover.
8. Resume reconciles persisted state against GitHub before the next mutation.
9. The integration path `inspect -> branch -> write -> compare -> PR -> CI` operates through one task truth set.
10. Existing GitHub workspace/lifecycle and QC modules are reused rather than replaced.
11. Raw low-level tool actions cannot silently advance Factory truth.
12. Full exact-head Safety Gate is green before merge.

## 21. Next Step After Spec Approval

After owner review of this written specification, create an implementation plan using the existing Factory sequence and TDD:

`Slice A -> exact-head CI -> Slice B -> exact-head CI -> Slice C -> exact-head CI -> Slice D -> full gate -> PR -> guarded merge -> main deploy verification`

No implementation starts before written-spec review is accepted.
