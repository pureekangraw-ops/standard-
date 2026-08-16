"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("production HTML has one current runtime authority entry after base compatibility scripts", () => {
  const html = read("index.html");
  assert.match(html, /<script type="module" src="src\/current-bootstrap\.mjs"><\/script>/);
  assert.doesNotMatch(html, /<script src="normalpocket-runtime\.js"><\/script>/);
  for (const legacyDynamic of ["metropolis-r5.js", "metropolis-r5-2.js", "metropolis-r5-3.js", "normalpocket-bootstrap.js"]) {
    assert.doesNotMatch(html, new RegExp(`<script[^>]+${legacyDynamic.replaceAll(".", "\\.")}`));
  }
  assert.doesNotMatch(html, /metropolis-r5-1\.js/);
  assert.doesNotMatch(html, /metropolis-r5-4\.js/);
});

test("current bootstrap owns compatibility loader and waits for it before structural bridge", () => {
  const current = read("src/current-bootstrap.mjs");
  assert.match(current, /import\("\.\.\/normalpocket-runtime\.js"\)/);
  assert.match(current, /NormalPocketRuntimeReady/);
});

test("compatibility loader owns deterministic retained runtime order only", () => {
  const runtime = read("normalpocket-runtime.js");
  const ordered = [
    "normalpocket-state-port.js",
    "normalpocket-store-port.js",
    "normalpocket-sale-ui.js",
    "normalpocket-finance-port.js",
    "normalpocket-installment-ui.js",
    "normalpocket-import-bridge.js",
    "normalpocket-report-bridge.js",
    "normalpocket-flow-calendar-bridge.js",
    "normalpocket-live-source-bridge.js",
    "normalpocket-bootstrap.js"
  ];
  let previous = -1;
  for (const file of ordered) {
    const index = runtime.indexOf(file);
    assert.ok(index > previous, `${file} must appear after previous runtime layer`);
    previous = index;
  }
  assert.doesNotMatch(runtime, /metropolis-r5(?:-[1-4])?\.js/);
  assert.doesNotMatch(runtime, /current-bootstrap\.mjs/);
});

test("service-worker bootstrap owns service worker only, not application runtime layers", () => {
  const bootstrap = read("sw-bootstrap.js");
  assert.match(bootstrap, /serviceWorker\.register\("sw\.js"/);
  assert.doesNotMatch(bootstrap, /metropolis-r5\.js/);
  assert.doesNotMatch(bootstrap, /normalpocket-bootstrap\.js/);
});
