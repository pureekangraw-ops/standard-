"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("legacy app exposes a bounded readonly runtime port instead of raw state", () => {
  const source = read("app.js");
  assert.match(source, /NormalPocketRuntimePort/);
  assert.match(source, /getStateSnapshot/);
  assert.match(source, /structuredClone\(state\)/);
  assert.doesNotMatch(source, /NormalPocketRuntimePort[^\n]*state\s*:/);
  assert.doesNotMatch(source, /globalThis\.state\s*=/);
});

test("runtime port exposes only projection-safe lookup helpers", () => {
  const source = read("app.js");
  assert.match(source, /findSourceSnapshot/);
  assert.match(source, /findQueueSnapshot/);
  assert.doesNotMatch(source, /setState/);
  assert.doesNotMatch(source, /mutateState/);
  assert.doesNotMatch(source, /replaceState/);
});
