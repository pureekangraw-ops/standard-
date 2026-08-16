"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("flow calendar items apply live source filtering at the producer", () => {
  const source = read("flow-era.js");
  const start = source.indexOf("function flowCalendarItems()");
  const end = source.indexOf("function flowRenderCalendarFocus()", start);
  assert.ok(start >= 0 && end > start);
  const body = source.slice(start, end);
  assert.match(body, /NormalPocketRuntimePort/);
  assert.match(body, /findSourceSnapshot/);
  assert.doesNotMatch(body, /return items;\s*}/);
});

test("r5-3 no longer patches flowCalendarItems", () => {
  const source = read("metropolis-r5-3.js");
  assert.doesNotMatch(source, /function patchFlowCalendarItems/);
  assert.doesNotMatch(source, /__YGPH_R53_FLOW_ITEMS_PATCHED__/);
});
