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

NormalPocket integrates the core through `normalpocket-work-adapter.js`. The adapter maps WorkTask records to a host-owned `state.work.tasks` collection and exposes pure load/save/query operations against a supplied state object. NormalPocket persistence remains owned by the existing app commit/readback path.

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

`normalpocket-work-adapter.js` owns the NormalPocket state shape:

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

The adapter must not write IndexedDB or Vault itself. The host persists the returned state through its existing atomic commit/readback path.

## Query contract

Supported filters in the first version:

- `status`: exact status
- `due`: exact date or `null`
- `dueBefore`: inclusive date upper bound
- `dueAfter`: inclusive date lower bound
- `text`: case-insensitive substring over title and note

Results are sorted by due date with undated tasks last, then by `createdAt`, then by `id` for deterministic ordering.

## Durable readback proof

Durability is proven with a memory store test that mirrors the host contract:

1. create a WorkTask through the adapter,
2. write the returned state through a store boundary,
3. read the state back,
4. query by id,
5. assert the entire task survives exactly.

This proves the capability can cross a persistence boundary without using live user data. It is not a claim that production device state changed.

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

The feature is ready for handoff when focused tests prove create/edit/query/complete/cancel, invalid transitions, host adapter isolation, durable readback, and portability; the full `npm run deploy:gate` passes; the PR diff contains no finance/calendar behavior changes; and the review pack documents what was and was not changed.