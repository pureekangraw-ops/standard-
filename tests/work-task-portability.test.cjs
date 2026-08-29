const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const adapter = require('../normalpocket-work-adapter.js');

const root = path.resolve(__dirname, '..');
const t1 = '2026-08-29T05:00:00.000Z';
const t2 = '2026-08-29T05:01:00.000Z';
const t3 = '2026-08-29T05:02:00.000Z';

test('a second host can use Work Task create edit query complete without NormalPocket state semantics', () => {
  const host = {
    lighthouse: { session: 'LH-SESSION', runtime: { intentVersion: 2 } },
    preferences: { compact: true },
  };

  const created = adapter.createTaskInState(host, {
    title: 'ทดสอบ capability',
    due: '2026-09-02',
    note: 'host ที่สอง',
  }, { now: t1, idFactory: () => 'TASK-LH-1' });

  assert.deepEqual(host, {
    lighthouse: { session: 'LH-SESSION', runtime: { intentVersion: 2 } },
    preferences: { compact: true },
  });
  assert.deepEqual(created.state.lighthouse, host.lighthouse);
  assert.deepEqual(created.state.preferences, host.preferences);

  const edited = adapter.editTaskInState(created.state, 'TASK-LH-1', { note: 'แก้จาก host ที่สอง' }, { now: t2 });
  assert.equal(edited.task.note, 'แก้จาก host ที่สอง');
  assert.deepEqual(adapter.queryTasksInState(edited.state, { text: 'capability' }).map(task => task.id), ['TASK-LH-1']);

  const completed = adapter.completeTaskInState(edited.state, 'TASK-LH-1', { now: t3 });
  assert.equal(completed.task.status, 'COMPLETED');
  assert.deepEqual(completed.state.lighthouse, host.lighthouse);
  assert.deepEqual(completed.state.preferences, host.preferences);
});

test('Work Task core and adapter have no forbidden host or finance dependencies', () => {
  const sources = [
    fs.readFileSync(path.join(root, 'normalpocket-work-core.js'), 'utf8'),
    fs.readFileSync(path.join(root, 'normalpocket-work-adapter.js'), 'utf8'),
  ].join('\n');

  const forbidden = [
    ['DOM document', /\bdocument\b/],
    ['IndexedDB', /\bindexedDB\b/],
    ['Vault ownership', /\bVAULT_KEY\b/],
    ['Ledger domain', /\bledger\b/i],
    ['money amount', /\bamountSatang\b/],
    ['installment semantics', /\binstallment\w*\b/i],
    ['Intent parser', /\b(?:parseIntent|resolveIntent|intentParser)\b/i],
  ];

  for (const [label, pattern] of forbidden) {
    assert.doesNotMatch(sources, pattern, `${label} must stay outside the portable Work Task capability`);
  }
});
