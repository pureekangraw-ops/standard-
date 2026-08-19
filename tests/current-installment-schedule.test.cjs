"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const legacy = require("../metropolis-r5-2.js");
const loadCurrent = () => import(pathToFileURL(path.join(root, "src/finance/installment-schedule.mjs")).href);

test("current installment schedule preserves r5-2 weekly and monthly date behavior", async () => {
  const current = await loadCurrent();
  for (const sample of [
    ["2026-08-16", 4, "WEEKLY"],
    ["2026-01-31", 4, "MONTHLY"],
    ["2028-02-29", 3, "MONTHLY"]
  ]) {
    assert.deepEqual(current.scheduleDueDates(...sample), legacy.scheduleDueDates(...sample));
  }
});

test("current installment schedule preserves total and interval shift behavior", async () => {
  const current = await loadCurrent();
  assert.equal(current.totalFromInstallment(227500, 6), legacy.totalFromInstallment(227500, 6));
  assert.equal(current.shiftDueOneInterval("2026-08-16", "WEEKLY"), legacy.shiftDueOneInterval("2026-08-16", "WEEKLY"));
  assert.equal(current.shiftDueOneInterval("2026-01-31", "MONTHLY"), legacy.shiftDueOneInterval("2026-01-31", "MONTHLY"));
});

test("current installment derivation preserves saved amount and due overrides", async () => {
  const current = await loadCurrent();
  const obligation = {
    scheduleMode: "PER_INSTALLMENT",
    scheduleFrequency: "MONTHLY",
    installmentCount: 3,
    installmentAmountSatang: 10000,
    firstDue: "2026-01-31",
    installments: [{ number: 2, amountSatang: 12000, due: "2026-03-05" }]
  };
  assert.deepEqual(current.derivePerInstallmentSchedule(obligation), legacy.derivePerInstallmentSchedule(obligation));
});

test("finance boundary publishes current schedule authority", async () => {
  const { createFinanceBoundary } = await import(pathToFileURL(path.join(root, "src/finance/finance-boundary.mjs")).href);
  const finance = createFinanceBoundary();
  assert.equal(typeof finance.schedule.scheduleDueDates, "function");
  assert.equal(typeof finance.schedule.totalFromInstallment, "function");
  assert.equal(Object.isFrozen(finance.schedule), true);
});
