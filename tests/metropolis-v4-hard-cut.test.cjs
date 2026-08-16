"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("production no longer loads metropolis-v4 compatibility UI", () => {
  const index = read("index.html");
  assert.doesNotMatch(index, /<script src="metropolis-v4\.js"><\/script>/);
});

test("current bootstrap owns release runtime hooks without legacy metropolis bridge", () => {
  const current = read("src/current-bootstrap.mjs");
  assert.doesNotMatch(current, /installLegacyReleaseBridge/);
  assert.doesNotMatch(current, /metropolisStampPackage|metropolisStampAudit|metropolisApplyBranding|metropolisApplyPage/);
  assert.match(current, /YGPHRuntime\.register/);
  assert.match(current, /restampPackage/);
  assert.match(current, /restampAudit/);
});
