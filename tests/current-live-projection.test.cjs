"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const legacy = require("../metropolis-r5-3.js");

async function current() {
  return import("../src/projection/live-records.mjs");
}

test("current status signals preserve r5-3 live semantics", async () => {
  const next = await current();
  const cases = [
    [{ status: "CANCELLED", due: "2026-08-10" }, "2026-08-09"],
    [{ status: "COMPLETED", due: "2026-08-08" }, "2026-08-09"],
    [{ status: "OPEN", due: "2026-08-08" }, "2026-08-09"],
    [{ status: "OPEN", due: "2026-08-10" }, "2026-08-09"]
  ];
  for (const [item, today] of cases) {
    assert.equal(next.statusSignal(item, today), legacy.statusSignal(item, today));
  }
});

test("current live record selector preserves input and hides cancelled", async () => {
  const next = await current();
  const records = [
    { id: "open", status: "OPEN" },
    { id: "cancelled", status: "CANCELLED" },
    { id: "done", status: "COMPLETED" }
  ];
  const before = structuredClone(records);
  assert.deepEqual(next.selectLiveRecords(records), legacy.selectLiveRecords(records));
  assert.deepEqual(records, before);
});

test("current live calendar selector hides cancelled source records", async () => {
  const next = await current();
  const calendar = [
    { id: "live", sourceId: "live-source", status: "OPEN", due: "2026-08-09" },
    { id: "queue-cancelled", sourceId: "live-source", status: "CANCELLED", due: "2026-08-09" },
    { id: "source-cancelled", sourceId: "cancelled-source", status: "OPEN", due: "2026-08-09" }
  ];
  const sourceStatusOf = item => item.sourceId === "cancelled-source" ? "CANCELLED" : "OPEN";
  assert.deepEqual(
    next.selectLiveCalendar(calendar, sourceStatusOf, "2026-08-09"),
    legacy.selectLiveCalendar(calendar, sourceStatusOf, "2026-08-09")
  );
});
