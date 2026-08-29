const test = require('node:test');
const assert = require('node:assert/strict');

const core = require('../normalpocket-work-core.js');

function idFactory(prefix) {
  return `${prefix}-001`;
}

const t1 = '2026-08-29T03:30:00.000Z';
const t2 = '2026-08-29T03:31:00.000Z';

test('createTask creates a deterministic OPEN task with trimmed fields and creation history', () => {
  const task = core.createTask({ title: '  ส่งของ  ', due: '2026-08-30', note: '  หน้าร้าน  ' }, { now: t1, idFactory });
  assert.deepEqual(task, {
    id: 'TASK-001',
    title: 'ส่งของ',
    status: 'OPEN',
    due: '2026-08-30',
    note: 'หน้าร้าน',
    history: [{ at: t1, event: 'CREATED', note: '' }],
    revision: 1,
    createdAt: t1,
    updatedAt: t1,
  });
});

test('createTask rejects blank title and invalid date-only due', () => {
  assert.throws(() => core.createTask({ title: '   ' }, { now: t1, idFactory }), /title/i);
  assert.throws(() => core.createTask({ title: 'งาน', due: '2026-02-30' }, { now: t1, idFactory }), /due/i);
});

test('editTask returns a new task, preserves the input, and appends revision history', () => {
  const original = core.createTask({ title: 'งานเดิม', due: null, note: '' }, { now: t1, idFactory });
  const edited = core.editTask(original, { title: ' งานใหม่ ', due: '2026-09-01', note: ' โทรก่อน ' }, { now: t2 });
  assert.equal(original.title, 'งานเดิม');
  assert.equal(original.revision, 1);
  assert.equal(edited.title, 'งานใหม่');
  assert.equal(edited.due, '2026-09-01');
  assert.equal(edited.note, 'โทรก่อน');
  assert.equal(edited.revision, 2);
  assert.equal(edited.updatedAt, t2);
  assert.deepEqual(edited.history, [
    { at: t1, event: 'CREATED', note: '' },
    { at: t2, event: 'EDITED', note: 'title,due,note' },
  ]);
});

test('editTask accepts only title due and note patches', () => {
  const task = core.createTask({ title: 'งาน' }, { now: t1, idFactory });
  assert.throws(() => core.editTask(task, { status: 'COMPLETED' }, { now: t2 }), /patch/i);
});

test('getTask returns a clone and null when the id does not exist', () => {
  const task = core.createTask({ title: 'งาน' }, { now: t1, idFactory });
  const found = core.getTask([task], task.id);
  assert.deepEqual(found, task);
  assert.notEqual(found, task);
  found.title = 'เปลี่ยนเฉพาะ clone';
  assert.equal(task.title, 'งาน');
  assert.equal(core.getTask([task], 'TASK-missing'), null);
});

test('queryTasks filters text and status and sorts dated tasks before undated tasks deterministically', () => {
  const a = core.createTask({ title: 'ซื้อกล่อง', due: null, note: 'คลัง' }, { now: '2026-08-29T01:00:00.000Z', idFactory: () => 'TASK-C' });
  const b = core.createTask({ title: 'โทรลูกค้า', due: '2026-08-31', note: 'ด่วน' }, { now: '2026-08-29T02:00:00.000Z', idFactory: () => 'TASK-B' });
  const c = core.createTask({ title: 'ส่งลูกค้า', due: '2026-08-30', note: 'กล่องใหญ่' }, { now: '2026-08-29T03:00:00.000Z', idFactory: () => 'TASK-A' });
  assert.deepEqual(core.queryTasks([a, b, c]).map(item => item.id), ['TASK-A', 'TASK-B', 'TASK-C']);
  assert.deepEqual(core.queryTasks([a, b, c], { text: 'ลูกค้า', status: 'OPEN' }).map(item => item.id), ['TASK-A', 'TASK-B']);
  assert.deepEqual(core.queryTasks([a, b, c], { dueBefore: '2026-08-30' }).map(item => item.id), ['TASK-A']);
  assert.deepEqual(core.queryTasks([a, b, c], { dueAfter: '2026-08-31' }).map(item => item.id), ['TASK-B']);
  assert.deepEqual(core.queryTasks([a, b, c], { due: null }).map(item => item.id), ['TASK-C']);
});

test('validateTask reports invalid task data instead of throwing', () => {
  const result = core.validateTask({ id: '', title: '', status: 'BROKEN', due: 'bad', history: [], revision: 0, createdAt: 'bad', updatedAt: 'bad' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 5);
});

test('completeTask closes an OPEN task immutably and records history', () => {
  const task = core.createTask({ title: 'ส่งของ' }, { now: t1, idFactory });
  const completed = core.completeTask(task, { now: t2 });
  assert.equal(task.status, 'OPEN');
  assert.equal(completed.status, 'COMPLETED');
  assert.equal(completed.revision, 2);
  assert.equal(completed.updatedAt, t2);
  assert.deepEqual(completed.history.at(-1), { at: t2, event: 'COMPLETED', note: '' });
});

test('cancelTask closes an OPEN task immutably and records history', () => {
  const task = core.createTask({ title: 'ส่งของ' }, { now: t1, idFactory });
  const cancelled = core.cancelTask(task, { now: t2, note: 'ไม่ต้องส่งแล้ว' });
  assert.equal(task.status, 'OPEN');
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(cancelled.revision, 2);
  assert.deepEqual(cancelled.history.at(-1), { at: t2, event: 'CANCELLED', note: 'ไม่ต้องส่งแล้ว' });
});

test('closed tasks reject edit and repeated close transitions', () => {
  const task = core.createTask({ title: 'ส่งของ' }, { now: t1, idFactory });
  const completed = core.completeTask(task, { now: t2 });
  assert.throws(() => core.editTask(completed, { note: 'เปลี่ยนย้อนหลัง' }, { now: '2026-08-29T03:32:00.000Z' }), /OPEN/i);
  assert.throws(() => core.completeTask(completed, { now: '2026-08-29T03:32:00.000Z' }), /OPEN/i);
  assert.throws(() => core.cancelTask(completed, { now: '2026-08-29T03:32:00.000Z' }), /OPEN/i);
});
