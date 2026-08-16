"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("production HTML has one runtime authority entry after base compatibility scripts", () => {
  const html = read("index.html");
  assert.match(html, /<script src="normalpocket-runtime\.js"><\/script>/);
  assert.doesNotMatch(html, /<script type="module" src="src\/current-bootstrap\.mjs"><\/script>/);
  for (const legacyDynamic of ["metropolis-r5.js", "metropolis-r5-1.js", "metropolis-r5-2.js", "metropolis-r5-3.js", "metropolis-r5-4.js", "normalpocket-bootstrap.js"]) {
    assert.doesNotMatch(html, new RegExp(`<script[^>]+${legacyDynamic.replaceAll(".", "\\.")}`));
  }
});

test("current runtime owns deterministic compatibility order and ends at structural bootstrap", () => {
  const runtime = read("normalpocket-runtime.js");
  const ordered = [
    "metropolis-r5.js",
    "metropolis-r5-1.js",
    "metropolis-r5-2.js",
    "metropolis-r5-3.js",
    "metropolis-r5-4.js",
    "normalpocket-bootstrap.js",
    "src/current-bootstrap.mjs"
  ];
  let previous = -1;
  for (const file of ordered) {
    const index = runtime.indexOf(file);
    assert.ok(index > previous, `${file} must appear after previous runtime layer`);
    previous = index;
  }
});

test("service-worker bootstrap owns service worker only, not application runtime layers", () => {
  const bootstrap = read("sw-bootstrap.js");
  assert.match(bootstrap, /serviceWorker\.register\("sw\.js"/);
  assert.doesNotMatch(bootstrap, /metropolis-r5\.js/);
  assert.doesNotMatch(bootstrap, /normalpocket-bootstrap\.js/);
});
