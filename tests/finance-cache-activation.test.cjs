const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const runtime = require('../sw.js');

test('GO Hub root cutover receives a fresh cache generation without auto-activating over installed clients', () => {
  assert.match(sw, /const CACHE_GENERATION = "v1\.3\.1-20260913-r10-go-hub-root-cutover";/,
    'root cutover requires a fresh compatibility cache generation');
  assert.match(sw, /const AUTO_ACTIVATE_CACHE_GENERATION = "v1\.3\.1-20260823-r9-finance-unified-light";/,
    'the previous UI-only generation remains the last auto-activation authority');
  assert.equal(runtime.shouldAutoActivateCurrentGeneration(), false,
    'root ownership cutover must wait for explicit activation rather than silently taking over installed clients');
});
