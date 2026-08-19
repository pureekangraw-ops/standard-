"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("current installment UI adapter delegates business transitions to Finance modules", () => {
  const source = read("normalpocket-installment-ui.js");
  assert.match(source, /installment-operations\.mjs/);
  assert.match(source, /settleInstallmentsEarly/);
  assert.match(source, /reconcileInstallmentSchedule/);
  assert.match(source, /editInstallmentSchedule/);
  assert.match(source, /skipInstallmentInterval/);
  assert.doesNotMatch(source, /function scheduleDueDates/);
  assert.doesNotMatch(source, /function recomputeObligation/);
});

test("production runtime loads current installment UI instead of metropolis r5-2", () => {
  const runtime = read("normalpocket-runtime.js");
  assert.match(runtime, /normalpocket-installment-ui\.js/);
  assert.doesNotMatch(runtime, /metropolis-r5-2\.js/);
});
