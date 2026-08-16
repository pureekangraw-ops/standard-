"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

async function selectors() {
  return import("../src/projection/live-records.mjs");
}

test("current live counters exclude completed and cancelled truth", async () => {
  const { deriveLiveCounters } = await selectors();
  const rows = [
    { item: { status: "OPEN", due: "2026-08-17" }, sourceStatus: "OPEN", direction: "IN", integrityState: "TRUSTED" },
    { item: { status: "OPEN", due: "2026-08-17" }, sourceStatus: "OPEN", direction: "OUT", integrityState: "TRUSTED" },
    { item: { status: "VERIFY", due: "2026-08-17" }, sourceStatus: "OPEN", direction: "OUT", integrityState: "VERIFY" },
    { item: { status: "COMPLETED", due: "2026-08-16" }, sourceStatus: "OPEN", direction: "IN", integrityState: "TRUSTED" },
    { item: { status: "OPEN", due: "2026-08-17" }, sourceStatus: "CANCELLED", direction: "OUT", integrityState: "TRUSTED" }
  ];
  assert.deepEqual(deriveLiveCounters(rows, "2026-08-16"), { incoming: 1, outgoing: 2, verify: 1 });
});

test("state port supplies projection metadata without exposing mutation", () => {
  const source = read("normalpocket-state-port.js");
  assert.match(source, /getCalendarProjectionSnapshot/);
  assert.match(source, /queueDirection/);
  assert.match(source, /integrityGate/);
  assert.doesNotMatch(source, /setState|mutateState|replaceState/);
});

test("current projection owns live counter rendering without legacy helper access", () => {
  const source = read("src/projection/live-projection.mjs");
  assert.match(source, /deriveLiveCounters/);
  assert.match(source, /getCalendarProjectionSnapshot/);
  assert.match(source, /syncLiveCounters/);
  assert.doesNotMatch(source, /\bqueueDirection\b|\bintegrityGate\b/);
});
