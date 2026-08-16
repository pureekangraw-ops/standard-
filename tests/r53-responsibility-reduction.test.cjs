"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("r5-3 no longer owns projection effects migrated to Current", () => {
  const source = read("metropolis-r5-3.js");
  for (const migrated of ["paintMonthGrid", "paintQueueCards", "paintHomeTasks", "hideCancelledRecordCards", "syncLiveCounters", "ensureInlineDot"]) {
    assert.doesNotMatch(source, new RegExp(`function ${migrated}\\b`), `${migrated} must be Current-owned`);
  }
});

test("r5-3 retains only compatibility wrappers not yet migrated", () => {
  const source = read("metropolis-r5-3.js");
  assert.match(source, /function renderLiveSourceLists/);
  assert.match(source, /function patchHistoryHtml/);
  assert.match(source, /function patchFlowCalendarItems/);
  assert.match(source, /STANDARD_R53_LIVE_STATUS/);
});
