"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../highway-gate.js");
const schedule = require("../metropolis-r5-2.js");
const live = require("../metropolis-r5-3.js");
const dashboard = require("../metropolis-r5-4.js");
const sw = require("../sw.js");

test("STANDARD core loads retained domains and rejects unknown schema", () => {
  assert.equal(core.STATE_SCHEMA, 4);
  assert.equal(core.compatibilityFor(4).mode, "LOAD");
  assert.equal(core.compatibilityFor(99).supported, false);

  const state = {
    store: {
      sales: [{ id: "SALE-1" }],
      purchases: [],
      withdrawals: []
    },
    ledger: {
      obligations: [{ id: "OBL-1" }],
      transactions: []
    }
  };
  assert.equal(core.findSource(state, "STORE", "SALE-1")?.id, "SALE-1");
  assert.equal(core.findSource(state, "LEDGER", "OBL-1")?.id, "OBL-1");
  assert.equal(core.findSource(state, "RIDE", "RIDE-1"), null);
});

test("STANDARD installment schedule keeps weekly and month-end behavior", () => {
  assert.deepEqual(schedule.scheduleDueDates("2026-08-09", 3, "WEEKLY"), [
    "2026-08-09",
    "2026-08-16",
    "2026-08-23"
  ]);
  assert.deepEqual(schedule.scheduleDueDates("2026-01-31", 3, "MONTHLY"), [
    "2026-01-31",
    "2026-02-28",
    "2026-03-31"
  ]);
  assert.equal(schedule.totalFromInstallment(300000, 3), 900000);
});

test("STANDARD live selectors hide cancelled records without mutating durable input", () => {
  const records = [
    { id: "open", status: "OPEN" },
    { id: "cancelled", status: "CANCELLED" },
    { id: "done", status: "COMPLETED" }
  ];
  const snapshot = structuredClone(records);
  assert.deepEqual(live.selectLiveRecords(records).map(item => item.id), ["open", "done"]);
  assert.deepEqual(records, snapshot);

  const calendar = [
    { id: "live", sourceId: "live-source", status: "OPEN", due: "2026-08-09" },
    { id: "queue-cancelled", sourceId: "live-source", status: "CANCELLED", due: "2026-08-09" },
    { id: "source-cancelled", sourceId: "cancelled-source", status: "OPEN", due: "2026-08-09" }
  ];
  const selected = live.selectLiveCalendar(
    calendar,
    item => item.sourceId === "cancelled-source" ? "CANCELLED" : "OPEN",
    "2026-08-09"
  );
  assert.deepEqual(selected.map(item => item.id), ["live"]);
});

test("STANDARD dashboard uses explicit cash and retained Calendar directions", () => {
  const previousDirection = global.queueDirection;
  const previousFindSource = global.findSource;
  global.queueDirection = item => item.direction || "OTHER";
  global.findSource = (_source, sourceId) => sourceId === "cancelled-source" ? { status: "CANCELLED" } : { status: "OPEN" };
  try {
    const metrics = dashboard.r54Metrics({
      store: { stockQty: 7 },
      calendar: [
        { source: "LEDGER", sourceId: "due", status: "OPEN", direction: "OUT", due: "2026-08-10" },
        { source: "LEDGER", sourceId: "late", status: "OPEN", direction: "OUT", due: "2026-08-08" },
        { source: "STORE", sourceId: "incoming", status: "OPEN", direction: "IN", due: "2026-08-11" },
        { source: "LEDGER", sourceId: "cancelled-source", status: "OPEN", direction: "OUT", due: "2026-08-12" }
      ]
    }, "2026-08-09", 12345);

    assert.equal(metrics.cashSatang, 12345);
    assert.equal(metrics.stockQty, 7);
    assert.equal(metrics.overdue, 1);
    assert.equal(metrics.pendingOut, 2);
  } finally {
    if (previousDirection === undefined) delete global.queueDirection; else global.queueDirection = previousDirection;
    if (previousFindSource === undefined) delete global.findSource; else global.findSource = previousFindSource;
  }
});

test("STANDARD offline shell represents the current release and rejects incomplete precache readback", () => {
  assert.equal(sw.RELEASE_ID, "v1.1.0-20260812-r3-product-catalog");
  for (const file of ["index.html", "highway-gate.js", "app.js", "normalpocket-catalog-core.js", "normalpocket-products.js", "metropolis-r5-4.js", "icon-192.png", "icon-512.png"]) {
    assert.ok(sw.APP_SHELL.includes(file), `${file} must be available offline`);
  }
  assert.equal(sw.assertShellReadback(sw.APP_SHELL.map(() => ({ ok: true }))), true);
  assert.throws(() => sw.assertShellReadback([{ ok: true }]), /ไฟล์ออฟไลน์ไม่ครบ/);
});
