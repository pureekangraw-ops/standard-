"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("Store sale operation owns shipping-aware sale effects", async () => {
  const ops = await import(`file://${path.join(root, "src/store/sale-operations.mjs")}`);
  assert.equal(typeof ops.buildSaleEffects, "function");
  const result = ops.buildSaleEffects({
    id: "SALE-1", qty: 2, unitPriceSatang: 5000, receivedSatang: 6000,
    shippingCostSatang: 1000, customer: "A", contact: "", due: "2026-08-20", note: "",
    costSatang: 4000, date: "2026-08-16", at: "2026-08-16T09:00:00.000Z"
  });
  assert.equal(result.sale.totalSatang, 10000);
  assert.equal(result.sale.outstandingSatang, 4000);
  assert.equal(result.sale.netCashEffectSatang, 5000);
  assert.deepEqual(result.transactions.map(item => [item.direction, item.amountSatang, item.subtype]), [
    ["IN", 6000, "SALE_INITIAL_RECEIPT"],
    ["OUT", 1000, "SALE_SHIPPING_COST"]
  ]);
  assert.equal(result.calendarEffects.length, 1);
  assert.equal(result.calendarEffects[0].owner, "CALENDAR");
});

test("legacy import and report behavior have bounded replacements", () => {
  const importer = read("normalpocket-import-bridge.js");
  const report = read("normalpocket-report-bridge.js");
  assert.match(importer, /IMPORTED/);
  assert.match(importer, /needsLocalVerification/);
  assert.match(importer, /repairLegacyInstallments/);
  assert.match(report, /receivableAt/);
  assert.match(report, /SALE_SHIPPING_COST/);
});

test("production runtime no longer loads metropolis r5", () => {
  const runtime = read("normalpocket-runtime.js");
  assert.match(runtime, /normalpocket-store-port\.js/);
  assert.match(runtime, /normalpocket-sale-ui\.js/);
  assert.match(runtime, /normalpocket-import-bridge\.js/);
  assert.match(runtime, /normalpocket-report-bridge\.js/);
  assert.doesNotMatch(runtime, /metropolis-r5\.js/);
});
