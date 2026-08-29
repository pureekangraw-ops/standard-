const test = require('node:test');
const assert = require('node:assert/strict');

const adapter = require('../normalpocket-work-adapter.js');

const t1 = '2026-08-29T04:00:00.000Z';
const t2 = '2026-08-29T04:01:00.000Z';
const idFactory = () => 'TASK-A1';

function baseState() {
  return {
    lighthouse: { session: 'keep-me' },
    store: { stockQty: 7 },
    work: { tasks: [] },
  };
}

function createMemoryStore() {
  let value = null;
  return {
    async write(next) { value = structuredClone(next); },
    async read() { return structuredClone(value); },
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

test('queryTasksInState delegates filtering without exposing caller-owned task objects', () => {
  let state = baseState();
  state = adapter.createTaskInState(state, { title: 'ส่งลูกค้า', due: '2026-08-30' }, { now: t1, idFactory: () => 'TASK-1' }).state;
  state = adapter.createTaskInState(state, { title: 'ซื้อกล่อง', due: null }, { now: t2, idFactory: () => 'TASK-2' }).state;
  const results = adapter.queryTasksInState(state, { text: 'ลูกค้า' });
  assert.deepEqual(results.map(task => task.id), ['TASK-1']);
  results[0].title = 'mutated result';
  assert.equal(state.work.tasks[0].title, 'ส่งลูกค้า');
});

test('adapter state survives an isolated durable write-read boundary exactly', async () => {
  const store = createMemoryStore();
  const created = adapter.createTaskInState(baseState(), { title: 'ส่งเอกสาร', due: '2026-09-01', note: 'ชุด A' }, { now: t1, idFactory });
  await store.write(created.state);
  const durable = await store.read();
  const found = adapter.queryTasksInState(durable, { text: 'เอกสาร' });
  assert.equal(found.length, 1);
  assert.deepEqual(found[0], created.task);
  assert.deepEqual(durable.store, { stockQty: 7 });
  assert.deepEqual(durable.lighthouse, { session: 'keep-me' });
});
