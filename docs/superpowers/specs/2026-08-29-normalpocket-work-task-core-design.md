# NormalPocket Work / Task Core Design

## Purpose

Extract a portable Work / Task capability from the task-like behavior currently embedded in NormalPocket without moving NormalPocket UI, encrypted storage, STORE/LEDGER money semantics, Calendar rendering, or LIGHT HOUSE Intent behavior into the capability.

## Source lock

- Repository: `pureekangraw-ops/standard-`
- Inspected base HEAD: `d74882d308d19df00ecb6c5ad4b0362df9cdcdfa`
- Release identity remains `1.3.1-mobile-polish`; release identity is not the same thing as current source HEAD or service-worker cache generation.
- `app.js` is the runtime source of current queue/task-like behavior.
- `core.js`, `domain.js`, `controller.js`, and `vault.js` are engineering references for separation and durable readback, not proof of production ownership.

## Architecture

Create a host-neutral pure module `normalpocket-work-core.js`. It owns only WorkTask data semantics and transitions. It must have no DOM, IndexedDB, Vault, STORE, LEDGER, payment, installment, natural-language Intent, or service-worker dependency.

NormalPocket integrates the core through `normalpocket-work-adapter.js`. The adapter maps WorkTask records to a host-owned `state.work.tasks` collection and exposes pure state transitions/query operations against a supplied state object. The adapter owns no persistence. NormalPocket production persistence remains owned by the existing app commit/readback path and is not changed by this capability.

The first integration deliberately does not replace `state.calendar` or migrate existing queue records. Calendar remains the host's finance/action queue. WorkTask is introduced as a separate portable capability so its contract can be proven without changing money behavior.

## Minimum record

```js
{
  id: string,
  title: string,
  status: 'OPEN' | 'COMPLETED' | 'CANCELLED',
  due: 'YYYY-MM-DD' | null,
  note: string,
  history: [{ at: string, event: string, note: string }],
  revision: positiveInteger,
  createdAt: isoDateTime,
  updatedAt: isoDateTime
}
```

## Core invariants

- `id` is stable and is never derived from UI text.
- `title` must be non-empty after trimming.
- `due` is date-only `YYYY-MM-DD` or `null`.
- Every mutation increments `revision`, updates `updatedAt`, and appends one history event.
- Closed records cannot be silently edited. `editTask` accepts only OPEN tasks.
- No destructive delete exists in the first contract; cancellation preserves trace.
- Core operations clone inputs and do not mutate caller-owned objects.

## Core API

```js
createTask(input, context?) -> WorkTask
editTask(task, patch, context?) -> WorkTask
completeTask(task, context?) -> WorkTask
cancelTask(task, context?) -> WorkTask
getTask(tasks, id) -> WorkTask | null
queryTasks(tasks, filter?) -> WorkTask[]
validateTask(task) -> { ok: boolean, errors: string[] }
```

`context` may provide `now` and `idFactory` for deterministic tests. `patch` is limited to `title`, `due`, and `note`.

## Host adapter contract

`normalpocket-work-adapter.js` owns only the host mapping into this NormalPocket-shaped state boundary:

```js
state.work = { tasks: WorkTask[] }
```

It provides:

```js
ensureWorkState(state) -> clonedState
createTaskInState(state, input, context?) -> { state, task }
editTaskInState(state, id, patch, context?) -> { state, task }
completeTaskInState(state, id, context?) -> { state, task }
cancelTaskInState(state, id, context?) -> { state, task }
queryTasksInState(state, filter?) -> WorkTask[]
```

The adapter must not write IndexedDB, Vault, filesystem storage, or any other persistence API itself. A host persists the returned state through a host-owned adapter/path.

## Query contract

Supported filters in the Owner-authorized first version are exactly:

- `id`: exact task id
- `status`: exact status
- `dueFrom`: inclusive date lower bound
- `dueTo`: inclusive date upper bound

Unsupported filter keys are rejected. In particular, the first contract does not include free-text search, exact-`due`, `dueBefore`, or `dueAfter` aliases.

Results are sorted by due date with undated tasks last, then by `createdAt`, then by `id` for deterministic ordering.

## Durable readback proof

Durability is proven only in a test-only isolated filesystem harness. It is not implemented by the Work Core or host adapter and does not change NormalPocket production persistence.

The proof uses `tests/helpers/isolated-durable-store.cjs` with all of these conditions:

1. create a temporary test root,
2. open a store with explicit test-only `namespace`, `database`, and `key`,
3. reject production database identity `ygph-standard-secure`,
4. create a WorkTask through the adapter,
5. commit the returned state to disk and sync it,
6. close that store instance,
7. open a new store instance using the same test-only identity,
8. read the state back,
9. deep-compare the durable state/task with the committed state/task,
10. close and remove the temporary test root.

This proves commit → close/reopen → readback across a real durable test boundary without using live user data or claiming that production device state changed.

## Portability proof

A second host-shaped state object with unrelated keys must be able to adopt `state.work.tasks` and run create/edit/query/complete without DOM or NormalPocket globals. This is the acceptance proof that the capability can later move into LIGHT HOUSE through an adapter instead of dragging NormalPocket host semantics with it.

## Explicit non-goals

- No natural-language Intent parsing.
- No replacement or migration of existing `state.calendar` records.
- No STORE/LEDGER payment effects.
- No installment semantics.
- No Vault/IndexedDB ownership transfer.
- No UI redesign.
- No production deploy in the implementation branch.
- No edits to DEF-STANDARD-001, DEF-STANDARD-004, or WATCH-STANDARD-001.

## Acceptance

The feature is ready for handoff when focused tests prove create/edit/query/complete/cancel, invalid transitions, host adapter isolation, the Owner-authorized query contract, isolated durable commit → close/reopen → readback, and portability; the full `npm run deploy:gate` passes; the PR diff contains no finance/calendar behavior changes; and the review pack documents what was and was not changed.