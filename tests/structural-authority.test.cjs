"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

async function load(path) {
  return import(path);
}

test("NormalPocket exposes one explicit authority map", async () => {
  const { NORMALPOCKET_AUTHORITY } = await load("../src/architecture/authority.mjs");
  assert.equal(NORMALPOCKET_AUTHORITY.STORE, "STORE");
  assert.equal(NORMALPOCKET_AUTHORITY.FINANCE, "FINANCE");
  assert.equal(NORMALPOCKET_AUTHORITY.CALENDAR, "CALENDAR");
  assert.equal(NORMALPOCKET_AUTHORITY.SHELL, "SHELL");
});

test("shell is navigation/projection authority, never business mutation authority", async () => {
  const { createShellBoundary } = await load("../src/shell/shell-boundary.mjs");
  const shell = createShellBoundary({ navigate: page => page });
  assert.equal(shell.navigate("store"), "store");
  assert.equal(shell.mutate, undefined);
  assert.equal(shell.writeFinance, undefined);
  assert.equal(shell.writeStore, undefined);
  assert.equal(shell.writeCalendar, undefined);
});

test("calendar can schedule owner commands but cannot write money truth", async () => {
  const { createCalendarBoundary } = await load("../src/calendar/calendar-boundary.mjs");
  const calendar = createCalendarBoundary();
  const queued = calendar.schedule({ owner: "FINANCE", command: "PAY_OBLIGATION", dueDate: "2026-08-20" });
  assert.equal(queued.owner, "FINANCE");
  assert.equal(queued.command, "PAY_OBLIGATION");
  assert.equal(calendar.writeBalance, undefined);
  assert.equal(calendar.credit, undefined);
  assert.equal(calendar.debit, undefined);
});

test("finance and store boundaries reject commands owned by another domain", async () => {
  const { createFinanceBoundary } = await load("../src/finance/finance-boundary.mjs");
  const { createStoreBoundary } = await load("../src/store/store-boundary.mjs");
  const finance = createFinanceBoundary();
  const store = createStoreBoundary();

  assert.throws(() => finance.accept({ owner: "STORE", type: "SALE_CREATE" }), /FINANCE/);
  assert.throws(() => store.accept({ owner: "FINANCE", type: "EXPENSE_CREATE" }), /STORE/);
  assert.deepEqual(finance.accept({ owner: "FINANCE", type: "EXPENSE_CREATE" }), { owner: "FINANCE", type: "EXPENSE_CREATE" });
  assert.deepEqual(store.accept({ owner: "STORE", type: "SALE_CREATE" }), { owner: "STORE", type: "SALE_CREATE" });
});
