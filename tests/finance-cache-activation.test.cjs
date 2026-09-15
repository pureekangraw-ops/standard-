const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sw = fs.readFileSync(path.join(root, 'go-hub-sw.js'), 'utf8');
const release = JSON.parse(fs.readFileSync(path.join(root, 'RELEASE_MANIFEST.json'), 'utf8'));

test('GO Hub city roundtrip owns a fresh Centre-lineage cache generation and activates immediately', () => {
  assert.match(sw, /const CACHE_PREFIX = "go-hub-app-";/,
    'GO Hub requires the dedicated cache namespace');
  assert.match(sw, /v7-centre-city-roundtrip/,
    'GO City publication requires a fresh Centre-lineage cache generation');
  assert.match(sw, /skipWaiting\(\)/,
    'GO Hub intentionally activates the new worker');
  assert.match(sw, /clients\.claim\(\)/,
    'GO Hub intentionally claims active clients');
  assert.equal(release.serviceWorker.file, 'go-hub-sw.js');
  assert.equal(release.serviceWorker.autoActivate, true);
  assert.equal(release.serviceWorker.cachePrefix, 'go-hub-app-');
  assert.equal(release.serviceWorker.cacheGeneration, 'v7-centre-city-roundtrip');
  assert.doesNotMatch(sw, /ygph-standard-app-/);
});
