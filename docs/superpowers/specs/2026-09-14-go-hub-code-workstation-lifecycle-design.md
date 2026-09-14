# GO Hub Code Workstation Lifecycle Design

Date: 2026-09-14
Status: Approved design draft
Owner: BIG
Primary operator: GO

## Purpose

Turn GO Hub Code from a workspace adapter that can reach GitHub into a complete, branch-safe operating workflow for GO. The target lifecycle is:

**Inspect → Branch → Edit → Diff → Test → Commit → PR → CI → Merge → Deploy → Verify → Resume/Audit**

The Hub remains GO's working environment. BIG retains owner authority and credentials; GO operates repos and delivery workflows inside explicit authority boundaries.

## Current baseline

The production Hub already has:
- a same-origin GitHub gateway under `/hub/api/github-workspace`,
- a browser-side `go-hub-github-workspace.js` adapter,
- Code capability wiring to `pureekangraw-ops/standard-`,
- verified private-repo read capability,
- server-side GitHub authentication,
- CI and Cloudflare deploy workflows.

Current limitations that this design addresses:
- workspace listing is root-file oriented rather than recursive,
- writes can target the default branch directly,
- Code lacks a first-class branch/commit/PR lifecycle,
- no durable diff/review surface before mutation,
- no explicit conflict/rebase workflow,
- deploy and post-deploy verification are not modeled as part of the coding task,
- resume/audit state is not yet a first-class workstation concept.

## Design principles

1. **Never treat `main` as the normal edit target.** Routine code work occurs on a task branch.
2. **Read broadly, write narrowly.** Inspect/search may be wide; mutation is scoped to the selected repo + branch + task.
3. **Evidence before transition.** Each lifecycle stage records evidence before the next stage becomes authoritative.
4. **Diff before commit.** GO must be able to inspect what changed before creating a commit.
5. **CI before merge.** Merge authority may be automated when policy allows, but only after required checks are green.
6. **Deploy is not completion.** Completion requires post-deploy verification.
7. **Resume is durable.** A task can be interrupted and continued without reconstructing branch, repo, files, CI, or last verified state from memory.
8. **Audit without fragmenting authority.** Spawned specialist GO instances may perform subtasks, but state returns to one Hub task record.

## Lifecycle model

### 1. Inspect

Goal: establish repository truth before editing.

Capabilities:
- recursive repository tree,
- file read by path,
- path search / filename search,
- branch metadata,
- current default branch and SHA,
- PR and CI state for an existing work branch,
- deploy target metadata when available.

Output recorded in task state:
- repository,
- base branch + base SHA,
- relevant paths,
- active PR if any,
- current CI/deploy state,
- task intent and constraints.

### 2. Branch

Goal: create or select an isolated work branch.

Rules:
- new implementation work defaults to a task branch from the latest verified base SHA,
- if a matching branch already exists, GO may resume it after checking divergence,
- direct default-branch writes are rejected by the Hub coding workflow unless an explicit owner-authorized maintenance mode is active.

Task state records:
- branch name,
- branch head SHA,
- base SHA,
- branch creation/resume event.

### 3. Edit

Goal: apply one or more file changes to the selected branch.

Capabilities:
- create/update/delete UTF-8 text files,
- batch staged-change model in the Hub,
- file-level validation before sending mutations,
- safe-path checks,
- optimistic concurrency with expected blob/head SHA.

Design choice:
The browser should not carry GitHub credentials. All authenticated mutation continues through the same-origin gateway.

### 4. Diff

Goal: make pending or committed change evidence visible before commit/PR.

Capabilities:
- unified diff for pending staged changes,
- changed-file summary,
- additions/deletions counts,
- compare branch vs base,
- discard/revert an individual pending change before commit.

The Hub task record stores a hash/summary of the reviewed diff so later stages can show whether the branch changed after review.

### 5. Test

Goal: verify the change before commit/PR transition when feasible.

Capabilities:
- repo-defined test commands or CI preflight metadata,
- syntax/static gates,
- capture exit status and concise evidence,
- distinguish local/preflight evidence from GitHub Actions evidence.

For browser-only Hub execution where commands cannot run locally, GO may commit and rely on branch CI, but the task record must explicitly mark local test evidence as unavailable rather than pretending it ran.

### 6. Commit

Goal: produce a branch commit representing the reviewed change set.

Capabilities:
- commit one or many file mutations to the work branch,
- commit message generated from task intent + actual diff,
- expected branch-head guard to prevent accidental overwrite,
- return commit SHA as evidence.

Preferred gateway evolution:
Move from single-file direct default-branch writes toward explicit branch-aware commit operations. Multi-file atomic commits are preferred where practical.

### 7. PR

Goal: expose the work as a reviewable integration unit.

Capabilities:
- create PR,
- update PR title/body,
- attach task summary, tests, risks, and rollback notes,
- detect existing PR for the branch and update rather than duplicate.

The PR body should include:
- intent,
- changed scope,
- verification performed,
- known unknowns/conflicts,
- deploy implications.

### 8. CI

Goal: treat CI as authoritative integration evidence.

Capabilities:
- fetch checks/workflow runs for branch/PR head SHA,
- job/step summaries,
- failed-log retrieval,
- rerun failed jobs when permitted,
- map failure to likely owning file/stage.

Task state records the exact head SHA tested. If the branch head changes, prior green CI becomes stale.

### 9. Merge

Goal: integrate only verified work.

Rules:
- merge only when PR is mergeable and required checks for current head SHA are green,
- destructive or high-impact merges can require explicit owner approval by policy,
- routine merges may proceed under standing authority,
- expected-head SHA must be supplied when supported to prevent race merges.

Task state records merge commit SHA and merge method.

### 10. Deploy

Goal: observe the delivery pipeline triggered by merge.

