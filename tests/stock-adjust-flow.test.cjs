"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => require("../normalpocket-simple-flow.js");

test("stock adjustment maps simple reasons to predictable deltas", () => {
  const flow = load();
  assert.equal(flow.stockAdjustmentDelta("นับใหม่", 7, 10), -3);
  assert.equal(flow.stockAdjustmentDelta("คืนสินค้า", 2, 10), 2);
  assert.equal(flow.stockAdjustmentDelta("เสีย", 2, 10), -2);
  assert.equal(flow.stockAdjustmentDelta("หาย", 1, 10), -1);
  assert.equal(flow.stockAdjustmentDelta("ใช้เอง", 3, 10), -3);
  assert.equal(flow.stockAdjustmentDelta("อื่นๆ", -4, 10), -4);
  assert.throws(() => flow.stockAdjustmentDelta("อื่นๆ", 0, 10), /จำนวน/);
});
