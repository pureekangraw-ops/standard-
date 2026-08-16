"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("FINANCE owner contains obligation and reversal implementation", () => {
  const source = read("src/domains/finance-owner.mjs");
  assert.match(source, /LEDGER_OBLIGATION_ADD/);
  assert.match(source, /TRANSACTION_REVERSE/);
  assert.match(source, /ledger\.obligations/);
  assert.match(source, /ledger\.transactions/);
});

test("CALENDAR owner contains completion and cancellation orchestration", () => {
  const source = read("src/domains/calendar-owner.mjs");
  assert.match(source, /CALENDAR_COMPLETE/);
  assert.match(source, /CALENDAR_CANCEL/);
  assert.match(source, /CONFIRM_STORE_RECEIPT/);
  assert.match(source, /PAY_OBLIGATION/);
});

test("domain dispatcher delegates finance and calendar commands", () => {
  const source = read("domain.js");
  assert.match(source, /applyFinanceCommand/);
  assert.match(source, /applyCalendarCommand/);
  for (const type of ["LEDGER_OBLIGATION_ADD", "TRANSACTION_REVERSE", "CALENDAR_COMPLETE", "CALENDAR_CANCEL"]) {
    assert.doesNotMatch(source, new RegExp(`case ['\\\"]${type}['\\\"]`));
  }
});
