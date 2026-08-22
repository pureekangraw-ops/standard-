const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const metropolis = fs.readFileSync(path.join(root, 'metropolis-v4.js'), 'utf8');
const metroCss = fs.readFileSync(path.join(root, 'metropolis-v4.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

function has(pattern, message) {
  assert.match(metropolis, pattern, message);
}

test('home launcher exposes only Store and Finance while retaining Calendar as an internal queue engine', () => {
  has(/const METROPOLIS_VISIBLE_APPS = \["store", "ledger"\];/, 'visible app contract must be Store + Finance only');
  has(/STORE · LEDGER/, 'launcher copy must show only the two visible domains');
  assert.doesNotMatch(metropolis, /calendarCard\s*=\s*document\.createElement/, 'launcher must not manufacture a third Calendar app card');
  assert.match(app, /calendar:\s*\[\]/, 'Calendar queue state must remain in the core data model');
  has(/pack\.connectedApps = \["STORE", "LEDGER", "CALENDAR"\];/, 'exchange compatibility must keep Calendar in the connected data contract');
});

test('Calendar surface is embedded into Finance and removed from visible navigation', () => {
  has(/function metropolisEmbedFinanceQueue\(\)/, 'Finance consolidation must have one explicit queue embedding step');
  has(/calendarPage\.classList\.remove\("page",\s*"active"\)/, 'Calendar must stop behaving like a standalone page');
  has(/calendarPage\.classList\.add\("finance-queue-section"\)/, 'Calendar content must become a Finance section');
  has(/ledgerPage\.appendChild\(calendarPage\)/, 'Finance must physically own the visible queue surface');
  has(/\.nav-btn\[data-page="calendar"\]/, 'visible Calendar nav entry must be explicitly removed');
  assert.match(metroCss, /\.metropolis-v4 \.nav-btn\[data-page="calendar"\]\{display:none!important\}/, 'CSS must defensively hide Calendar nav before runtime cleanup');
  assert.match(metroCss, /grid-template-columns:repeat\(auto-fit,minmax\(0,1fr\)\)!important/, 'remaining bottom navigation must reflow automatically');
});

test('all legacy Calendar routes land in Finance Queue', () => {
  has(/function metropolisInstallFinanceQueueRouting\(\)/, 'legacy Calendar routes must be normalized in one place');
  has(/if \(page === "calendar"\) \{/, 'routing layer must intercept Calendar requests');
  has(/coreShowPage\("ledger"\)/, 'Calendar requests must activate Finance');
  has(/document\.getElementById\("calendarPage"\)\?\.scrollIntoView/, 'Calendar requests must scroll to the embedded queue');
});

test('Finance Queue keeps Finance identity and copy', () => {
  has(/title:\s*"กำหนดชำระและคิว"/, 'internal queue must retain Finance-facing title');
  has(/english:\s*"FINANCE QUEUE"/, 'internal queue must retain Finance-facing English label');
  has(/queueHero\.classList\.remove\("calendar"\)/, 'queue hero must shed standalone Calendar identity');
  has(/queueHero\.classList\.add\("ledger"\)/, 'queue hero must inherit Finance identity');
});

test('Finance uses a brighter soft-green visual system', () => {
  assert.match(metroCss, /--metro-bg:#f8fbf9;/, 'Metro background must be brighter');
  assert.match(metroCss, /--metro-ledger:#2f7d5b;/, 'Finance accent must use soft green rather than purple');
  assert.match(metroCss, /\.metropolis-v4 \.shell\{background:#f8fbf9!important;/, 'app shell must remain bright even over older base styles');
  assert.match(metroCss, /\.metropolis-v4 \.finance-queue-section/, 'embedded Finance Queue must have dedicated bright-surface styling');
  assert.match(metroCss, /background:linear-gradient\(145deg,#ffffff,#edf8f2\)!important/, 'Finance hero must use a bright soft-green gradient');
});

test('finance consolidation ships in a fresh PWA cache generation without changing the 1.3.1 release identity', () => {
  assert.match(sw, /const RELEASE_ID = "v1\.3\.1-20260812-r6-mobile-polish";/, '1.3.1 release identity must remain stable');
  assert.match(sw, /const CACHE_GENERATION = "v1\.3\.1-20260822-r8-finance-unified-light";/, 'visible Finance consolidation must receive a fresh cache generation');
  assert.match(sw, /const CURRENT_CACHE = `\$\{APP_CACHE_PREFIX\}\$\{CACHE_GENERATION\}`;/, 'current cache must use the cache generation rather than the release label');
  assert.match(sw, /"metropolis-v4\.js"/, 'finance UI layer must remain in the precached app shell');
  assert.match(sw, /"metropolis-v4\.css"/, 'finance theme layer must remain in the precached app shell');
});
