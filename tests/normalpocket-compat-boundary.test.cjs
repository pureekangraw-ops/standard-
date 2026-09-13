"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("NormalPocket compatibility lives outside GO Hub foundation", () => {
  assert.equal(fs.existsSync(path.join(root, "normalpocket-compat.js")), true,
    "normalpocket-compat.js must isolate legacy behavior");

  const compat = read("normalpocket-compat.js");
  const hub = read("go-hub-foundation.js");

  assert.match(compat, /domain\.js/);
  assert.match(compat, /vault\.js/);
  assert.doesNotMatch(hub, /domain\.js/);
  assert.doesNotMatch(hub, /vault\.js/);
});

test("compatibility facade exports injected ports for the neutral Hub controller", () => {
  const compat = read("normalpocket-compat.js");
  assert.match(compat, /createNormalPocketPorts/);
  assert.match(compat, /applyCommand/);
  assert.match(compat, /commitState/);
});

test("legacy storage identity remains owned by compatibility code, not Hub core", () => {
  const compat = read("normalpocket-compat.js");
  const hub = read("go-hub-foundation.js");
  assert.match(compat, /ygph-standard-secure|commitState/);
  assert.doesNotMatch(hub, /ygph-standard-secure/);
});
