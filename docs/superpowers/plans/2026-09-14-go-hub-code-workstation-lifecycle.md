# GO Hub Code Workstation Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn GO Hub Code into a branch-safe end-to-end coding workstation covering Inspect → Branch → Edit → Diff → Test → Commit → PR → CI → Merge → Deploy → Verify → Resume/Audit.

**Architecture:** Extend the existing same-origin GitHub Worker gateway with explicit, allowlisted GitHub capabilities rather than a generic proxy. Keep browser code credential-free, add branch-aware operations and lifecycle state, and make every transition SHA-bound so stale CI, conflicts, merges, deploys, and resume state can be reasoned about safely.

**Tech Stack:** Cloudflare Worker ES modules, browser ES modules, GitHub REST API, Node 22 `node:test`, GitHub Actions, Cloudflare Workers deployment.

**Spec:** `docs/superpowers/specs/2026-09-14-go-hub-code-workstation-lifecycle-design.md`

## Global Constraints

- Never treat `main` as the normal edit target.
- Browser/PWA never receives a GitHub token; authenticated requests stay server-side.
- Routine writes to the default branch must be rejected by the GO Hub coding workflow.
- Evidence is valid only for the exact branch/head/commit SHA it was gathered against.
- CI must be green for the current PR head before merge.
- Deploy success is not task completion; post-deploy verification is required.
- Conflict and rollback are explicit lifecycle states/actions, never silent force operations.
- GitHub remains authoritative for source/branch/commit/PR/Actions state; Hub persistence owns compact task/resume/audit state.
- Existing release-publication parity (`RELEASE_MANIFEST.json`, `.assetsignore`, `go-hub-sw.js`) must remain synchronized when active runtime assets change.
- TDD is required: failing test first, verify RED, minimal implementation, verify GREEN, then commit.

---

## File Structure

- `go-hub-worker.mjs` — server-side GitHub capability gateway; repository/branch validation; tree/file/ref/compare/PR/CI/merge operations.
- `go-hub-github-workspace.js` — browser adapter over same-origin gateway; never sends Authorization.
- `go-hub-code-task.js` — new pure lifecycle/task state machine with SHA-bound transitions, blocker/conflict/stale evidence handling, and audit events.
- `go-hub-code-module.js` — exposes workstation readiness and active task context to GO Hub runtime.
- `go-hub-shell.js` — composes workspace + lifecycle task into Code capability.
- `go-hub-persistence.js` — reused persistence mechanics for durable task snapshots; only touched if an adapter seam is needed.
- `tests/go-hub-worker-workstation.test.cjs` — Worker contract tests for tree/branch/read/write/default-branch protection/compare/PR/CI/merge.
- `tests/go-hub-github-workspace.test.cjs` — browser adapter tests, no auth header, branch-aware calls.
- `tests/go-hub-code-task.test.cjs` — pure lifecycle state tests.
- `tests/go-hub-code-module.test.cjs` — capability readiness/task integration.
- `tests/go-hub-code-workstation.integration.test.cjs` — shell composition and resume/next-action integration.
- `tests/go-hub-active-publication.test.cjs` — updated only if a new active runtime file is published.
- `RELEASE_MANIFEST.json`, `.assetsignore`, `go-hub-sw.js`, `package.json` — publication/syntax updates when `go-hub-code-task.js` becomes active runtime.

---

### Task 1: Slice A — Recursive Inspect + Branch Context

**Files:**
- Modify: `go-hub-worker.mjs`
- Modify: `go-hub-github-workspace.js`
- Create: `tests/go-hub-worker-workstation.test.cjs`
- Create/Modify: `tests/go-hub-github-workspace.test.cjs`

**Interfaces:**
- Produces `workspace.inspect({ branch }) -> { repository, defaultBranch, branch, headSha, baseSha, tree }`.
- Produces `workspace.readText(path, { branch }) -> string`.
- Worker endpoints: `GET /inspect?repository=&branch=`, `GET /tree?repository=&ref=`, branch-aware `GET /file`.

- [ ] **Step 1: Write failing Worker tests for recursive tree and branch-aware inspect/read**

Test fixtures must assert that GitHub requests use `git/trees/<sha>?recursive=1`, branch metadata is returned, and file reads include `?ref=<branch>`.

- [ ] **Step 2: Run `node --test tests/go-hub-worker-workstation.test.cjs` and verify RED**

Expected: route/contract assertions fail because `/inspect` and `/tree` do not exist and `/file` ignores ref.

- [ ] **Step 3: Implement minimal Worker inspect/tree/ref-aware read support**

