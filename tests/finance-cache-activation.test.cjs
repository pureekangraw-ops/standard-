const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('finance UI hotfix auto-activates instead of remaining behind the old serving cache', () => {
  assert.match(sw, /const CACHE_GENERATION = "v1\.3\.1-20260823-r9-finance-unified-light";/,
    'a fresh service-worker generation is required so browsers detect the hotfix');
  assert.match(sw, /const AUTO_ACTIVATE_CACHE_GENERATION = CACHE_GENERATION;/,
    'this UI-only cache refresh must explicitly opt into immediate activation');
  assert.match(sw, /shouldAutoActivateCurrentGeneration\(\)/,
    'the service worker must expose an explicit activation decision for this generation');
  assert.match(sw, /shouldAutoActivateLegacyBridge\(cacheNames, lifecycle\) \|\| shouldAutoActivateCurrentGeneration\(\)/,
    'install must skip waiting for the approved UI-only refresh while retaining the legacy bridge');
});
