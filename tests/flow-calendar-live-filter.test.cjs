"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("bounded calendar bridge applies live source filtering without editing flow-era", () => {
  const source = read("normalpocket-flow-calendar-bridge.js");
  assert.match(source, /flowCalendarItems/);
  assert.match(source, /NormalPocketRuntimePort/);
  assert.match(source, /findSourceSnapshot/);
  assert.match(source, /CANCELLED/);
  assert.doesNotMatch(source, /state\s*=/);
});

test("runtime loads calendar bridge before live source bridge", () => {
  const source = read("normalpocket-runtime.js");
  const calendarBridge = source.indexOf('"normalpocket-flow-calendar-bridge.js"');
  const sourceBridge = source.indexOf('"normalpocket-live-source-bridge.js"');
  assert.ok(calendarBridge >= 0 && sourceBridge > calendarBridge);
  assert.doesNotMatch(source, /metropolis-r5-3\.js/);
});

test("r5-3 source evidence no longer patches flowCalendarItems", () => {
  const source = read("metropolis-r5-3.js");
  assert.doesNotMatch(source, /function patchFlowCalendarItems/);
  assert.doesNotMatch(source, /__YGPH_R53_FLOW_ITEMS_PATCHED__/);
});
