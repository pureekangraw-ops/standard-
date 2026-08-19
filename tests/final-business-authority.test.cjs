"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("Current Store inventory operations own purchase and withdrawal effects", async () => {
  const ops = await import(`file://${path.join(root, "src/store/inventory-operations.mjs")}`);
  assert.equal(typeof ops.buildPurchaseEffects, "function");
  assert.equal(typeof ops.buildWithdrawalRecord, "function");
  const purchase = ops.buildPurchaseEffects({ id: "BUY-1", qty: 3, costSatang: 4500, due: "2026-08-20", date: "2026-08-16", at: "2026-08-16T10:00:00.000Z", productId: "P1", productName: "เสื้อ" });
  assert.equal(purchase.purchase.costSatang, 4500);
  assert.equal(purchase.transactions[0].owner, "FINANCE");
  assert.equal(purchase.calendarEffects[0].owner, "CALENDAR");
  const withdrawal = ops.buildWithdrawalRecord({ id: "WD-1", qty: 1, costSatang: 1000, reason: "ใช้เอง", date: "2026-08-16", at: "2026-08-16T10:00:00.000Z", productId: "P1", productName: "เสื้อ" });
  assert.equal(withdrawal.qty, 1);
  assert.equal(withdrawal.costSatang, 1000);
});

test("post-bootstrap Store stock UI replaces catalog direct purchase and withdrawal handlers", () => {
  const source = read("normalpocket-catalog-stock-ui.js");
  assert.match(source, /buildPurchaseEffects/);
  assert.match(source, /buildWithdrawalRecord/);
  assert.match(source, /applyPurchaseEffects/);
  assert.match(source, /applyWithdrawalRecord/);
  const runtime = read("normalpocket-runtime.js");
  const ready = runtime.indexOf("await globalThis.NormalPocketCompatibilityReady");
  const stock = runtime.indexOf('loadClassicScript("normalpocket-catalog-stock-ui.js")');
  assert.ok(stock > ready);
});

test("Current Finance direct UI owns other income and expense after app compatibility handlers", () => {
  const source = read("normalpocket-finance-direct-ui.js");
  assert.match(source, /addOtherIncomeBtn/);
  assert.match(source, /addExpenseBtn/);
  assert.match(source, /NormalPocketFinancePort/);
  assert.doesNotMatch(source, /state\.ledger\.transactions\.push/);
  const runtime = read("normalpocket-runtime.js");
  const ready = runtime.indexOf("await globalThis.NormalPocketCompatibilityReady");
  const finance = runtime.indexOf('loadClassicScript("normalpocket-finance-direct-ui.js")');
  assert.ok(finance > ready);
});
