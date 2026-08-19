"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("current live projection consumes readonly runtime port and current selectors", () => {
  const source = read("src/projection/live-projection.mjs");
  assert.match(source, /NormalPocketRuntimePort/);
  assert.match(source, /selectLiveCalendar/);
  assert.match(source, /liveStatusSignal/);
  assert.doesNotMatch(source, /\bstate\b/);
  assert.doesNotMatch(source, /\bfindQueue\b/);
  assert.doesNotMatch(source, /\bfindSource\b/);
});

test("current live projection registers through YGPHRuntime hooks", () => {
  const source = read("src/projection/live-projection.mjs");
  assert.match(source, /YGPHRuntime\?\.register/);
  assert.match(source, /NORMALPOCKET_LIVE_PROJECTION/);
  assert.match(source, /afterRender/);
  assert.match(source, /afterPageChange/);
});

test("current bootstrap installs current live projection after compatibility runtime is ready", () => {
  const current = read("src/current-bootstrap.mjs");
  const ready = current.indexOf("NormalPocketRuntimeReady");
  const projection = current.indexOf("live-projection.mjs");
  assert.ok(ready >= 0 && projection > ready);
});