Capabilities:
- discover workflow run(s) caused by merge SHA,
- track deploy job state,
- retrieve deploy logs on failure,
- distinguish CI success from deploy success.

Deploy success alone does not complete the task.

### 11. Verify

Goal: prove the resulting system behavior in the deployed environment.

Capabilities:
- smoke read for expected endpoint/resource,
- lightweight functional probe for the changed capability,
- version/commit correlation where possible,
- explicit verification result with evidence and timestamp.

For state-changing smoke tests, use non-destructive targets or temporary branch/test fixtures; do not mutate production data merely to prove connectivity.

### 12. Resume / Audit

Goal: make GO Hub a durable coding workstation rather than a stateless front end.

Each task keeps a compact state record:
- task id and intent,
- repository,
- base branch/SHA,
- work branch/head SHA,
- touched paths,
- reviewed diff fingerprint,
- test evidence,
- commit SHA(s),
- PR number/state,
- CI run ids + result,
- merge SHA,
- deploy run ids + result,
- verification evidence,
- blocker/conflict state,
- next authorized action,
- operator events / spawned specialist notes.

The authoritative task record lives in Hub persistence, while GitHub remains authoritative for source, branch, commit, PR, and Actions state.

## Conflict and rebase handling

Conflicts are a first-class lifecycle state, not a generic error.

When the base moves:
1. compare work branch against latest base,
2. determine whether branch is behind/diverged,
3. attempt safe update/rebase only when policy and tooling support it,
4. if conflicts exist, identify exact files and conflict evidence,
5. prevent merge until conflicts are resolved and CI reruns on the new head SHA.

The Hub must never silently force-update a branch to bypass conflict evidence.

## Rollback model

Rollback exists at multiple levels:
- pending edit: discard staged change,
- committed branch edit: revert/reset within task branch before merge,
- merged code: create a revert branch/PR from the merge commit,
- deployed release: use deployment/platform rollback only when supported and authorized.

Rollback actions must be audit-recorded and should prefer reversible Git history over destructive force operations.

## Gateway capability expansion

The current gateway should evolve into explicit capability groups rather than a generic arbitrary GitHub proxy.

Proposed groups:
- repository inspection: tree, file, search, refs,
- branch operations: create/select/status,
- content mutation: branch-aware create/update/delete,
- commit/compare/diff,
- pull requests,
- CI / workflow visibility and permitted reruns,
- merge,
- deploy observation.

Security rules:
- allowlisted owner/repositories,
- server-side token only,
- validate branch and path inputs,
- reject default-branch routine writes,
- explicit operation audit records,
- no secret-management endpoints in GO operator scope,
- destructive/high-impact operations gated by policy.

## Code capability UX for GO

The Code module should expose machine-useful status first, not human-dashboard decoration.

Minimum operator view:
- active repo,
- base + work branch,
- branch/head status,
- changed files / diff state,
- verification state,
- PR + CI state,
- deploy state,
- blocker/conflict,
- next authorized action.

This lets GO enter the Hub and immediately answer: **Where am I, what changed, what is verified, what is blocked, and what can I do next?**

## State machine

Suggested task states:

`INSPECTING`
→ `BRANCH_READY`
→ `EDITING`
→ `DIFF_REVIEWED`
→ `TESTED_OR_TEST_DEFERRED`
→ `COMMITTED`
→ `PR_OPEN`
→ `CI_RUNNING`
→ `CI_GREEN`
→ `MERGED`
→ `DEPLOYING`
→ `DEPLOYED`
→ `VERIFIED`

Side states:
- `BLOCKED`
- `CONFLICT`
- `CI_FAILED`
- `DEPLOY_FAILED`
- `VERIFY_FAILED`
- `ROLLBACK_IN_PROGRESS`

Transitions always carry the head/commit SHA that makes their evidence valid.

## Delivery slices

Implement in slices so each stage is useful and verifiable:

### Slice A — Inspect + recursive tree
- recursive tree endpoint,
- branch-aware file read,
- repository/branch status,
- Code module task context.

### Slice B — Branch-safe mutation + diff
- create/select branch,
- branch-aware edits,
- staged change/diff review,
- block routine default-branch write.

### Slice C — Commit + PR + CI
- commit workflow,
- PR create/update,
- CI status/logs/reruns,
- stale-head detection.

### Slice D — Merge + deploy + verify
- merge with head guard,
- deploy run tracking,
- post-deploy smoke verification,
- rollback entry points.

### Slice E — Resume + audit
- durable task state,
- next-action routing,
- operator/audit events,
- specialist handoff return path.

## Testing strategy

Use TDD for each slice.

Required test layers:
- pure unit tests for validation/state transitions,
- Worker contract tests for GitHub request/response mapping,
- adapter tests proving no browser Authorization header,
- integration tests for shell/Code wiring,
- publication parity tests when active runtime assets change,
- CI workflow verification,
- production smoke tests after deploy.

Critical regression tests:
- routine edit cannot write `main`,
- CI evidence becomes stale when branch head changes,
- merge refuses stale expected head,
- conflict state blocks merge,
- deploy success without smoke verification is not marked complete,
- resume restores repo/branch/PR/CI/next-action state.

## Success criteria

The design is complete when GO can, from GO Hub:
1. inspect a repo recursively,
2. isolate work on a branch,
3. edit one or more files safely,
4. inspect the diff,
5. capture test evidence,
6. commit to the work branch,
7. open/update a PR,
8. inspect and react to CI,
9. merge only verified current-head work,
10. track deploy,
11. verify the deployed result,
12. resume the task later with full operational context,
13. inspect an audit trail of material actions.

At that point GO Hub Code is no longer merely connected to GitHub; it functions as GO's end-to-end coding workstation.
