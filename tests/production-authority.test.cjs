"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("production HTML has one stylesheet authority", () => {
  const html = read("index.html");
  const stylesheets = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(stylesheets, ["normalpocket-current.css"]);
  assert.doesNotMatch(html, /href="flow-era\.css"/);
  assert.doesNotMatch(html, /href="metropolis-v4\.css"/);
});

test("production HTML loads the structural bootstrap after legacy compatibility runtime", () => {
  const html = read("index.html");
  const legacyIndex = html.indexOf('<script src="metropolis-v4.js"></script>');
  const currentIndex = html.indexOf('<script type="module" src="src/current-bootstrap.mjs"></script>');
  assert.ok(legacyIndex >= 0);
  assert.ok(currentIndex > legacyIndex);
});

test("visible production branding contains no stale 1.2.0 version", () => {
  const html = read("index.html");
  assert.doesNotMatch(html, /NormalPocket 1\.2\.0/);
  assert.match(html, /NormalPocket 1\.3\.1/);
});
