"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("state port adapter exposes snapshots instead of raw mutable state", () => {
  const source = read("normalpocket-state-port.js");
  assert.match(source, /NormalPocketRuntimePort/);
  assert.match(source, /getStateSnapshot/);
  assert.match(source, /structuredClone\(state\)/);
  assert.doesNotMatch(source, /state\s*:/);
  assert.doesNotMatch(source, /globalThis\.state\s*=/);
});

test("state port exposes only projection-safe lookup helpers", () => {
  const source = read("normalpocket-state-port.js");
  assert.match(source, /findSourceSnapshot/);
  assert.match(source, /findQueueSnapshot/);
  assert.doesNotMatch(source, /setState/);
  assert.doesNotMatch(source, /mutateState/);
  assert.doesNotMatch(source, /replaceState/);
});

test("current runtime loads state port before retained projection layers", () => {
  const runtime = read("normalpocket-runtime.js");
  const port = runtime.indexOf("normalpocket-state-port.js");
  const r5 = runtime.indexOf("metropolis-r5.js");
  const r53 = runtime.indexOf("metropolis-r5-3.js");
  assert.ok(port >= 0 && port < r5 && port < r53);
});
