const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const metropolis = fs.readFileSync(path.join(root, 'metropolis-v4.js'), 'utf8');
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

test('Calendar is presented as a Finance subview, not a third app', () => {
  has(/title:\s*"กำหนดชำระและคิว"/, 'internal calendar view must be named as finance queue work');
  has(/english:\s*"FINANCE QUEUE"/, 'internal calendar view must be labelled as a finance subview');
  has(/const pageTheme = normalized === "calendar" \? "ledger" : normalized;/, 'calendar subview must inherit Finance visual identity');
  has(/normalized === "calendar" \? "ledger" : "home"/, 'back navigation from the queue must return to Finance');
});

test('pending work entry point is moved into the Finance page', () => {
  has(/const ledgerPage = document\.getElementById\("ledgerPage"\);/, 'launcher setup must locate the Finance page');
  has(/ledgerActionRow\?\.after\(hubCard\)/, 'pending-work card must be inserted into Finance');
  has(/งานการเงินที่ยังไม่จบ/, 'pending-work card must use finance ownership wording');
  has(/เปิดกำหนดชำระและคิว/, 'queue entry button must be framed as a Finance action');
});

test('finance consolidation ships in a fresh PWA cache generation', () => {
  assert.match(sw, /const RELEASE_ID = "v1\.3\.1-20260822-r7-finance-consolidation";/, 'service worker release must change when cached UI assets change');
  assert.match(sw, /"metropolis-v4\.js"/, 'finance UI layer must remain in the precached app shell');
  assert.doesNotMatch(sw, /const RELEASE_ID = "v1\.3\.1-20260812-r6-mobile-polish";/, 'old cache generation must not remain current after the finance UX release');
});