Add strict branch/ref validation, fetch repository default branch, resolve selected branch, return exact SHA evidence, and map recursive tree entries to `{path,type,sha}`.

- [ ] **Step 4: Write failing adapter tests for `inspect`, recursive `listTree`, and branch-aware `readText`**

Assert requests are same-origin and contain no `Authorization` header.

- [ ] **Step 5: Run adapter tests and verify RED**

- [ ] **Step 6: Implement minimal adapter methods and verify GREEN**

- [ ] **Step 7: Run full `npm run deploy:gate`**

Expected: exit 0 before moving to Slice B.

- [ ] **Step 8: Commit Slice A**

Commit message: `feat: add recursive GO Hub repository inspection`

---

### Task 2: Slice B — Branch-Safe Mutation + Diff

**Files:**
- Modify: `go-hub-worker.mjs`
- Modify: `go-hub-github-workspace.js`
- Create: `go-hub-code-task.js`
- Create: `tests/go-hub-code-task.test.cjs`
- Modify: `tests/go-hub-worker-workstation.test.cjs`
- Modify: `tests/go-hub-github-workspace.test.cjs`
- Modify publication files if `go-hub-code-task.js` is wired into runtime.

**Interfaces:**
- `workspace.createBranch({ name, fromSha }) -> { branch, headSha }`.
- `workspace.writeText(path, content, { branch, expectedSha })` and delete equivalent must require non-default branch.
- `workspace.compare({ base, head }) -> { files, aheadBy, behindBy, status }`.
- `createCodeTask(initial)` exposes immutable state transitions and `nextAction`.

- [ ] **Step 1: Write failing tests proving routine mutation to `main` is rejected**

Assert 409/403-style Hub policy response and no upstream PUT when branch is the default branch.

- [ ] **Step 2: Write failing tests for create-branch, branch-aware create/update/delete, optimistic SHA guard, and compare/diff**

- [ ] **Step 3: Run targeted tests and verify RED**

- [ ] **Step 4: Implement Worker branch/mutation/compare operations minimally**

Use Git refs for branch creation, Contents API with explicit `branch`, and compare endpoint for branch-vs-base diff evidence. Never force-update refs.

- [ ] **Step 5: Add adapter methods and verify adapter GREEN**

- [ ] **Step 6: Write failing lifecycle tests for `INSPECTING → BRANCH_READY → EDITING → DIFF_REVIEWED`, blocker/conflict side states, and SHA invalidation**

- [ ] **Step 7: Implement `go-hub-code-task.js` minimal pure state machine**

Every transition records timestamp/event, exact SHA evidence, and computes `nextAction`.

- [ ] **Step 8: Wire `go-hub-code-task.js` into active publication and syntax gate**

Update `RELEASE_MANIFEST.json`, `.assetsignore`, `go-hub-sw.js`, `package.json`, and publication tests together.

- [ ] **Step 9: Run full deploy gate and commit Slice B**

Commit message: `feat: make GO Hub edits branch safe`

---

### Task 3: Slice C — Commit/PR/CI + Stale-Head Protection

**Files:**
- Modify: `go-hub-worker.mjs`
- Modify: `go-hub-github-workspace.js`
- Modify: `go-hub-code-task.js`
- Modify tests from Tasks 1–2.

**Interfaces:**
- `workspace.openPullRequest({ branch, base, title, body })`.
- `workspace.getPullRequest({ number })`.
- `workspace.getCI({ sha }) -> { runs/checks }`.
- `workspace.rerunFailed({ runId })` when authorized.
- Task transitions: `COMMITTED → PR_OPEN → CI_RUNNING → CI_GREEN|CI_FAILED`.

- [ ] **Step 1: Write failing PR tests**

Cover create-vs-update existing PR behavior and exact head/base preservation.

- [ ] **Step 2: Write failing CI tests**

Cover workflow runs bound to exact head SHA and failed-job rerun mapping.

- [ ] **Step 3: Write lifecycle regression test: prior green CI becomes stale when head SHA changes**

- [ ] **Step 4: Run targeted tests and verify RED**

- [ ] **Step 5: Implement minimal Worker PR/CI endpoints**

Keep endpoints explicit and owner/repo allowlisted; no arbitrary GitHub proxy route.

- [ ] **Step 6: Implement adapter methods and lifecycle transitions**

- [ ] **Step 7: Run full deploy gate and commit Slice C**

Commit message: `feat: add PR and CI lifecycle to GO Hub Code`

---

### Task 4: Slice D — Merge + Deploy + Verify + Rollback Entry

