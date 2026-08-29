const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const adapter = require('../normalpocket-work-adapter.js');
const { openIsolatedDurableStore } = require('./helpers/isolated-durable-store.cjs');

const t1 = '2026-08-29T04:00:00.000Z';
const t2 = '2026-08-29T04:01:00.000Z';
const t3 = '2026-08-29T04:02:00.000Z';
const idFactory = () => 'TASK-A1';

function baseState() {
  return {
    lighthouse: { session: 'keep-me' },
    store: { stockQty: 7 },
    work: { tasks: [] },
  };
}

test('ensureWorkState clones the host and initializes work.tasks without touching unrelated keys', () => {
  const source = { lighthouse: { session: 'x' }, store: { stockQty: 3 } };
  const next = adapter.ensureWorkState(source);
  assert.notEqual(next, source);
  assert.deepEqual(next.lighthouse, { session: 'x' });
  assert.deepEqual(next.store, { stockQty: 3 });
  assert.deepEqual(next.work, { tasks: [] });
  assert.equal(source.work, undefined);
});

test('createTaskInState and editTaskInState preserve unrelated host state and return cloned states', () => {
  const source = baseState();
  const created = adapter.createTaskInState(source, { title: ' แพ็กของ ', due: '2026-08-30' }, { now: t1, idFactory });
  assert.equal(source.work.tasks.length, 0);
  assert.equal(created.task.id, 'TASK-A1');
  assert.equal(created.state.work.tasks.length, 1);
  assert.deepEqual(created.state.store, { stockQty: 7 });
  assert.deepEqual(created.state.lighthouse, { session: 'keep-me' });

  const edited = adapter.editTaskInState(created.state, 'TASK-A1', { note: 'โทรก่อน' }, { now: t2 });
  assert.equal(created.state.work.tasks[0].note, '');
  assert.equal(edited.task.note, 'โทรก่อน');
  assert.equal(edited.task.revision, 2);
  assert.deepEqual(edited.state.store, { stockQty: 7 });
});

test('queryTasksInState delegates the authorized query contract without exposing caller-owned task objects', () => {
  let state = baseState();
  state = adapter.createTaskInState(state, { title: 'ส่งลูกค้า', due: '2026-08-30' }, { now: t1, idFactory: () => 'TASK-1' }).state;
  state = adapter.createTaskInState(state, { title: 'ซื้อกล่อง', due: null }, { now: t2, idFactory: () => 'TASK-2' }).state;
  const results = adapter.queryTasksInState(state, { id: 'TASK-1', dueFrom: '2026-08-30', dueTo: '2026-08-30' });
  assert.deepEqual(results.map(task => task.id), ['TASK-1']);
  results[0].title = 'mutated result';
  assert.equal(state.work.tasks[0].title, 'ส่งลูกค้า');
});

test('adapter state survives isolated durable commit close reopen readback exactly', async t => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'normalpocket-work-task-'));
  t.after(async () => fs.rm(rootDir, { recursive: true, force: true }));

  const locator = {
    rootDir,
    namespace: 'normalpocket-work-task-core-test',
    database: 'work-task-durable-test',
    key: 'state-A',
  };

  const created = adapter.createTaskInState(baseState(), { title: 'ส่งเอกสาร', due: '2026-09-01', note: 'ชุด A' }, { now: t1, idFactory });

  const writer = await openIsolatedDurableStore(locator);
  await writer.commit(created.state);
  await writer.close();

  const reader = await openIsolatedDurableStore(locator);
  const durable = await reader.read();
  await reader.close();

  assert.deepEqual(durable, created.state);
  const found = adapter.queryTasksInState(durable, { id: 'TASK-A1' });
  assert.equal(found.length, 1);
  assert.deepEqual(found[0], created.task);
  assert.deepEqual(durable.store, { stockQty: 7 });
  assert.deepEqual(durable.lighthouse, { session: 'keep-me' });
});

test('isolated durable proof refuses the real NormalPocket database identity', async () => {
  await assert.rejects(
    () => openIsolatedDurableStore({
      rootDir: os.tmpdir(),
      namespace: 'normalpocket-work-task-core-test',
      database: 'ygph-standard-secure',
      key: 'state-A',
    }),
    /forbidden|production|ygph-standard-secure/i,
  );
});

test('completeTaskInState closes by id without mutating previous host state', () => {
  const created = adapter.createTaskInState(baseState(), { title: 'ส่งของ' }, { now: t1, idFactory });
  const closed = adapter.completeTaskInState(created.state, 'TASK-A1', { now: t2 });
  assert.equal(created.state.work.tasks[0].status, 'OPEN');
  assert.equal(closed.task.status, 'COMPLETED');
  assert.equal(closed.task.revision, 2);
  assert.deepEqual(closed.state.store, { stockQty: 7 });
  assert.deepEqual(adapter.queryTasksInState(closed.state, { status: 'COMPLETED' }).map(task => task.id), ['TASK-A1']);
});

test('cancelTaskInState closes by id and preserves cancellation history note', () => {
  const created = adapter.createTaskInState(baseState(), { title: 'โทรลูกค้า' }, { now: t1, idFactory });
  const closed = adapter.cancelTaskInState(created.state, 'TASK-A1', { now: t3, note: 'ลูกค้ายกเลิก' });
  assert.equal(created.state.work.tasks[0].status, 'OPEN');
  assert.equal(closed.task.status, 'CANCELLED');
  assert.deepEqual(closed.task.history.at(-1), { at: t3, event: 'CANCELLED', note: 'ลูกค้ายกเลิก' });
  assert.deepEqual(closed.state.lighthouse, { session: 'keep-me' });
  assert.deepEqual(adapter.queryTasksInState(closed.state, { status: 'CANCELLED' }).map(task => task.id), ['TASK-A1']);
});