**Files:**
- Modify: `go-hub-worker.mjs`
- Modify: `go-hub-github-workspace.js`
- Modify: `go-hub-code-task.js`
- Modify workstation tests.

**Interfaces:**
- `workspace.mergePullRequest({ number, expectedHeadSha, method })`.
- `workspace.getWorkflowRuns({ sha })` for merge/deploy observation.
- Task transitions: `CI_GREEN → MERGED → DEPLOYING → DEPLOYED → VERIFIED`.
- Verification records `{kind,target,status,evidence,timestamp}`.

- [ ] **Step 1: Write failing merge tests for stale expected head and non-green/current CI**

- [ ] **Step 2: Write failing task tests proving deploy success alone cannot mark task complete**

- [ ] **Step 3: Write failing rollback-state tests for pending edit, branch commit, and merged-code revert entry points**

- [ ] **Step 4: Run targeted tests and verify RED**

- [ ] **Step 5: Implement guarded merge + deploy observation APIs**

Use exact expected head SHA and return merge SHA; expose workflow runs for that merge SHA.

- [ ] **Step 6: Implement verification and rollback lifecycle state**

Verification itself remains an explicit caller-supplied probe result; the task model refuses `VERIFIED` without successful evidence.

- [ ] **Step 7: Run full deploy gate and commit Slice D**

Commit message: `feat: close GO Hub Code merge deploy verify loop`

---

### Task 5: Slice E — Durable Resume + Audit + Operator Surface

**Files:**
- Modify: `go-hub-code-module.js`
- Modify: `go-hub-shell.js`
- Modify: `go-hub-code-task.js`
- Reuse/Modify: `go-hub-persistence.js` only if required by existing persistence interface.
- Create/Modify: `tests/go-hub-code-workstation.integration.test.cjs`
- Modify: `tests/go-hub-code-module.test.cjs`

**Interfaces:**
- Code capability exposes `task`, `nextAction`, `blocker`, repo/base/work branch/head, PR/CI/deploy/verify summaries.
- Durable snapshot contains task id, intent, repo, SHAs, touched paths, diff fingerprint, CI/deploy/verification evidence, blocker, next action, and audit events.

- [ ] **Step 1: Write failing resume test**

Persist a task snapshot mid-CI, restore it, and assert repo/branch/PR/head SHA/CI/nextAction are identical.

- [ ] **Step 2: Write failing operator-surface test**

Assert Code exposes machine-useful lifecycle status rather than only generic `ready/read-only`.

- [ ] **Step 3: Write failing specialist-return audit test**

Assert a spawned specialist note is appended to one central task audit record without creating a second authority record.

- [ ] **Step 4: Run targeted tests and verify RED**

- [ ] **Step 5: Implement minimal durable snapshot/restore and Code capability projection**

- [ ] **Step 6: Wire shell composition and restore path**

- [ ] **Step 7: Run full `npm run deploy:gate`**

Expected: all tests, syntax, UTF-8, and no-ride gates exit 0.

- [ ] **Step 8: Commit Slice E**

Commit message: `feat: add durable GO Hub Code resume and audit`

---

### Task 6: Integration PR, Main Verification, Production Smoke

**Files:**
- No new production files unless verification finds a defect.

**Interfaces:**
- Branch PR contains all Slice A–E commits.

- [ ] **Step 1: Re-read spec and verify every success criterion maps to implemented behavior/tests**

- [ ] **Step 2: Run fresh full deploy gate on final head**

- [ ] **Step 3: Open PR to `main` with scope, verification, risks, and rollback notes**

- [ ] **Step 4: Wait for/inspect PR Safety Gate for exact head SHA**

- [ ] **Step 5: Merge only if current-head checks are green and PR is mergeable**

- [ ] **Step 6: Verify main Safety Gate and GO Hub Deploy for merge SHA**

- [ ] **Step 7: Production smoke**

Perform non-destructive reads against GO Hub Worker for inspect/tree/branch metadata and verify deployed Code runtime references the workstation adapter/task files. Do not mutate `main` as a smoke test.

- [ ] **Step 8: Record any remaining gateway/tool-safety limitation as an explicit blocker rather than masking it**

---

## Self-Review

- Spec coverage: all lifecycle stages, conflict, rollback, branch safety, stale CI, deploy verification, resume/audit, and operator surface map to Tasks 1–6.
- Placeholder scan: no TBD/TODO/"implement later" instructions remain.
- Type consistency: browser workspace methods and task transition names are defined once and reused by later tasks.
- Delivery order is dependency-safe: inspect → branch/diff/task model → PR/CI → merge/deploy/verify → persistence/operator surface → integration.
